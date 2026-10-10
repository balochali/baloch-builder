//! Takes a consistent copy of the live SQLite database.
//!
//! The database runs in WAL mode, so copying the `.db` file while the app is open could miss
//! recent changes or produce a damaged copy. `VACUUM INTO` asks SQLite itself to write a
//! complete, consistent snapshot, which is then checked before it is used.

use sqlx::{sqlite::SqliteConnectOptions, Connection, Row, SqliteConnection};
use std::{fs, path::Path, time::Duration};

fn options(path: &Path) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(false)
        .busy_timeout(Duration::from_secs(10))
}

pub async fn snapshot_database(db_path: &Path, dest: &Path) -> Result<(), String> {
    if !db_path.is_file() {
        return Err("The application database could not be found.".into());
    }
    let dest_text = dest
        .to_str()
        .ok_or("The backup location is not valid text.")?;
    if dest_text.contains('\'') {
        return Err("The backup location contains an unsupported character.".into());
    }
    if dest.exists() {
        fs::remove_file(dest).map_err(|e| e.to_string())?;
    }

    let mut connection = SqliteConnection::connect_with(&options(db_path))
        .await
        .map_err(|e| format!("Could not open the database: {e}"))?;
    let outcome = sqlx::query(&format!("VACUUM INTO '{dest_text}'"))
        .execute(&mut connection)
        .await
        .map_err(|e| format!("Could not copy the database: {e}"));
    let _ = connection.close().await;
    outcome?;

    verify_snapshot(dest).await
}

/// Opens the snapshot read-only and runs SQLite's integrity check on it.
async fn verify_snapshot(path: &Path) -> Result<(), String> {
    let mut connection = SqliteConnection::connect_with(&options(path).read_only(true))
        .await
        .map_err(|e| format!("The database copy could not be opened: {e}"))?;
    let row = sqlx::query("PRAGMA integrity_check")
        .fetch_one(&mut connection)
        .await
        .map_err(|e| format!("The database copy could not be checked: {e}"))?;
    let verdict: String = row.try_get(0).map_err(|e| e.to_string())?;
    let _ = connection.close().await;
    if verdict == "ok" {
        Ok(())
    } else {
        Err("The database copy failed its integrity check, so no backup was made.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqliteJournalMode;

    fn scratch(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("bb-snapshot-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn snapshot_of_a_live_wal_database_contains_the_latest_rows() {
        let dir = scratch("wal");
        let db = dir.join("live.db");
        // Keep this connection open (as the running app does) while the snapshot is taken.
        let mut live = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&db)
                .create_if_missing(true)
                .journal_mode(SqliteJournalMode::Wal),
        )
        .await
        .unwrap();
        sqlx::query("CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)")
            .execute(&mut live)
            .await
            .unwrap();
        for i in 0..50 {
            sqlx::query("INSERT INTO projects (id, name) VALUES (?, ?)")
                .bind(format!("p{i}"))
                .bind(format!("Project {i}"))
                .execute(&mut live)
                .await
                .unwrap();
        }
        assert!(
            dir.join("live.db-wal").exists(),
            "recent writes are still in the WAL file"
        );

        let copy = dir.join("snapshot.db");
        snapshot_database(&db, &copy).await.unwrap();

        let mut check = SqliteConnection::connect_with(&options(&copy).read_only(true))
            .await
            .unwrap();
        let count: i64 = sqlx::query("SELECT COUNT(*) FROM projects")
            .fetch_one(&mut check)
            .await
            .unwrap()
            .get(0);
        assert_eq!(count, 50);
        // Taking the snapshot did not disturb the live database.
        sqlx::query("INSERT INTO projects (id, name) VALUES ('after', 'After')")
            .execute(&mut live)
            .await
            .unwrap();
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn an_existing_destination_is_replaced() {
        let dir = scratch("replace");
        let db = dir.join("live.db");
        let mut live = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&db)
                .create_if_missing(true),
        )
        .await
        .unwrap();
        sqlx::query("CREATE TABLE t (x INTEGER)")
            .execute(&mut live)
            .await
            .unwrap();
        let copy = dir.join("snapshot.db");
        fs::write(&copy, b"stale leftovers").unwrap();
        snapshot_database(&db, &copy).await.unwrap();
        let mut check = SqliteConnection::connect_with(&options(&copy).read_only(true))
            .await
            .unwrap();
        let tables: i64 = sqlx::query("SELECT COUNT(*) FROM sqlite_master WHERE name = 't'")
            .fetch_one(&mut check)
            .await
            .unwrap()
            .get(0);
        assert_eq!(tables, 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn missing_database_and_unsafe_paths_are_rejected() {
        let dir = scratch("bad");
        let missing = snapshot_database(&dir.join("nope.db"), &dir.join("out.db")).await;
        assert_eq!(
            missing.unwrap_err(),
            "The application database could not be found."
        );
        let db = dir.join("real.db");
        fs::write(&db, b"").unwrap();
        let quote = snapshot_database(&db, &dir.join("it's.db")).await;
        assert!(quote.unwrap_err().contains("unsupported character"));
        let _ = fs::remove_dir_all(&dir);
    }
}
