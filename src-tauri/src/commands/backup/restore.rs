//! Restoring a backup.
//!
//! The running app keeps its database open, so a restore never overwrites it directly. Instead it
//! happens in two steps:
//!
//! 1. **Stage** (while the app runs): the downloaded zip is unpacked into a `pending-restore`
//!    folder, its checksum, integrity and version are checked, and the stored attachment paths are
//!    rewritten for this computer. Nothing live is touched.
//! 2. **Apply** (at the next start-up, before the database is opened): the current database and
//!    attachments are moved into a safety folder and the staged copy is moved into place. If
//!    anything fails the old data is put back.

use super::snapshot;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{sqlite::SqliteConnectOptions, Connection, Row, SqliteConnection};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    time::Duration,
};

pub const PENDING_DIR: &str = "pending-restore";
pub const SAFETY_DIR: &str = "restore-safety";
pub const NOTICE_FILE: &str = "last-restore.json";
const MARKER_FILE: &str = "restore.json";
const DB_ENTRY: &str = "baloch-builder.db";
const MANIFEST_ENTRY: &str = "manifest.json";
const ATTACHMENTS: &str = "attachments";
/// How many "before the restore" safety copies are kept.
const KEEP_SAFETY_COPIES: usize = 2;
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    app: String,
    format: u32,
    db_sha256: String,
    attachment_count: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Marker {
    backup_name: String,
}

/// What the Settings page shows after a restore was applied (or failed) at start-up.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, PartialEq)]
pub struct Applied {
    pub backup_name: String,
    pub safety_dir: PathBuf,
}

pub struct Staged {
    pub attachment_count: u32,
    pub paths_updated: u32,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// ---------------------------------------------------------------------------------------------
// Step 1: unpack and check
// ---------------------------------------------------------------------------------------------

/// Components of a zip entry name, only if every one is a plain name (no `..`, no drive, no root).
fn safe_components(name: &Path) -> Option<Vec<String>> {
    let mut parts = Vec::new();
    for component in name.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_str()?.to_string()),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(parts)
}

/// Unpacks a backup zip into `stage`, checking the manifest and the database checksum.
/// Returns the number of attachment files unpacked.
fn extract_archive(zip_path: &Path, stage: &Path) -> Result<u32, String> {
    let file = File::open(zip_path).map_err(|e| format!("Could not open the backup file: {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|_| "The downloaded file is not a valid Baloch Builder backup.".to_string())?;

    let manifest: Manifest = {
        let entry = archive
            .by_name(MANIFEST_ENTRY)
            .map_err(|_| "This is not a Baloch Builder backup (it has no manifest).".to_string())?;
        let mut text = Vec::new();
        entry
            .take(MAX_MANIFEST_BYTES)
            .read_to_end(&mut text)
            .map_err(|e| e.to_string())?;
        serde_json::from_slice(&text)
            .map_err(|_| "The backup's manifest could not be read.".to_string())?
    };
    if manifest.app != "Baloch Builder" || manifest.format != 1 {
        return Err("This backup was made by an unsupported version of the app.".into());
    }

    fs::create_dir_all(stage.join(ATTACHMENTS)).map_err(|e| e.to_string())?;
    let mut db_sha = None;
    let mut attachments = 0u32;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        let name = entry
            .enclosed_name()
            .ok_or("The backup contains an unsafe file name, so it was not restored.")?;
        let parts = safe_components(&name)
            .ok_or("The backup contains an unsafe file name, so it was not restored.")?;
        if parts.is_empty() || entry.is_dir() {
            continue;
        }
        let target = if parts.len() == 1 && parts[0] == DB_ENTRY {
            stage.join(DB_ENTRY)
        } else if parts[0] == ATTACHMENTS && parts.len() >= 2 {
            let mut path = stage.join(ATTACHMENTS);
            for part in &parts[1..] {
                path.push(part);
            }
            path
        } else {
            continue; // the manifest and anything else unexpected
        };
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = File::create(&target)
            .map_err(|e| format!("Could not unpack the backup (is the disk full?): {e}"))?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 256 * 1024];
        loop {
            let read = entry.read(&mut buffer).map_err(|e| e.to_string())?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
            out.write_all(&buffer[..read])
                .map_err(|e| format!("Could not unpack the backup (is the disk full?): {e}"))?;
        }
        out.sync_all().map_err(|e| e.to_string())?;
        if target.file_name().is_some_and(|n| n == DB_ENTRY) && parts.len() == 1 {
            db_sha = Some(hex(&hasher.finalize()));
        } else {
            attachments += 1;
        }
    }

    let db_sha = db_sha.ok_or("The backup does not contain a database.")?;
    if !db_sha.eq_ignore_ascii_case(&manifest.db_sha256) {
        return Err("The backup is damaged (its database does not match its checksum).".into());
    }
    if attachments != manifest.attachment_count {
        return Err("The backup is incomplete (some attachment files are missing).".into());
    }
    Ok(attachments)
}

