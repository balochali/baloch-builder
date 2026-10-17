//! Local account storage: password hashing, profile fields and atomic file writes.
//!
//! This module has no Tauri types so that it can be unit tested on its own. The
//! Tauri commands in `auth.rs` are thin wrappers around these functions.

use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    time::{Duration, Instant},
};

type HmacSha256 = Hmac<Sha256>;
pub const ITERATIONS: u32 = 210_000;
pub const MIN_PASSWORD_CHARS: usize = 12;
const MAX_NAME_CHARS: usize = 100;
const MAX_EMAIL_CHARS: usize = 254;

/// Counts failed password attempts (login and password change share one counter).
#[derive(Default)]
pub struct LoginAttempts {
    failures: u32,
    blocked_until: Option<Instant>,
}

impl LoginAttempts {
    /// Returns an error while the lockout is active; clears it once it has expired.
    pub fn check(&mut self) -> Result<(), String> {
        if let Some(until) = self.blocked_until {
            if Instant::now() < until {
                return Err("Too many attempts. Try again in 30 seconds.".into());
            }
            self.blocked_until = None;
            self.failures = 0;
        }
        Ok(())
    }

    pub fn record_failure(&mut self) {
        self.failures += 1;
        if self.failures >= 5 {
            self.blocked_until = Some(Instant::now() + Duration::from_secs(30));
        }
    }

    pub fn record_success(&mut self) {
        self.failures = 0;
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Account {
    pub username: String,
    pub salt: Vec<u8>,
    pub hash: Vec<u8>,
    pub iterations: u32,
    // Added later; accounts created by older versions simply have these empty.
    #[serde(default)]
    pub full_name: String,
    #[serde(default)]
    pub email: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub username: String,
    pub full_name: String,
    pub email: String,
}

impl Profile {
    fn from_account(account: &Account) -> Self {
        Profile {
            username: account.username.clone(),
            full_name: account.full_name.clone(),
            email: account.email.clone(),
        }
    }
}

pub fn derive(password: &str, salt: &[u8], iterations: u32) -> Result<[u8; 32], String> {
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
        for (out, byte) in output.iter_mut().zip(previous) {
            *out ^= byte;
        }
    }
    Ok(output)
}

pub fn equal_constant_time(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut difference = 0u8;
    for (a, b) in left.iter().zip(right) {
        difference |= a ^ b;
    }
    difference == 0
}

/// Reads and sanity-checks the account file.
pub fn read_account(path: &Path) -> Result<Account, String> {
    let data = fs::read(path).map_err(|_| "Account is not set up.".to_string())?;
    let account: Account =
        serde_json::from_slice(&data).map_err(|_| "Account data is damaged.".to_string())?;
    if account.iterations != ITERATIONS || account.salt.len() != 16 || account.hash.len() != 32 {
        return Err("Account data is damaged.".into());
    }
    Ok(account)
}

pub fn verify_password(account: &Account, password: &str) -> Result<bool, String> {
    let hash = derive(password, &account.salt, account.iterations)?;
    Ok(equal_constant_time(&hash, &account.hash))
}

/// Replaces the account file in one step: write a temporary file, flush it, then rename it
/// over the original, so a crash can never leave a half-written account behind.
pub fn write_account_atomic(path: &Path, account: &Account) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid account path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec(account).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.tmp");
    {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&temporary, path).map_err(|e| {
        let _ = fs::remove_file(&temporary);
        e.to_string()
    })
}

pub fn create_account(path: &Path, username: &str, password: &str) -> Result<(), String> {
    let username = username.trim();
    if username.len() < 3 || username.len() > 64 || password.chars().count() < MIN_PASSWORD_CHARS {
        return Err(
            "Use a username of 3–64 characters and a password of at least 12 characters.".into(),
        );
    }
    fs::create_dir_all(path.parent().ok_or("Invalid account path")?).map_err(|e| e.to_string())?;
    let mut salt = vec![0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let account = Account {
        username: username.into(),
        hash: derive(password, &salt, ITERATIONS)?.to_vec(),
        salt,
        iterations: ITERATIONS,
        full_name: String::new(),
        email: String::new(),
    };
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                "An account already exists.".into()
            } else {
                e.to_string()
            }
        })?;
    file.write_all(&serde_json::to_vec(&account).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

pub fn get_profile(path: &Path) -> Result<Profile, String> {
    Ok(Profile::from_account(&read_account(path)?))
}

fn has_control_chars(value: &str) -> bool {
    value.chars().any(|c| c.is_control())
}

fn valid_email(value: &str) -> bool {
    if value.chars().count() > MAX_EMAIL_CHARS || value.chars().any(|c| c.is_whitespace()) {
        return false;
    }
    let mut parts = value.split('@');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(local), Some(domain), None) => {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        }
        _ => false,
    }
}

