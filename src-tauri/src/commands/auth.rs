use super::account_store as store;
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager, State};

// Re-exported so `lib.rs` can keep registering the login counter as before.
pub use super::account_store::{LoginAttempts, Profile};

fn account_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("account.json"))
}

#[tauri::command]
pub fn auth_status(app: AppHandle) -> Result<bool, String> {
    Ok(account_path(&app)?.exists())
}

#[tauri::command]
pub fn create_account(app: AppHandle, username: String, password: String) -> Result<(), String> {
    store::create_account(&account_path(&app)?, &username, &password)
}

#[tauri::command]
pub fn login(
    app: AppHandle,
    attempts: State<'_, Mutex<LoginAttempts>>,
    username: String,
    password: String,
) -> Result<(), String> {
    let mut attempts = attempts
        .lock()
        .map_err(|_| "Login unavailable".to_string())?;
    attempts.check()?;
    let account = store::read_account(&account_path(&app)?)?;
    let password_ok = store::verify_password(&account, &password)?;
    if account.username == username.trim() && password_ok {
        attempts.record_success();
        return Ok(());
    }
    attempts.record_failure();
    Err("Incorrect username or password.".into())
}

#[tauri::command]
pub fn get_profile(app: AppHandle) -> Result<Profile, String> {
    store::get_profile(&account_path(&app)?)
}

#[tauri::command]
pub fn update_profile(app: AppHandle, full_name: String, email: String) -> Result<Profile, String> {
    store::update_profile(&account_path(&app)?, &full_name, &email)
}

#[tauri::command]
pub fn change_password(
    app: AppHandle,
    attempts: State<'_, Mutex<LoginAttempts>>,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    let mut attempts = attempts
        .lock()
        .map_err(|_| "Password change unavailable".to_string())?;
    store::change_password(
        &account_path(&app)?,
        &mut attempts,
        &current_password,
        &new_password,
    )
}
