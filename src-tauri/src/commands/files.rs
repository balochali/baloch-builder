use std::fs;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

/// Copies an attachment file into the app's local data attachments folder.
#[tauri::command]
pub fn copy_attachment(
    app: AppHandle,
    source_path: String,
    filename: String,
) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    let attachments_dir = app_dir.join("attachments");

    if !attachments_dir.exists() {
        fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
    }

    let dest_path = attachments_dir.join(&filename);
    fs::copy(&source_path, &dest_path).map_err(|e| e.to_string())?;

    Ok(dest_path.to_string_lossy().to_string())
}

/// Opens a file using the operating system's default handler.
#[tauri::command]
pub fn open_file(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}
