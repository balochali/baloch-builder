use tauri::{AppHandle, Manager};

/// Returns the on-disk application local data directory path
/// (%LOCALAPPDATA%\com.baloch-builder.app on Windows).
#[tauri::command]
pub fn get_app_data_path(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_local_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}
