//! Backup preferences and the record of the last backup, stored as a small JSON file next to
//! the account file. Secrets (the Google client secret and refresh token) are NOT stored here;
//! they live in the operating system's credential store (see `secrets.rs`).

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};

pub const DEFAULT_KEEP: u32 = 10;
pub const MAX_KEEP: u32 = 60;
/// After a failed automatic backup, wait this long before trying again.
const RETRY_AFTER_ERROR_MINUTES: i64 = 60;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Frequency {
    Daily,
    Weekly,
}

impl Frequency {
    pub fn interval(self) -> Duration {
        match self {
            Frequency::Daily => Duration::hours(24),
            Frequency::Weekly => Duration::days(7),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Frequency::Daily => "daily",
            Frequency::Weekly => "weekly",
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "daily" => Ok(Frequency::Daily),
            "weekly" => Ok(Frequency::Weekly),
            _ => Err("Choose daily or weekly backups.".into()),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BackupSettings {
    /// Google OAuth client ID (public by design; the secret is kept in the credential store).
    pub client_id: String,
    pub google_email: Option<String>,
    /// Drive folder that holds the backups, remembered so it is not searched for every time.
    pub folder_id: Option<String>,
    pub auto_enabled: bool,
    pub frequency: Frequency,
    /// How many backups to keep in Drive; older ones are deleted after each upload.
    pub keep: u32,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
    /// "ok" or "error".
    pub last_status: Option<String>,
    pub last_message: Option<String>,
    pub last_size_bytes: Option<u64>,
}

impl Default for BackupSettings {
    fn default() -> Self {
        BackupSettings {
            client_id: String::new(),
            google_email: None,
            folder_id: None,
            auto_enabled: false,
            frequency: Frequency::Daily,
            keep: DEFAULT_KEEP,
            last_attempt_at: None,
            last_success_at: None,
            last_status: None,
            last_message: None,
            last_size_bytes: None,
        }
    }
}

fn parse_time(value: &Option<String>) -> Option<DateTime<Utc>> {
    value
        .as_deref()
        .and_then(|text| DateTime::parse_from_rfc3339(text).ok())
        .map(|time| time.with_timezone(&Utc))
}

impl BackupSettings {
    /// True when an automatic backup should run now. The caller also checks that Google Drive
    /// is connected.
    pub fn is_due(&self, now: DateTime<Utc>) -> bool {
        self.next_due(now).map(|due| now >= due).unwrap_or(false)
    }

    /// When the next automatic backup is due, or `None` if automatic backups are off.
    pub fn next_due(&self, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
        if !self.auto_enabled {
            return None;
        }
        let mut due = match parse_time(&self.last_success_at) {
            Some(last) => last + self.frequency.interval(),
            None => now,
        };
        if self.last_status.as_deref() == Some("error") {
            if let Some(attempt) = parse_time(&self.last_attempt_at) {
                let retry = attempt + Duration::minutes(RETRY_AFTER_ERROR_MINUTES);
                if retry > due {
                    due = retry;
                }
            }
        }
        Some(due)
    }

    pub fn record_success(&mut self, now: DateTime<Utc>, size_bytes: u64, folder_id: String) {
        let stamp = now.to_rfc3339();
        self.last_attempt_at = Some(stamp.clone());
        self.last_success_at = Some(stamp);
        self.last_status = Some("ok".into());
        self.last_message = None;
        self.last_size_bytes = Some(size_bytes);
        self.folder_id = Some(folder_id);
    }

    pub fn record_failure(&mut self, now: DateTime<Utc>, message: &str) {
        self.last_attempt_at = Some(now.to_rfc3339());
        self.last_status = Some("error".into());
        self.last_message = Some(message.to_string());
    }
}

/// Loads the settings; a missing or unreadable file means "defaults".
pub fn load(path: &Path) -> BackupSettings {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

/// Saves the settings by writing a temporary file and renaming it over the original.
pub fn save(path: &Path, settings: &BackupSettings) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid settings path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&temporary, path).map_err(|e| {
        let _ = fs::remove_file(&temporary);
        e.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(hour: u32, day: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, day, hour, 0, 0).unwrap()
    }

    fn enabled(frequency: Frequency) -> BackupSettings {
        BackupSettings {
            auto_enabled: true,
            frequency,
            ..BackupSettings::default()
        }
    }

    #[test]
    fn nothing_is_due_while_automatic_backup_is_off() {
        let settings = BackupSettings::default();
        assert!(!settings.is_due(at(12, 10)));
        assert_eq!(settings.next_due(at(12, 10)), None);
    }

    #[test]
    fn first_automatic_backup_is_due_immediately() {
        assert!(enabled(Frequency::Daily).is_due(at(12, 10)));
    }

    #[test]
    fn daily_and_weekly_intervals_are_respected() {
        let mut daily = enabled(Frequency::Daily);
        daily.record_success(at(9, 10), 100, "folder".into());
        assert!(!daily.is_due(at(8, 11)), "23 hours later is too early");
        assert!(daily.is_due(at(9, 11)), "exactly 24 hours later is due");

        let mut weekly = enabled(Frequency::Weekly);
        weekly.record_success(at(9, 10), 100, "folder".into());
        assert!(!weekly.is_due(at(9, 16)));
        assert!(weekly.is_due(at(9, 17)));
        assert_eq!(weekly.next_due(at(10, 10)), Some(at(9, 17)));
    }

    #[test]
    fn a_failed_attempt_is_retried_after_an_hour_not_immediately() {
        let mut settings = enabled(Frequency::Daily);
        settings.record_failure(at(9, 10), "Drive is full");
        assert_eq!(settings.last_status.as_deref(), Some("error"));
        assert!(!settings.is_due(at(9, 10)));
        let almost = at(9, 10) + Duration::minutes(59);
        assert!(!settings.is_due(almost));
        assert!(settings.is_due(at(10, 10)));
    }

    #[test]
    fn success_clears_the_previous_error() {
        let mut settings = enabled(Frequency::Daily);
        settings.record_failure(at(9, 10), "network down");
        settings.record_success(at(11, 10), 2048, "folder-1".into());
        assert_eq!(settings.last_status.as_deref(), Some("ok"));
        assert_eq!(settings.last_message, None);
        assert_eq!(settings.last_size_bytes, Some(2048));
        assert_eq!(settings.folder_id.as_deref(), Some("folder-1"));
    }

    #[test]
    fn missing_or_corrupt_files_give_defaults_and_saves_round_trip() {
        let dir = std::env::temp_dir().join(format!("bb-settings-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("backup-settings.json");
        assert_eq!(load(&path), BackupSettings::default());

        let mut settings = enabled(Frequency::Weekly);
        settings.client_id = "abc.apps.googleusercontent.com".into();
        settings.google_email = Some("ali@gmail.com".into());
        settings.keep = 20;
        save(&path, &settings).unwrap();
        assert_eq!(load(&path), settings);
        assert!(!dir.join("backup-settings.json.tmp").exists());

        fs::write(&path, b"{ broken").unwrap();
        assert_eq!(load(&path), BackupSettings::default());
        // A file from an older version with fewer fields still loads.
        fs::write(&path, br#"{"clientId":"x","autoEnabled":true}"#).unwrap();
        let partial = load(&path);
        assert_eq!(partial.client_id, "x");
        assert!(partial.auto_enabled);
        assert_eq!(partial.keep, DEFAULT_KEEP);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn frequency_parses_only_known_values() {
        assert_eq!(Frequency::parse("daily").unwrap(), Frequency::Daily);
        assert_eq!(Frequency::parse("weekly").unwrap(), Frequency::Weekly);
        assert!(Frequency::parse("hourly").is_err());
    }
}
