//! Backups to the user's own Google Drive: sign-in, "back up now", the automatic schedule and
//! the status shown on the Settings page.
//!
//! What a backup contains: a consistent copy of the database plus every attachment file, zipped
//! and uploaded to a "Baloch Builder Backups" folder. The login file is never included.

mod archive;
mod drive;
mod oauth;
mod secrets;
mod settings;
mod snapshot;

use chrono::{Local, Utc};
use serde::Serialize;
use settings::{BackupSettings, Frequency};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(180);
/// How often the scheduler wakes up to see whether an automatic backup is due.
const SCHEDULER_INTERVAL: Duration = Duration::from_secs(30 * 60);
/// Delay after start-up before the first check, so the app can finish opening.
const SCHEDULER_FIRST_CHECK: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct BackupState {
    running: AtomicBool,
    connecting: AtomicBool,
}

/// Holds a "busy" flag for as long as it lives, so two backups can never overlap.
struct Busy<'a>(&'a AtomicBool);

impl<'a> Busy<'a> {
    fn acquire(flag: &'a AtomicBool) -> Option<Self> {
        flag.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .ok()
            .map(|_| Busy(flag))
    }
}

impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// A scratch folder that is wiped when it is created and again when it goes out of scope.
struct ScratchDir(PathBuf);

impl ScratchDir {
    fn create(path: PathBuf) -> Result<Self, String> {
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path)
            .map_err(|e| format!("Could not prepare a temporary folder: {e}"))?;
        Ok(ScratchDir(path))
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for ScratchDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map_err(|e| e.to_string())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("backup-settings.json"))
}

fn attachments_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("attachments"))
}

/// Same location the SQL plugin and `save_project_stage` use.
fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("baloch-builder.db"))
}