/// Saves the display name and contact email. The username is not editable here because it is
/// part of the sign-in credentials.
pub fn update_profile(path: &Path, full_name: &str, email: &str) -> Result<Profile, String> {
    let full_name = full_name.trim();
    let email = email.trim();
    if full_name.chars().count() > MAX_NAME_CHARS || has_control_chars(full_name) {
        return Err(format!("Use a name of up to {MAX_NAME_CHARS} characters."));
    }
    if !email.is_empty() && !valid_email(email) {
        return Err("Enter a valid email address, or leave it empty.".into());
    }
    let mut account = read_account(path)?;
    account.full_name = full_name.to_string();
    account.email = email.to_string();
    write_account_atomic(path, &account)?;
    Ok(Profile::from_account(&account))
}

/// Changes the password after checking the current one. Wrong current passwords count towards
/// the same lockout as failed sign-ins.
pub fn change_password(
    path: &Path,
    attempts: &mut LoginAttempts,
    current: &str,
    new: &str,
) -> Result<(), String> {
    attempts.check()?;
    let mut account = read_account(path)?;
    if !verify_password(&account, current)? {
        attempts.record_failure();
        return Err("Your current password is incorrect.".into());
    }
    attempts.record_success();
    if new.chars().count() < MIN_PASSWORD_CHARS {
        return Err(format!(
            "Use a new password of at least {MIN_PASSWORD_CHARS} characters."
        ));
    }
    if new == current {
        return Err("Choose a password that is different from your current one.".into());
    }
    let mut salt = vec![0u8; 16];
    OsRng.fill_bytes(&mut salt);
    account.hash = derive(new, &salt, ITERATIONS)?.to_vec();
    account.salt = salt;
    account.iterations = ITERATIONS;
    write_account_atomic(path, &account)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new() -> Self {
            let mut random = [0u8; 8];
            OsRng.fill_bytes(&mut random);
            let name: String = random.iter().map(|b| format!("{b:02x}")).collect();
            let dir = std::env::temp_dir().join(format!("bb-account-{name}"));
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
        fn account(&self) -> PathBuf {
            self.0.join("account.json")
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn pbkdf2_sha256_matches_known_vector() {
        let hash = derive("password", b"salt", 1).unwrap();
        let expected = [
            0x12, 0x0f, 0xb6, 0xcf, 0xfc, 0xf8, 0xb3, 0x2c, 0x43, 0xe7, 0x22, 0x52, 0x56, 0xc4,
            0xf8, 0x37, 0xa8, 0x65, 0x48, 0xc9, 0x2c, 0xcc, 0x35, 0x48, 0x08, 0x05, 0x98, 0x7c,
            0xb7, 0x0b, 0xe1, 0x7b,
        ];
        assert_eq!(hash, expected);
        assert!(equal_constant_time(&hash, &expected));
        assert!(!equal_constant_time(&hash, &[0u8; 32]));
    }

    #[test]
    fn account_files_from_older_versions_still_load() {
        let dir = TempDir::new();
        let salt = vec![7u8; 16];
        let hash = derive("old-password-123", &salt, ITERATIONS)
            .unwrap()
            .to_vec();
        // Exactly the shape written before profile fields existed.
        let legacy = serde_json::json!({
            "username": "ali", "salt": salt, "hash": hash, "iterations": ITERATIONS
        });
        fs::write(dir.account(), serde_json::to_vec(&legacy).unwrap()).unwrap();
        let profile = get_profile(&dir.account()).unwrap();
        assert_eq!(profile.username, "ali");
        assert_eq!(profile.full_name, "");
        assert_eq!(profile.email, "");
        let account = read_account(&dir.account()).unwrap();
        assert!(verify_password(&account, "old-password-123").unwrap());
    }

    #[test]
    fn create_account_validates_and_refuses_to_overwrite() {
        let dir = TempDir::new();
        assert!(create_account(&dir.account(), "al", "long-enough-password").is_err());
        assert!(create_account(&dir.account(), "ali", "short").is_err());
        create_account(&dir.account(), "  ali  ", "long-enough-password").unwrap();
        assert_eq!(get_profile(&dir.account()).unwrap().username, "ali");
        let again = create_account(&dir.account(), "other", "another-long-password");
        assert_eq!(again.unwrap_err(), "An account already exists.");
    }

    #[test]
    fn profile_is_saved_trimmed_and_validated() {
        let dir = TempDir::new();
        create_account(&dir.account(), "ali", "long-enough-password").unwrap();
        let saved = update_profile(&dir.account(), "  Ali Baloch ", " ali@example.com ").unwrap();
        assert_eq!(saved.full_name, "Ali Baloch");
        assert_eq!(saved.email, "ali@example.com");
        assert_eq!(get_profile(&dir.account()).unwrap(), saved);
        // Password and username are untouched by a profile edit.
        let account = read_account(&dir.account()).unwrap();
        assert!(verify_password(&account, "long-enough-password").unwrap());
        assert_eq!(account.username, "ali");
        // Email may be cleared.
        assert_eq!(update_profile(&dir.account(), "Ali", "").unwrap().email, "");
        for bad in [
            "no-at-sign",
            "a@b",
            "a@@b.com",
            "@b.com",
            "a b@c.com",
            "a@.com",
            "a@b.",
        ] {
            assert!(update_profile(&dir.account(), "Ali", bad).is_err(), "{bad}");
        }
        assert!(update_profile(&dir.account(), &"x".repeat(101), "").is_err());
        assert!(update_profile(&dir.account(), "bad\nname", "").is_err());
    }

    #[test]
    fn password_change_requires_current_password_and_replaces_hash() {
        let dir = TempDir::new();
        create_account(&dir.account(), "ali", "first-long-password").unwrap();
        let before = read_account(&dir.account()).unwrap();
        let mut attempts = LoginAttempts::default();

        let wrong = change_password(
            &dir.account(),
            &mut attempts,
            "wrong",
            "second-long-password",
        );
        assert_eq!(wrong.unwrap_err(), "Your current password is incorrect.");
        let still_old = read_account(&dir.account()).unwrap();
        assert_eq!(still_old.hash, before.hash);

        let short = change_password(
            &dir.account(),
            &mut attempts,
            "first-long-password",
            "short",
        );
        assert!(short.unwrap_err().contains("at least 12"));
        let same = change_password(
            &dir.account(),
            &mut attempts,
            "first-long-password",
            "first-long-password",
        );
        assert!(same.unwrap_err().contains("different"));

        change_password(
            &dir.account(),
            &mut attempts,
            "first-long-password",
            "second-long-password",
        )
        .unwrap();
        let after = read_account(&dir.account()).unwrap();
        assert_ne!(after.hash, before.hash);
        assert_ne!(
            after.salt, before.salt,
            "a fresh salt is used for the new password"
        );
        assert_eq!(after.username, "ali");
        assert!(verify_password(&after, "second-long-password").unwrap());
        assert!(!verify_password(&after, "first-long-password").unwrap());
        assert!(
            !dir.0.join("account.json.tmp").exists(),
            "no temporary file is left behind"
        );
    }

    #[test]
    fn password_change_keeps_profile_fields() {
        let dir = TempDir::new();
        create_account(&dir.account(), "ali", "first-long-password").unwrap();
        update_profile(&dir.account(), "Ali Baloch", "ali@example.com").unwrap();
        let mut attempts = LoginAttempts::default();
        change_password(
            &dir.account(),
            &mut attempts,
            "first-long-password",
            "second-long-password",
        )
        .unwrap();
        let profile = get_profile(&dir.account()).unwrap();
        assert_eq!(profile.full_name, "Ali Baloch");
        assert_eq!(profile.email, "ali@example.com");
    }

    #[test]
    fn repeated_wrong_current_passwords_trigger_the_lockout() {
        let dir = TempDir::new();
        create_account(&dir.account(), "ali", "first-long-password").unwrap();
        let mut attempts = LoginAttempts::default();
        for _ in 0..5 {
            let result = change_password(
                &dir.account(),
                &mut attempts,
                "nope",
                "second-long-password",
            );
            assert_eq!(result.unwrap_err(), "Your current password is incorrect.");
        }
        // Even the correct password is refused while locked out.
        let blocked = change_password(
            &dir.account(),
            &mut attempts,
            "first-long-password",
            "second-long-password",
        );
        assert_eq!(
            blocked.unwrap_err(),
            "Too many attempts. Try again in 30 seconds."
        );
        let account = read_account(&dir.account()).unwrap();
        assert!(verify_password(&account, "first-long-password").unwrap());
    }

    #[test]
    fn damaged_account_files_are_reported() {
        let dir = TempDir::new();
        assert_eq!(
            read_account(&dir.account()).err().unwrap(),
            "Account is not set up."
        );
        fs::write(dir.account(), b"{ not json").unwrap();
        assert_eq!(
            read_account(&dir.account()).err().unwrap(),
            "Account data is damaged."
        );
        let mut attempts = LoginAttempts::default();
        assert!(change_password(&dir.account(), &mut attempts, "a", "b").is_err());
    }
}
