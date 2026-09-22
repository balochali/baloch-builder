use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::{fs::{self, OpenOptions}, io::Write, path::PathBuf, sync::Mutex, time::{Duration, Instant}};
use tauri::{AppHandle, Manager, State};

type HmacSha256 = Hmac<Sha256>;
const ITERATIONS: u32 = 210_000;

#[derive(Default)]
pub struct LoginAttempts {
    failures: u32,
    blocked_until: Option<Instant>,
}

#[derive(Serialize, Deserialize)]
struct Account {
    username: String,
    salt: Vec<u8>,
    hash: Vec<u8>,
    iterations: u32,
}

fn account_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("account.json"))
}

fn derive(password: &str, salt: &[u8], iterations: u32) -> Result<[u8; 32], String> {
    let mut output = [0u8; 32];
    let mut block = Vec::with_capacity(salt.len() + 4);
    block.extend_from_slice(salt);
    block.extend_from_slice(&1u32.to_be_bytes());
    let mut mac = HmacSha256::new_from_slice(password.as_bytes()).map_err(|e| e.to_string())?;
    mac.update(&block);
    let mut previous: [u8; 32] = mac.finalize().into_bytes().into();
    output.copy_from_slice(&previous);
    for _ in 1..iterations {
        let mut mac = HmacSha256::new_from_slice(password.as_bytes()).map_err(|e| e.to_string())?;
        mac.update(&previous);
        previous = mac.finalize().into_bytes().into();
        for (out, byte) in output.iter_mut().zip(previous) { *out ^= byte; }
    }
    Ok(output)
}

fn equal_constant_time(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() { return false; }
    let mut difference = 0u8;
    for (a, b) in left.iter().zip(right) { difference |= a ^ b; }
    difference == 0
}

#[tauri::command]
pub fn auth_status(app: AppHandle) -> Result<bool, String> {
    Ok(account_path(&app)?.exists())
}

#[tauri::command]
pub fn create_account(app: AppHandle, username: String, password: String) -> Result<(), String> {
    let username = username.trim();
    if username.len() < 3 || username.len() > 64 || password.chars().count() < 12 {
        return Err("Use a username of 3–64 characters and a password of at least 12 characters.".into());
    }
    let path = account_path(&app)?;
    fs::create_dir_all(path.parent().ok_or("Invalid account path")?).map_err(|e| e.to_string())?;
    let mut salt = vec![0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let account = Account { username: username.into(), hash: derive(&password, &salt, ITERATIONS)?.to_vec(), salt, iterations: ITERATIONS };
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)
        .map_err(|e| if e.kind() == std::io::ErrorKind::AlreadyExists { "An account already exists.".into() } else { e.to_string() })?;
    file.write_all(&serde_json::to_vec(&account).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn login(app: AppHandle, attempts: State<'_, Mutex<LoginAttempts>>, username: String, password: String) -> Result<(), String> {
    let mut attempts = attempts.lock().map_err(|_| "Login unavailable".to_string())?;
    if let Some(until) = attempts.blocked_until {
        if Instant::now() < until { return Err("Too many attempts. Try again in 30 seconds.".into()); }
        attempts.blocked_until = None;
        attempts.failures = 0;
    }
    let data = fs::read(account_path(&app)?).map_err(|_| "Account is not set up.".to_string())?;
    let account: Account = serde_json::from_slice(&data).map_err(|_| "Account data is damaged.".to_string())?;
    if account.iterations != ITERATIONS || account.salt.len() != 16 || account.hash.len() != 32 {
        return Err("Account data is damaged.".into());
    }
    let hash = derive(&password, &account.salt, account.iterations)?;
    if account.username == username.trim() && equal_constant_time(&hash, &account.hash) {
        attempts.failures = 0;
        return Ok(());
    }
    attempts.failures += 1;
    if attempts.failures >= 5 { attempts.blocked_until = Some(Instant::now() + Duration::from_secs(30)); }
    Err("Incorrect username or password.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pbkdf2_sha256_matches_known_vector() {
        let hash = derive("password", b"salt", 1).unwrap();
        let expected = [0x12, 0x0f, 0xb6, 0xcf, 0xfc, 0xf8, 0xb3, 0x2c,
            0x43, 0xe7, 0x22, 0x52, 0x56, 0xc4, 0xf8, 0x37,
            0xa8, 0x65, 0x48, 0xc9, 0x2c, 0xcc, 0x35, 0x48,
            0x08, 0x05, 0x98, 0x7c, 0xb7, 0x0b, 0xe1, 0x7b];
        assert_eq!(hash, expected);
        assert!(equal_constant_time(&hash, &expected));
        assert!(!equal_constant_time(&hash, &[0u8; 32]));
    }
}
