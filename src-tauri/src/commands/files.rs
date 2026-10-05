use std::fs;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use rand::RngCore;

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

/// Save an uploaded image under an app-generated name; never trust a browser file path.
#[tauri::command]
pub fn save_image_attachment(app: AppHandle, bytes: Vec<u8>, mime: String) -> Result<String, String> {
    let extension = match mime.as_str() {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => return Err("Choose a JPEG, PNG, WebP or GIF image".into()),
    };
    if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 {
        return Err("Image must be between 1 byte and 10 MB".into());
    }
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let attachments_dir = app_dir.join("attachments");
    fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
    let mut random = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut random);
    let filename = format!("land-{}.{}", random.iter().map(|b| format!("{:02x}", b)).collect::<String>(), extension);
    let dest_path = attachments_dir.join(filename);
    fs::write(&dest_path, bytes).map_err(|e| e.to_string())?;
    Ok(dest_path.to_string_lossy().to_string())
}

/// Read only images stored in this app's attachments folder for an in-app preview.
#[tauri::command]
pub fn read_image_attachment(app: AppHandle, path: String) -> Result<Vec<u8>, String> {
    let attachments = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("attachments");
    let allowed = attachments.canonicalize().map_err(|e| e.to_string())?;
    let requested = std::path::Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
    if !requested.starts_with(&allowed) { return Err("Image is outside the attachments folder".into()); }
    let metadata = fs::metadata(&requested).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > 10 * 1024 * 1024 { return Err("Image is unavailable".into()); }
    fs::read(requested).map_err(|e| e.to_string())
}