fn is_connected() -> bool {
    secrets::get(secrets::REFRESH_TOKEN)
        .map(|token| token.is_some())
        .unwrap_or(false)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatus {
    pub client_id: String,
    /// A Client ID and Client Secret are both saved.
    pub credentials_saved: bool,
    pub connected: bool,
    pub google_email: Option<String>,
    pub folder_name: String,
    pub auto_enabled: bool,
    pub frequency: String,
    pub keep: u32,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
    pub last_status: Option<String>,
    pub last_message: Option<String>,
    pub last_size_bytes: Option<u64>,
    pub next_due_at: Option<String>,
    pub running: bool,
}

fn build_status(app: &AppHandle) -> Result<BackupStatus, String> {
    let settings = settings::load(&settings_path(app)?);
    let connected = is_connected();
    let secret_saved = secrets::get(secrets::CLIENT_SECRET)
        .ok()
        .flatten()
        .is_some();
    let running = app.state::<BackupState>().running.load(Ordering::SeqCst);
    let next_due_at = if connected {
        settings.next_due(Utc::now()).map(|time| time.to_rfc3339())
    } else {
        None
    };
    Ok(BackupStatus {
        credentials_saved: !settings.client_id.is_empty() && secret_saved,
        client_id: settings.client_id,
        connected,
        google_email: settings.google_email,
        folder_name: drive::BACKUP_FOLDER_NAME.to_string(),
        auto_enabled: settings.auto_enabled,
        frequency: settings.frequency.as_str().to_string(),
        keep: settings.keep,
        last_attempt_at: settings.last_attempt_at,
        last_success_at: settings.last_success_at,
        last_status: settings.last_status,
        last_message: settings.last_message,
        last_size_bytes: settings.last_size_bytes,
        next_due_at,
        running,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataLocations {
    pub data_dir: String,
    pub database_path: String,
    pub attachments_dir: String,
}

/// Where the records live on this computer, shown on the Settings page.
#[tauri::command]
pub fn get_data_locations(app: AppHandle) -> Result<DataLocations, String> {
    let text = |path: PathBuf| path.to_string_lossy().to_string();
    Ok(DataLocations {
        data_dir: text(data_dir(&app)?),
        database_path: text(database_path(&app)?),
        attachments_dir: text(attachments_dir(&app)?),
    })
}

#[tauri::command]
pub fn get_backup_status(app: AppHandle) -> Result<BackupStatus, String> {
    build_status(&app)
}

/// Saves the Google OAuth client the user created in their own Google Cloud project.
/// The secret goes to the system credential store; only the (public) Client ID is kept in the
/// settings file. Changing the client invalidates any earlier Google sign-in.
#[tauri::command]
pub fn save_google_credentials(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<BackupStatus, String> {
    let client_id = client_id.trim().to_string();
    let client_secret = client_secret.trim().to_string();
    let invalid = |value: &str| {
        value.is_empty()
            || value.len() > 300
            || value.chars().any(|c| c.is_whitespace() || c.is_control())
    };
    if invalid(&client_id) || invalid(&client_secret) {
        return Err(
            "Enter both the Client ID and the Client Secret exactly as Google shows them.".into(),
        );
    }
    secrets::set(secrets::CLIENT_SECRET, &client_secret)?;
    secrets::delete(secrets::REFRESH_TOKEN)?;
    let path = settings_path(&app)?;
    let mut current = settings::load(&path);
    current.client_id = client_id;
    current.google_email = None;
    current.folder_id = None;
    current.auto_enabled = false;
    settings::save(&path, &current)?;
    build_status(&app)
}

/// Opens Google's sign-in page in the browser and waits for the user to approve access.
#[tauri::command]
pub async fn connect_google_drive(app: AppHandle) -> Result<BackupStatus, String> {
    let state = app.state::<BackupState>();
    let _signing_in = Busy::acquire(&state.connecting).ok_or(
        "Google sign-in is already open. Finish it in your browser, or wait for it to time out.",
    )?;

    let path = settings_path(&app)?;
    let mut current = settings::load(&path);
    let client_secret = secrets::get(secrets::CLIENT_SECRET)?.unwrap_or_default();
    if current.client_id.is_empty() || client_secret.is_empty() {
        return Err("Save your Google Client ID and Client Secret first.".into());
    }

    let endpoints = oauth::Endpoints::default();
    let http = oauth::http_client()?;
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| format!("Could not start the local sign-in listener: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let pkce = oauth::new_pkce();
    let expected_state = oauth::random_state();
    let url = oauth::auth_url(
        &endpoints,
        &current.client_id,
        &redirect_uri,
        &pkce.challenge,
        &expected_state,
    )?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Could not open your browser: {e}"))?;

    let code = oauth::wait_for_code(listener, &expected_state, SIGN_IN_TIMEOUT).await?;
    let tokens = oauth::exchange_code(
        &http,
        &endpoints,
        &current.client_id,
        &client_secret,
        &code,
        &pkce.verifier,
        &redirect_uri,
    )
    .await?;
    let refresh_token = tokens.refresh_token.ok_or(
        "Google did not allow ongoing access. Remove Baloch Builder at myaccount.google.com/permissions and connect again.",
    )?;
    let email = oauth::fetch_email(&http, &endpoints, &tokens.access_token)
        .await
        .ok();

    secrets::set(secrets::REFRESH_TOKEN, &refresh_token)?;
    current.google_email = email;
    current.folder_id = None;
    settings::save(&path, &current)?;
    build_status(&app)
}

/// Signs out of Google Drive. Already-uploaded backups stay in Drive.
#[tauri::command]
pub async fn disconnect_google_drive(
    app: AppHandle,
    forget_credentials: bool,
) -> Result<BackupStatus, String> {
    if let Some(token) = secrets::get(secrets::REFRESH_TOKEN)? {
        if let Ok(http) = oauth::http_client() {
            oauth::revoke(&http, &oauth::Endpoints::default(), &token).await;
        }
    }
    secrets::delete(secrets::REFRESH_TOKEN)?;
    let path = settings_path(&app)?;
    let mut current = settings::load(&path);
    current.google_email = None;
    current.folder_id = None;
    current.auto_enabled = false;
    if forget_credentials {
        secrets::delete(secrets::CLIENT_SECRET)?;
        current.client_id = String::new();
    }
    settings::save(&path, &current)?;
    build_status(&app)
}

#[tauri::command]
pub fn set_backup_schedule(
    app: AppHandle,
    enabled: bool,
    frequency: String,
    keep: u32,
) -> Result<BackupStatus, String> {
    let frequency = Frequency::parse(&frequency)?;
    if keep == 0 || keep > settings::MAX_KEEP {
        return Err(format!(
            "Keep between 1 and {} backups.",
            settings::MAX_KEEP
        ));
    }
    if enabled && !is_connected() {
        return Err("Connect Google Drive before turning on automatic backups.".into());
    }
    let path = settings_path(&app)?;
    let mut current = settings::load(&path);
    current.auto_enabled = enabled;
    current.frequency = frequency;
    current.keep = keep;
    settings::save(&path, &current)?;
    build_status(&app)
}

#[tauri::command]
pub async fn run_backup_now(app: AppHandle) -> Result<BackupStatus, String> {
    perform_backup(&app).await?;
    build_status(&app)
}

/// Runs one backup and records the outcome (success or failure) in the settings file.
async fn perform_backup(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<BackupState>();
    let _running = Busy::acquire(&state.running)
        .ok_or("A backup is already running. Please wait for it to finish.")?;

    let outcome = run_backup(app).await;

    let now = Utc::now();
    if let Ok(path) = settings_path(app) {
        let mut current = settings::load(&path);
        match &outcome {
            Ok((size_bytes, folder_id)) => {
                current.record_success(now, *size_bytes, folder_id.clone())
            }
            Err(message) => current.record_failure(now, message),
        }
        let _ = settings::save(&path, &current);
    }
    if matches!(&outcome, Err(message) if message == oauth::AUTH_EXPIRED) {
        // Google no longer honours the saved sign-in, so ask the user to connect again.
        let _ = secrets::delete(secrets::REFRESH_TOKEN);
    }
    drop(_running);
    if let Ok(status) = build_status(app) {
        let _ = app.emit("backup-finished", status);
    }
    outcome.map(|_| ())
}

/// The actual work: snapshot, zip, upload, tidy up. Returns the archive size and Drive folder.
async fn run_backup(app: &AppHandle) -> Result<(u64, String), String> {
    let current = settings::load(&settings_path(app)?);
    let refresh_token =
        secrets::get(secrets::REFRESH_TOKEN)?.ok_or("Connect Google Drive in Settings first.")?;
    let client_secret = secrets::get(secrets::CLIENT_SECRET)?.unwrap_or_default();
    if current.client_id.is_empty() || client_secret.is_empty() {
        return Err("Save your Google Client ID and Client Secret in Settings first.".into());
    }

    let http = oauth::http_client()?;
    let endpoints = oauth::Endpoints::default();
    let access_token = oauth::refresh_access_token(
        &http,
        &endpoints,
        &current.client_id,
        &client_secret,
        &refresh_token,
    )
    .await?;

    let scratch = ScratchDir::create(data_dir(app)?.join("backup-tmp"))?;
    let snapshot_path = scratch.path().join("snapshot.db");
    snapshot::snapshot_database(&database_path(app)?, &snapshot_path).await?;

    let file_name = format!(
        "{}{}.zip",
        drive::BACKUP_FILE_PREFIX,
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    );
    let zip_path = scratch.path().join(&file_name);
    let attachments = attachments_dir(app)?;
    let version = app.package_info().version.to_string();
    let created_at = Utc::now().to_rfc3339();
    let info = {
        let zip_path = zip_path.clone();
        tauri::async_runtime::spawn_blocking(move || {
            archive::build_archive(
                &snapshot_path,
                &attachments,
                &zip_path,
                &version,
                &created_at,
            )
        })
        .await
        .map_err(|e| format!("The backup stopped unexpectedly: {e}"))??
    };

    let client = drive::DriveClient::new(http, endpoints, access_token);
    let folder_id = client
        .ensure_folder(drive::BACKUP_FOLDER_NAME, current.folder_id.as_deref())
        .await?;
    client
        .upload_file(&folder_id, &file_name, &zip_path)
        .await?;

    // Tidying up is best effort: a failure here must not turn a good backup into an error.
    if let Ok(files) = client.list_backups(&folder_id).await {
        for id in drive::files_to_prune(&files, current.keep as usize) {
            let _ = client.delete_file(&id).await;
        }
    }
    Ok((info.size_bytes, folder_id))
}

fn automatic_backup_due(app: &AppHandle) -> bool {
    let Ok(path) = settings_path(app) else {
        return false;
    };
    let current = settings::load(&path);
    !current.client_id.is_empty() && is_connected() && current.is_due(Utc::now())
}

/// Starts the background loop that makes automatic backups while the app is open. If the app
/// was closed when a backup came due, the first check after start-up catches up.
pub fn spawn_scheduler(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SCHEDULER_FIRST_CHECK).await;
        loop {
            if automatic_backup_due(&app) {
                let _ = perform_backup(&app).await;
            }
            tokio::time::sleep(SCHEDULER_INTERVAL).await;
        }
    });
}