fn db_options(path: &Path) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(false)
        .busy_timeout(Duration::from_secs(10))
}

/// Refuses a database made by a newer version of the app than the one that is running, because
/// the older app could not open it.
async fn check_schema_version(db: &Path, newest_known: i64) -> Result<(), String> {
    let mut connection = SqliteConnection::connect_with(&db_options(db).read_only(true))
        .await
        .map_err(|e| format!("The backup's database could not be opened: {e}"))?;
    let exists: i64 = sqlx::query(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_one(&mut connection)
    .await
    .map_err(|e| e.to_string())?
    .get(0);
    if exists == 0 {
        let _ = connection.close().await;
        return Err("This backup does not look like a Baloch Builder database.".into());
    }
    let newest: Option<i64> = sqlx::query("SELECT MAX(version) FROM _sqlx_migrations")
        .fetch_one(&mut connection)
        .await
        .map_err(|e| e.to_string())?
        .get(0);
    let _ = connection.close().await;
    if newest.unwrap_or(0) > newest_known {
        return Err(
            "This backup was made by a newer version of Baloch Builder. Install the latest version of the app, then restore."
                .into(),
        );
    }
    Ok(())
}

/// Attachment paths are stored in full, including the Windows user name, so they must be pointed
/// at this computer's attachments folder. Returns `None` for paths that are not attachments.
pub fn relocate_path(old: &str, attachments_dir: &Path) -> Option<String> {
    let parts: Vec<&str> = old
        .split(|c| c == '\\' || c == '/')
        .filter(|part| !part.is_empty())
        .collect();
    let [.., parent, file] = parts.as_slice() else {
        return None;
    };
    if !parent.eq_ignore_ascii_case(ATTACHMENTS) || *file == "." || *file == ".." {
        return None;
    }
    Some(attachments_dir.join(file).to_string_lossy().to_string())
}

async fn rewrite_document_paths(db: &Path, attachments_dir: &Path) -> Result<u32, String> {
    let mut connection = SqliteConnection::connect_with(&db_options(db))
        .await
        .map_err(|e| format!("The backup's database could not be opened: {e}"))?;
    let has_documents: i64 = sqlx::query(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'documents'",
    )
    .fetch_one(&mut connection)
    .await
    .map_err(|e| e.to_string())?
    .get(0);
    let mut updated = 0u32;
    if has_documents > 0 {
        let rows = sqlx::query(
            "SELECT id, file_path FROM documents WHERE file_path IS NOT NULL AND file_path <> ''",
        )
        .fetch_all(&mut connection)
        .await
        .map_err(|e| e.to_string())?;
        let mut transaction = connection.begin().await.map_err(|e| e.to_string())?;
        for row in rows {
            let id: String = row.get(0);
            let old: String = row.get(1);
            if let Some(new) = relocate_path(&old, attachments_dir) {
                if new != old {
                    sqlx::query("UPDATE documents SET file_path = ? WHERE id = ?")
                        .bind(new)
                        .bind(id)
                        .execute(&mut *transaction)
                        .await
                        .map_err(|e| e.to_string())?;
                    updated += 1;
                }
            }
        }
        transaction.commit().await.map_err(|e| e.to_string())?;
    } else {
        let _ = connection.close().await;
    }
    Ok(updated)
}

/// Unpacks and checks `zip_path`, then leaves a ready-to-apply restore in `pending`.
/// The marker file is written last, so a half-staged restore is never applied.
pub async fn stage(
    zip_path: &Path,
    pending: &Path,
    attachments_dir: &Path,
    newest_known_migration: i64,
    backup_name: &str,
) -> Result<Staged, String> {
    let outcome = stage_inner(
        zip_path,
        pending,
        attachments_dir,
        newest_known_migration,
        backup_name,
    )
    .await;
    if outcome.is_err() {
        let _ = fs::remove_dir_all(pending);
    }
    outcome
}

async fn stage_inner(
    zip_path: &Path,
    pending: &Path,
    attachments_dir: &Path,
    newest_known_migration: i64,
    backup_name: &str,
) -> Result<Staged, String> {
    let _ = fs::remove_dir_all(pending);
    fs::create_dir_all(pending).map_err(|e| format!("Could not prepare the restore: {e}"))?;

    let attachment_count = {
        let zip_path = zip_path.to_path_buf();
        let pending = pending.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || extract_archive(&zip_path, &pending))
            .await
            .map_err(|e| format!("The restore stopped unexpectedly: {e}"))??
    };

    let db = pending.join(DB_ENTRY);
    if !snapshot::integrity_ok(&db).await? {
        return Err("The backup's database is damaged, so it was not restored.".into());
    }
    check_schema_version(&db, newest_known_migration).await?;
    let paths_updated = rewrite_document_paths(&db, attachments_dir).await?;

    let marker = serde_json::to_vec(&Marker {
        backup_name: backup_name.to_string(),
    })
    .map_err(|e| e.to_string())?;
    fs::write(pending.join(MARKER_FILE), marker).map_err(|e| e.to_string())?;
    Ok(Staged {
        attachment_count,
        paths_updated,
    })
}

