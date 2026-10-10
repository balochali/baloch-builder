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
        "application/pdf" => "pdf",
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => return Err("Choose a JPEG, PNG, WebP, GIF or PDF file".into()),
    };
    if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 {
        return Err("File must be between 1 byte and 10 MB".into());
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

/// Export a saved attachment to Downloads without overwriting an existing file.
#[tauri::command]
pub fn download_attachment(app: AppHandle, path: String, filename: String) -> Result<String, String> {
    use std::io::Write;
    let extension = std::path::Path::new(&path).extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    if !["png", "jpg", "jpeg", "webp", "gif", "pdf"].contains(&extension.as_str()) { return Err("Unsupported document type".into()); }
    let bytes = read_image_attachment(app.clone(), path)?;
    let stem = std::path::Path::new(&filename).file_stem().and_then(|s| s.to_str()).unwrap_or("document");
    let safe: String = stem.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).take(80).collect();
    let directory = app.path().download_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let mut random = [0u8; 8]; rand::thread_rng().fill_bytes(&mut random);
    let suffix: String = random.iter().map(|b| format!("{:02x}", b)).collect();
    let destination = directory.join(format!("Baloch-{}-{}.{}", safe, suffix, extension));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&destination).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(destination.to_string_lossy().to_string())
}
