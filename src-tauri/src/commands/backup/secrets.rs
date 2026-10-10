//! Stores the Google client secret and refresh token in the operating system's credential
//! store (Windows Credential Manager, macOS Keychain) instead of in a plain file.

pub const REFRESH_TOKEN: &str = "google-refresh-token";
pub const CLIENT_SECRET: &str = "google-client-secret";

#[cfg(any(windows, target_os = "macos"))]
mod store {
    use keyring::Entry;

    const SERVICE: &str = "com.baloch-pc.baloch-builder";

    fn entry(name: &str) -> Result<Entry, String> {
        Entry::new(SERVICE, name).map_err(|e| format!("Secure storage is unavailable: {e}"))
    }

    pub fn get(name: &str) -> Result<Option<String>, String> {
        match entry(name)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Could not read the saved Google sign-in: {e}")),
        }
    }

    pub fn set(name: &str, value: &str) -> Result<(), String> {
        entry(name)?
            .set_password(value)
            .map_err(|e| format!("Could not save the Google sign-in securely: {e}"))
    }

    pub fn delete(name: &str) -> Result<(), String> {
        match entry(name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Could not remove the saved Google sign-in: {e}")),
        }
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod store {
    const UNSUPPORTED: &str = "Secure credential storage is only available on Windows and macOS.";

    pub fn get(_name: &str) -> Result<Option<String>, String> {
        Ok(None)
    }

    pub fn set(_name: &str, _value: &str) -> Result<(), String> {
        Err(UNSUPPORTED.into())
    }

    pub fn delete(_name: &str) -> Result<(), String> {
        Ok(())
    }
}

pub use store::{delete, get, set};