// ---------------------------------------------------------------------------------------------
// Step 2: swap in at start-up
// ---------------------------------------------------------------------------------------------

fn copy_dir_all(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Moves a file or folder, falling back to copy-and-delete when a plain rename is not possible
/// (for example across drives).
fn move_path(from: &Path, to: &Path) -> std::io::Result<()> {
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    if from.is_dir() {
        copy_dir_all(from, to)?;
        fs::remove_dir_all(from)
    } else {
        fs::copy(from, to)?;
        fs::remove_file(from)
    }
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    path.with_file_name(name)
}

fn prune_safety_copies(safety_root: &Path) {
    let Ok(entries) = fs::read_dir(safety_root) else {
        return;
    };
    let mut folders: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    folders.sort();
    folders.reverse(); // names are timestamps, newest first
    for old in folders.into_iter().skip(KEEP_SAFETY_COPIES) {
        let _ = fs::remove_dir_all(old);
    }
}

/// Applies a staged restore, if there is one. Must run before the database is opened.
/// Returns `Ok(None)` when nothing was waiting.
pub fn apply_pending(
    pending: &Path,
    db_path: &Path,
    attachments_dir: &Path,
    safety_root: &Path,
    label: &str,
) -> Result<Option<Applied>, String> {
    let marker_path = pending.join(MARKER_FILE);
    if !marker_path.is_file() {
        // No marker means nothing complete is waiting; clear any half-staged leftovers.
        if pending.exists() {
            let _ = fs::remove_dir_all(pending);
        }
        return Ok(None);
    }
    let outcome = swap_in(
        pending,
        &marker_path,
        db_path,
        attachments_dir,
        safety_root,
        label,
    );
    let _ = fs::remove_dir_all(pending); // never retry the same restore
    if outcome.is_ok() {
        prune_safety_copies(safety_root);
    }
    outcome.map(Some)
}

fn swap_in(
    pending: &Path,
    marker_path: &Path,
    db_path: &Path,
    attachments_dir: &Path,
    safety_root: &Path,
    label: &str,
) -> Result<Applied, String> {
    let marker: Marker = serde_json::from_slice(&fs::read(marker_path).map_err(|e| e.to_string())?)
        .map_err(|_| "The restore request was damaged, so nothing was changed.".to_string())?;
    let staged_db = pending.join(DB_ENTRY);
    let staged_attachments = pending.join(ATTACHMENTS);
    if !staged_db.is_file() {
        return Err("The restore was incomplete, so nothing was changed.".into());
    }

    let safety = safety_root.join(label);
    fs::create_dir_all(&safety).map_err(|e| format!("Could not create the safety copy: {e}"))?;

    // 1. Put the current data aside, remembering how to undo it.
    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut set_aside = |from: PathBuf, name: &str| -> Result<(), String> {
        if from.exists() {
            let to = safety.join(name);
            move_path(&from, &to)
                .map_err(|e| format!("Could not keep a copy of your current data: {e}"))?;
            moved.push((to, from));
        }
        Ok(())
    };
    let mut result = (|| -> Result<(), String> {
        for suffix in ["", "-wal", "-shm"] {
            let source = with_suffix(db_path, suffix);
            let name = source
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            set_aside(source, &name)?;
        }
        set_aside(attachments_dir.to_path_buf(), ATTACHMENTS)?;

        // 2. Move the restored data in.
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if let Some(parent) = attachments_dir.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        move_path(&staged_db, db_path)
            .map_err(|e| format!("Could not put the restored database in place: {e}"))?;
        if staged_attachments.is_dir() {
            move_path(&staged_attachments, attachments_dir)
                .map_err(|e| format!("Could not put the restored attachments in place: {e}"))?;
        } else {
            fs::create_dir_all(attachments_dir).map_err(|e| e.to_string())?;
        }
        Ok(())
    })();

    if let Err(message) = &result {
        // Undo: remove anything half-installed, then bring the old data back.
        let _ = fs::remove_file(db_path);
        let _ = fs::remove_dir_all(attachments_dir);
        for (from, to) in moved.iter().rev() {
            let _ = move_path(from, to);
        }
        result = Err(format!(
            "{message} Your previous data was put back and nothing was changed."
        ));
    }
    result?;
    Ok(Applied {
        backup_name: marker.backup_name,
        safety_dir: safety,
    })
}

pub fn write_notice(path: &Path, notice: &Notice) {
    if let Ok(bytes) = serde_json::to_vec(notice) {
        let _ = fs::write(path, bytes);
    }
}

/// Reads and removes the notice, so it is shown only once.
pub fn take_notice(path: &Path) -> Option<Notice> {
    let bytes = fs::read(path).ok()?;
    let _ = fs::remove_file(path);
    serde_json::from_slice(&bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::backup::archive;
    use sqlx::sqlite::SqliteJournalMode;

    fn scratch(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("bb-restore-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    async fn make_db(path: &Path, migration: i64, rows: &[(&str, &str)]) {
        let mut db = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(path)
                .create_if_missing(true)
                .journal_mode(SqliteJournalMode::Delete),
        )
        .await
        .unwrap();
        for sql in [
            "CREATE TABLE _sqlx_migrations (version BIGINT PRIMARY KEY)",
            "CREATE TABLE documents (id TEXT PRIMARY KEY, file_path TEXT)",
        ] {
            sqlx::query(sql).execute(&mut db).await.unwrap();
        }
        sqlx::query("INSERT INTO _sqlx_migrations (version) VALUES (?)")
            .bind(migration)
            .execute(&mut db)
            .await
            .unwrap();
        for (id, file_path) in rows {
            sqlx::query("INSERT INTO documents (id, file_path) VALUES (?, ?)")
                .bind(*id)
                .bind(*file_path)
                .execute(&mut db)
                .await
                .unwrap();
        }
        let _ = db.close().await;
    }

    async fn paths(db: &Path) -> Vec<(String, Option<String>)> {
        let mut c = SqliteConnection::connect_with(&db_options(db).read_only(true))
            .await
            .unwrap();
        let rows = sqlx::query("SELECT id, file_path FROM documents ORDER BY id")
            .fetch_all(&mut c)
            .await
            .unwrap();
        rows.iter().map(|r| (r.get(0), r.get(1))).collect()
    }

    /// Builds a real backup zip the same way the app does.
    async fn make_backup(dir: &Path, migration: i64) -> PathBuf {
        let db = dir.join("source.db");
        make_db(
            &db,
            migration,
            &[
                (
                    "a",
                    "C:\\Users\\OldUser\\AppData\\Local\\com.app\\attachments\\land-1.jpg",
                ),
                ("b", "/home/old/.local/share/app/attachments/deed.pdf"),
                ("c", ""),
                ("d", "D:\\Scans\\not-an-attachment.pdf"),
            ],
        )
        .await;
        let attachments = dir.join("source-attachments");
        fs::create_dir_all(&attachments).unwrap();
        fs::write(attachments.join("land-1.jpg"), b"photo bytes").unwrap();
        fs::write(attachments.join("deed.pdf"), b"pdf bytes").unwrap();
        let zip = dir.join("backup.zip");
        archive::build_archive(&db, &attachments, &zip, "0.1.0", "2026-10-10T09:00:00Z").unwrap();
        zip
    }

    #[test]
    fn attachment_paths_are_moved_to_this_computers_folder() {
        let target = Path::new("/new/data/attachments");
        let moved = |old: &str| relocate_path(old, target);
        assert_eq!(
            moved("C:\\Users\\OldUser\\AppData\\Local\\app\\attachments\\land-1.jpg"),
            Some(target.join("land-1.jpg").to_string_lossy().to_string())
        );
        assert_eq!(
            moved("/home/x/attachments/a.pdf"),
            Some(target.join("a.pdf").to_string_lossy().to_string())
        );
        assert_eq!(moved("D:\\Scans\\other.pdf"), None);
        assert_eq!(moved("attachments"), None);
        assert_eq!(moved(""), None);
        assert_eq!(moved("x/attachments/.."), None);
    }

    #[tokio::test]
    async fn a_backup_is_staged_checked_and_its_paths_fixed() {
        let dir = scratch("stage");
        let zip = make_backup(&dir, 19).await;
        let new_attachments = dir.join("live").join("attachments");
        let pending = dir.join("pending");

        let staged = stage(&zip, &pending, &new_attachments, 19, "backup.zip")
            .await
            .unwrap();
        assert_eq!(staged.attachment_count, 2);
        assert_eq!(staged.paths_updated, 2);
        assert!(pending.join(MARKER_FILE).is_file());
        assert_eq!(
            fs::read(pending.join("attachments").join("land-1.jpg")).unwrap(),
            b"photo bytes"
        );
        let rows = paths(&pending.join(DB_ENTRY)).await;
        let expect = |f: &str| Some(new_attachments.join(f).to_string_lossy().to_string());
        assert_eq!(rows[0], ("a".into(), expect("land-1.jpg")));
        assert_eq!(rows[1], ("b".into(), expect("deed.pdf")));
        assert_eq!(rows[2], ("c".into(), Some(String::new())));
        assert_eq!(
            rows[3].1.as_deref(),
            Some("D:\\Scans\\not-an-attachment.pdf")
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn a_backup_from_a_newer_app_version_is_refused_and_leaves_nothing_behind() {
        let dir = scratch("newer");
        let zip = make_backup(&dir, 99).await;
        let pending = dir.join("pending");
        let error = stage(&zip, &pending, &dir.join("a"), 19, "b.zip")
            .await
            .err()
            .unwrap();
        assert!(error.contains("newer version"), "{error}");
        assert!(!pending.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn damaged_or_foreign_files_are_refused() {
        let dir = scratch("bad");
        let pending = dir.join("pending");
        let junk = dir.join("junk.zip");
        fs::write(&junk, b"this is not a zip").unwrap();
        assert!(stage(&junk, &pending, &dir, 19, "x").await.is_err());

        // A zip with a correct layout but a tampered database.
        let good = make_backup(&dir, 19).await;
        let mut archive = zip::ZipArchive::new(File::open(&good).unwrap()).unwrap();
        let tampered = dir.join("tampered.zip");
        let mut writer = zip::ZipWriter::new(File::create(&tampered).unwrap());
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).unwrap();
            let name = entry.name().to_string();
            let mut data = Vec::new();
            entry.read_to_end(&mut data).unwrap();
            if name == DB_ENTRY {
                data[100] ^= 0xFF;
            }
            writer
                .start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(&data).unwrap();
        }
        writer.finish().unwrap();
        let error = stage(&tampered, &pending, &dir, 19, "x")
            .await
            .err()
            .unwrap();
        assert!(error.contains("damaged"), "{error}");
        assert!(!pending.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn a_zip_that_tries_to_escape_the_folder_is_refused() {
        let dir = scratch("slip");
        let evil = dir.join("evil.zip");
        let mut writer = zip::ZipWriter::new(File::create(&evil).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        writer.start_file(MANIFEST_ENTRY, options).unwrap();
        writer
            .write_all(
                br#"{"app":"Baloch Builder","format":1,"appVersion":"0","createdAt":"","dbFile":"x","dbSha256":"00","attachmentCount":1}"#,
            )
            .unwrap();
        writer
            .start_file("attachments/../../escaped.txt", options)
            .unwrap();
        writer.write_all(b"oops").unwrap();
        writer.finish().unwrap();
        let pending = dir.join("pending");
        let error = stage(&evil, &pending, &dir, 19, "x").await.err().unwrap();
        assert!(error.contains("unsafe"), "{error}");
        assert!(!dir.join("escaped.txt").exists());
        assert!(!dir.parent().unwrap().join("escaped.txt").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn applying_swaps_the_data_keeps_a_safety_copy_and_runs_only_once() {
        let dir = scratch("apply");
        let zip = make_backup(&dir, 19).await;
        let config = dir.join("config");
        let local = dir.join("local");
        let db_path = config.join("baloch-builder.db");
        let attachments = local.join("attachments");
        fs::create_dir_all(&config).unwrap();
        fs::create_dir_all(&attachments).unwrap();
        // The "current" data that must be set aside, including WAL leftovers.
        make_db(&db_path, 19, &[("old", "x")]).await;
        fs::write(with_suffix(&db_path, "-wal"), b"wal").unwrap();
        fs::write(with_suffix(&db_path, "-shm"), b"shm").unwrap();
        fs::write(attachments.join("current.jpg"), b"current").unwrap();

        let pending = local.join(PENDING_DIR);
        stage(
            &zip,
            &pending,
            &attachments,
            19,
            "Baloch-Builder-backup-1.zip",
        )
        .await
        .unwrap();
        let safety_root = local.join(SAFETY_DIR);
        let applied = apply_pending(
            &pending,
            &db_path,
            &attachments,
            &safety_root,
            "2026-10-11_19-00-00",
        )
        .unwrap()
        .unwrap();
        assert_eq!(applied.backup_name, "Baloch-Builder-backup-1.zip");

        // Restored data is live.
        let rows = paths(&db_path).await;
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[0].0, "a");
        assert_eq!(
            fs::read(attachments.join("land-1.jpg")).unwrap(),
            b"photo bytes"
        );
        assert!(!attachments.join("current.jpg").exists());
        assert!(!with_suffix(&db_path, "-wal").exists());
        assert!(!with_suffix(&db_path, "-shm").exists());
        // The previous data is in the safety folder.
        assert_eq!(
            paths(&applied.safety_dir.join("baloch-builder.db")).await[0].0,
            "old"
        );
        assert_eq!(
            fs::read(applied.safety_dir.join("attachments").join("current.jpg")).unwrap(),
            b"current"
        );
        assert!(!pending.exists());
        // A second start-up does nothing.
        assert_eq!(
            apply_pending(&pending, &db_path, &attachments, &safety_root, "x").unwrap(),
            None
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn a_failed_apply_puts_the_old_data_back() {
        let dir = scratch("rollback");
        let config = dir.join("config");
        let local = dir.join("local");
        let db_path = config.join("baloch-builder.db");
        let attachments = local.join("attachments");
        fs::create_dir_all(&config).unwrap();
        fs::create_dir_all(&attachments).unwrap();
        make_db(&db_path, 19, &[("old", "x")]).await;
        fs::write(attachments.join("current.jpg"), b"current").unwrap();

        // A staged restore whose database is missing (only the marker exists).
        let pending = local.join(PENDING_DIR);
        fs::create_dir_all(&pending).unwrap();
        fs::write(pending.join(MARKER_FILE), br#"{"backupName":"b.zip"}"#).unwrap();
        let error = apply_pending(
            &pending,
            &db_path,
            &attachments,
            &local.join(SAFETY_DIR),
            "t",
        )
        .unwrap_err();
        assert!(error.contains("nothing was changed"), "{error}");
        assert_eq!(paths(&db_path).await[0].0, "old");
        assert!(attachments.join("current.jpg").is_file());
        assert!(!pending.exists());

        // Half-staged leftovers (no marker) are cleaned up and nothing is applied.
        fs::create_dir_all(&pending).unwrap();
        fs::write(pending.join(DB_ENTRY), b"partial").unwrap();
        assert_eq!(
            apply_pending(
                &pending,
                &db_path,
                &attachments,
                &local.join(SAFETY_DIR),
                "t"
            )
            .unwrap(),
            None
        );
        assert!(!pending.exists());
        assert_eq!(paths(&db_path).await[0].0, "old");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_the_newest_safety_copies_are_kept_and_notices_show_once() {
        let dir = scratch("prune");
        for label in [
            "2026-01-01_00-00-00",
            "2026-02-01_00-00-00",
            "2026-03-01_00-00-00",
        ] {
            fs::create_dir_all(dir.join(label)).unwrap();
        }
        prune_safety_copies(&dir);
        assert!(!dir.join("2026-01-01_00-00-00").exists());
        assert!(dir.join("2026-02-01_00-00-00").exists());
        assert!(dir.join("2026-03-01_00-00-00").exists());

        let notice_path = dir.join(NOTICE_FILE);
        write_notice(
            &notice_path,
            &Notice {
                ok: true,
                message: "done".into(),
            },
        );
        assert_eq!(take_notice(&notice_path).unwrap().message, "done");
        assert!(take_notice(&notice_path).is_none());
        let _ = fs::remove_dir_all(&dir);
    }
}
