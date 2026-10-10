use serde::Deserialize;
use sqlx::{Connection, Row, SqliteConnection, sqlite::SqliteConnectOptions};
use std::{path::PathBuf, time::Duration};
use tauri::{AppHandle, Manager};

#[derive(Deserialize)]
pub struct LandInput {
    account_key: Option<String>,
    title: String,
    location: String,
    purchase_date: String,
    area_value: Option<f64>,
    area_unit: Option<String>,
    seller_name: String,
    price: Option<i64>,
    payment_details: Option<serde_json::Value>,
    notes: String,
}

fn file_options(path: PathBuf) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(path).create_if_missing(false).foreign_keys(true).busy_timeout(Duration::from_secs(10))
}

/// Saves the land and project status using a single SQLite connection.
#[tauri::command]
pub async fn save_project_stage(
    app: AppHandle,
    project_id: String,
    status: String,
    land: Option<LandInput>,
    land_id: String,
    timestamp: String,
) -> Result<(), String> {
    if !["planning", "land acquired", "under construction", "completed", "land sold", "on hold"].contains(&status.as_str()) {
        return Err("Invalid project status".into());
    }
    if status == "land acquired" && land.is_none() { return Err("Land details are required".into()); }
    if land.is_some() && status != "land acquired" { return Err("Land details require the Land acquired status".into()); }
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?.join("baloch-builder.db");
    if !path.is_file() { return Err("The saved application database could not be found".into()); }
    let options = file_options(path);
    let mut connection = SqliteConnection::connect_with(&options).await.map_err(|e| e.to_string())?;
    let has_projects: Option<String> = sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'")
        .fetch_optional(&mut connection).await.map_err(|e| e.to_string())?;
    if has_projects.is_none() { return Err("The application database has no projects table".into()); }
    let mut tx = connection.begin().await.map_err(|e| e.to_string())?;
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM projects WHERE id = ? AND archived = 0")
        .bind(&project_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;
    if exists.is_none() { return Err("Project not found".into()); }
    if let Some(land) = land {
        if land.title.trim().is_empty() || land.location.trim().is_empty() { return Err("Enter the land name and location".into()); }
        let custom = serde_json::json!({"seller_name": land.seller_name, "payment_details": land.payment_details}).to_string();
        let existing = sqlx::query("SELECT id FROM land WHERE project_id = ? AND archived = 0 ORDER BY created_at LIMIT 1")
            .bind(&project_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;
        if let Some(row) = existing {
            let existing_id: String = row.try_get("id").map_err(|e| e.to_string())?;
            sqlx::query("UPDATE land SET title = ?, location = ?, purchase_date = ?, area_value = ?, area_unit = ?, price = ?, notes = ?, custom = ?, status = 'acquired', updated_at = ?, account_key = ? WHERE id = ?")
                .bind(&land.title).bind(&land.location).bind(&land.purchase_date).bind(land.area_value).bind(&land.area_unit)
                .bind(land.price).bind(if land.notes.is_empty() { None } else { Some(land.notes.as_str()) })
                .bind(&custom).bind(&timestamp).bind(&land.account_key).bind(existing_id)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        } else {
            sqlx::query("INSERT INTO land (id, title, location, area_value, area_unit, purchase_date, price, status, project_id, is_personal, notes, created_at, updated_at, archived, custom, account_key) VALUES (?, ?, ?, ?, ?, ?, ?, 'acquired', ?, 0, ?, ?, ?, 0, ?, ?)")
                .bind(&land_id).bind(&land.title).bind(&land.location).bind(land.area_value).bind(&land.area_unit)
                .bind(&land.purchase_date).bind(land.price).bind(&project_id)
                .bind(if land.notes.is_empty() { None } else { Some(land.notes.as_str()) })
                .bind(&timestamp).bind(&timestamp).bind(&custom).bind(&land.account_key)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
        sqlx::query("UPDATE project_building_details SET plot_area_value = ?, plot_area_unit = ?, updated_at = ? WHERE project_id = ? AND archived = 0")
            .bind(land.area_value).bind(&land.area_unit).bind(&timestamp).bind(&project_id)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    sqlx::query("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?")
        .bind(status).bind(timestamp).bind(project_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_options_reopen_the_same_database() {
        tauri::async_runtime::block_on(async {
            let path = std::env::temp_dir().join(format!("baloch-stage-test-{}.db", rand::random::<u64>()));
            let create = SqliteConnectOptions::new().filename(&path).create_if_missing(true);
            let mut first = SqliteConnection::connect_with(&create).await.unwrap();
            sqlx::query("CREATE TABLE projects (id TEXT)").execute(&mut first).await.unwrap();
            first.close().await.unwrap();
            let mut second = SqliteConnection::connect_with(&file_options(path.clone())).await.unwrap();
            let name: String = sqlx::query_scalar("SELECT name FROM sqlite_master WHERE name = 'projects'")
                .fetch_one(&mut second).await.unwrap();
            assert_eq!(name, "projects");
            second.close().await.unwrap();
            std::fs::remove_file(path).unwrap();
        });
    }
}
