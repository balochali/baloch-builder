use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::os::windows::{io::AsRawHandle, process::CommandExt};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::Manager;
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::{JobObjects::*, Threading::*},
};
type Result<T> = std::result::Result<T, String>;
const VERSION: &str = env!("CARGO_PKG_VERSION");
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn random() -> String {
    let mut b = [0u8; 32];
    OsRng.fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}
#[derive(Serialize, Deserialize, Clone)]
struct Secrets {
    postgres: String,
    owner: String,
    app: String,
    totp: String,
}
impl Secrets {
    fn new() -> Self {
        Self {
            postgres: random(),
            owner: random(),
            app: random(),
            totp: random(),
        }
    }
    fn valid(&self) -> bool {
        [&self.postgres, &self.owner, &self.app, &self.totp]
            .iter()
            .all(|s| s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()))
            && self.postgres != self.owner
            && self.owner != self.app
    }
}
pub fn port(preferred: u16) -> Result<u16> {
    if let Ok(s) = TcpListener::bind(("127.0.0.1", preferred)) {
        return s.local_addr().map(|a| a.port()).map_err(err);
    }
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|s| s.local_addr())
        .map(|a| a.port())
        .map_err(err)
}
fn hidden(exe: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut c = Command::new(exe);
    c.creation_flags(0x08000000);
    c
}
fn protect(root: &Path) -> Result<()> {
    let out = hidden("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
        ])
        .output()
        .map_err(err)?;
    if !out.status.success() {
        return Err("Cannot determine data-folder owner".into());
    }
    let sid = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !sid.starts_with("S-1-") {
        return Err("Invalid Windows identity".into());
    }
    let status = hidden("icacls.exe")
        .arg(root)
        .args(["/inheritance:r", "/grant:r", &format!("*{sid}:(OI)(CI)F")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(err)?;
    if !status.success() {
        return Err("Cannot restrict data-folder permissions".into());
    }
    Ok(())
}
struct Job(HANDLE);
unsafe impl Send for Job {}
unsafe impl Sync for Job {}
impl Job {
    fn new() -> Result<Self> {
        unsafe {
            let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if h.is_null() {
                return Err("Cannot create process cleanup job".into());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                h,
                JobObjectExtendedLimitInformation,
                &info as *const _ as _,
                std::mem::size_of_val(&info) as u32,
            ) == 0
            {
                CloseHandle(h);
                return Err("Cannot configure process cleanup".into());
            }
            Ok(Self(h))
        }
    }
    fn spawn(&self, c: &mut Command) -> Result<Child> {
        #[link(name = "ntdll")]
        unsafe extern "system" {
            fn NtResumeProcess(handle: HANDLE) -> i32;
        }
        c.creation_flags(0x08000000 | 0x00000004);
        let mut child = c.spawn().map_err(err)?;
        unsafe {
            if AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) == 0 {
                let _ = child.kill();
                return Err("Cannot attach child to cleanup job".into());
            }
            if NtResumeProcess(child.as_raw_handle() as HANDLE) != 0 {
                let _ = child.kill();
                return Err("Cannot resume bundled runtime".into());
            }
        }
        Ok(child)
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
struct Log {
    path: PathBuf,
    secrets: Vec<String>,
}
impl Log {
    fn write(&self, bytes: &[u8]) {
        let mut text = String::from_utf8_lossy(bytes).to_string();
        for s in &self.secrets {
            text = text.replace(s, "[REDACTED]")
        }
        if text.len() > 5 * 1024 * 1024 {
            text = "Oversized log entry omitted\n".into();
        }
        if fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0) + text.len() as u64
            > 5 * 1024 * 1024
        {
            let _ = fs::remove_file(self.path.with_extension("log.4"));
            for i in (1..4).rev() {
                let _ = fs::rename(
                    self.path.with_extension(format!("log.{i}")),
                    self.path.with_extension(format!("log.{}", i + 1)),
                );
            }
            let _ = fs::rename(&self.path, self.path.with_extension("log.1"));
        }
        if let Ok(mut f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            let _ = f.write_all(text.as_bytes());
        }
    }
}
fn pump(stream: impl Read + Send + 'static, log: Arc<Mutex<Log>>) {
    thread::spawn(move || {
        use std::io::BufRead;
        let mut reader = std::io::BufReader::new(stream);
        loop {
            let mut line = Vec::new();
            match reader.read_until(b'\n', &mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if let Ok(l) = log.lock() {
                        l.write(&line);
                    }
                }
            }
        }
    });
}

pub struct Runtime {
    data: PathBuf,
    resources: PathBuf,
    secrets: Option<Secrets>,
    token: String,
    pg_port: u16,
    api_port: u16,
    job: Job,
    postgres: Option<Child>,
    api: Option<Child>,
    log: Arc<Mutex<Log>>,
    ready: bool,
}
impl Runtime {
    fn new(resources: PathBuf) -> Result<Self> {
        let data = PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA missing")?)
            .join("BalochBuilder");
        Self::new_at(resources, data)
    }
    fn new_at(resources: PathBuf, data: PathBuf) -> Result<Self> {
        fs::create_dir_all(&data).map_err(err)?;
        protect(&data)?;
        for name in ["backups", "logs", "config", "attachments"] {
            fs::create_dir_all(data.join(name)).map_err(err)?;
        }
        let log = Arc::new(Mutex::new(Log {
            path: data.join("logs/desktop.log"),
            secrets: vec![],
        }));
        Ok(Self {
            data,
            resources,
            secrets: None,
            token: random(),
            pg_port: 0,
            api_port: 0,
            job: Job::new()?,
            postgres: None,
            api: None,
            log,
            ready: false,
        })
    }
    fn bin(&self, name: &str) -> PathBuf {
        self.resources
            .join("postgres/bin")
            .join(format!("{name}.exe"))
    }
    fn node(&self) -> PathBuf {
        self.resources.join("node/node.exe")
    }
    fn env(&self, owner: bool) -> Value {
        let s = self.secrets.as_ref().unwrap();
        let url = |role: &str, pw: &str| {
            format!("postgresql://{role}:{pw}@127.0.0.1:{}/baloch", self.pg_port)
        };
        let mut e = json!({"DATABASE_URL":url("baloch_app",&s.app),"PORT":self.api_port.to_string(),"NODE_ENV":"production","COOKIE_SECURE":"false","TOTP_ENCRYPTION_KEY":s.totp,"DESKTOP_CONTROL_TOKEN":self.token,"BALOCH_INSTALLED_DATA":self.data,"BALOCH_PGDATA":self.data.join("postgres-data"),"ATTACHMENT_DIR":self.data.join("attachments"),"WEB_ROOT":self.resources.join("app/dist"),"MIGRATIONS_DIR":self.resources.join("app/migrations"),"PG_BIN":self.resources.join("postgres/bin"),"APP_VERSION":VERSION});
        if owner {
            let o = e.as_object_mut().unwrap();
            o.insert(
                "ADMIN_DATABASE_URL".into(),
                json!(url("postgres", &s.postgres)),
            );
            o.insert(
                "OWNER_DATABASE_URL".into(),
                json!(url("baloch_owner", &s.owner)),
            );
            o.insert("OWNER_PASSWORD".into(), json!(s.owner));
            o.insert("APP_PASSWORD".into(), json!(s.app));
        }
        e
    }
    fn command(&self, action: &str, name: Option<&str>) -> Result<Child> {
        let mut c = hidden(self.node());
        c.arg(self.resources.join("app/desktop.mjs"))
            .current_dir(self.resources.join("app"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped()); // Do not inherit development database credentials.
        for k in [
            "DATABASE_URL",
            "OWNER_DATABASE_URL",
            "ADMIN_DATABASE_URL",
            "NODE_OPTIONS",
            "NODE_PATH",
        ] {
            c.env_remove(k);
        }
        let mut child = self.job.spawn(&mut c)?;
        child
            .stdin
            .take()
            .unwrap()
            .write_all(
                json!({"action":action,"name":name,"env":self.env(action!="api")})
                    .to_string()
                    .as_bytes(),
            )
            .map_err(err)?;
        Ok(child)
    }
    fn operation(&self, action: &str, name: Option<&str>) -> Result<Value> {
        self.log
            .lock()
            .unwrap()
            .write(format!("Desktop operation: {action}\n").as_bytes());
        let out = self
            .command(action, name)?
            .wait_with_output()
            .map_err(err)?;
        self.log.lock().unwrap().write(&out.stderr);
        if !out.status.success() {
            return Err(format!(
                "{action} failed. See {}",
                self.data.join("logs/desktop.log").display()
            ));
        }
        serde_json::from_slice(&out.stdout).map_err(|_| format!("Invalid response from {action}"))
    }
    fn run(&self, c: &mut Command, label: &str) -> Result<()> {
        let out = self.job.spawn(c)?.wait_with_output().map_err(err)?;
        self.log.lock().unwrap().write(&out.stderr);
        if !out.status.success() {
            return Err(format!("{label} failed. See logs/desktop.log"));
        }
        Ok(())
    }
    fn start(&mut self) -> Result<()> {
        let version_path = self.data.join("config/data-version.json");
        if let Ok(s) = fs::read_to_string(&version_path) {
            let saved: Value = serde_json::from_str(&s).map_err(err)?;
            let old =
                semver::Version::parse(saved["version"].as_str().ok_or("Invalid data version")?)
                    .map_err(err)?;
            if old > semver::Version::parse(VERSION).map_err(err)? {
                return Err(
                    "This data was opened by a newer app. Install that version or later.".into(),
                );
            }
        }
        let file = self.data.join("config/secrets.json");
        let pgdata = self.data.join("postgres-data");
        let s = if file.exists() {
            serde_json::from_slice::<Secrets>(&fs::read(&file).map_err(err)?).map_err(|_| {
                "Secrets file is invalid; restore it from your protected data folder".to_string()
            })?
        } else {
            if pgdata.join("PG_VERSION").exists() {
                return Err("Database exists but secrets are missing. No data was changed.".into());
            }
            let s = Secrets::new();
            let mut f = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&file)
                .map_err(err)?;
            f.write_all(serde_json::to_string(&s).map_err(err)?.as_bytes())
                .map_err(err)?;
            f.sync_all().map_err(err)?;
            s
        };
        if !s.valid() {
            return Err("Secrets file failed validation".into());
        }
        self.log.lock().unwrap().secrets = vec![
            s.postgres.clone(),
            s.owner.clone(),
            s.app.clone(),
            s.totp.clone(),
            self.token.clone(),
        ];
        self.secrets = Some(s.clone());
        self.pg_port = port(54329)?;
        self.api_port = port(3217)?;
        if !pgdata.join("PG_VERSION").exists() {
            if pgdata.exists() && fs::read_dir(&pgdata).map_err(err)?.next().is_some() {
                return Err(
                    "Incomplete first-run database found. Preserve it and see the recovery guide."
                        .into(),
                );
            }
            let pw = self.data.join("config/init-password.tmp");
            fs::write(&pw, &s.postgres).map_err(err)?;
            let result = self.run(
                hidden(self.bin("initdb"))
                    .arg("-D")
                    .arg(&pgdata)
                    .args([
                        "-U",
                        "postgres",
                        "--encoding=UTF8",
                        "--auth=scram-sha-256",
                        "--locale=C",
                    ])
                    .arg("--pwfile")
                    .arg(&pw)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped()),
                "Initialize database",
            );
            let _ = fs::remove_file(&pw);
            result?;
            fs::write(
                pgdata.join("pg_hba.conf"),
                "host all all 127.0.0.1/32 scram-sha-256\n",
            )
            .map_err(err)?;
        }
        self.check_stale_pid(&pgdata)?;
        let mut c = hidden(self.bin("postgres"));
        c.arg("-D")
            .arg(&pgdata)
            .args([
                "-h",
                "127.0.0.1",
                "-p",
                &self.pg_port.to_string(),
                "-c",
                "log_min_error_statement=panic",
                "-c",
                "log_statement=none",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut pg = self.job.spawn(&mut c)?;
        pump(pg.stdout.take().unwrap(), self.log.clone());
        pump(pg.stderr.take().unwrap(), self.log.clone());
        self.postgres = Some(pg);
        let mut ready = false;
        for _ in 0..120 {
            let status = hidden(self.bin("pg_isready"))
                .args([
                    "-h",
                    "127.0.0.1",
                    "-p",
                    &self.pg_port.to_string(),
                    "-U",
                    "postgres",
                ])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map_err(err)?;
            if status.success() {
                ready = true;
                break;
            }
            thread::sleep(Duration::from_millis(500));
        }
        if !ready {
            return Err("PostgreSQL did not become ready; see logs/desktop.log".into());
        }
        self.operation("prepare", None)?;
        fs::write(version_path, json!({"version":VERSION}).to_string()).map_err(err)?;
        self.start_api()?;
        self.ready = true;
        Ok(())
    }
    fn check_stale_pid(&self, data: &Path) -> Result<()> {
        let file = data.join("postmaster.pid");
        if !file.exists() {
            return Ok(());
        }
        let text = fs::read_to_string(&file).map_err(err)?;
        let pid = text
            .lines()
            .next()
            .and_then(|p| p.parse::<u32>().ok())
            .ok_or("Invalid postmaster.pid; no files were removed")?;
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if !process.is_null() {
                CloseHandle(process);
                return Err("A process still owns the saved PostgreSQL PID. Close it before retrying; no PID file was removed.".into());
            }
            let error = windows_sys::Win32::Foundation::GetLastError();
            if error != 87 {
                return Err("Cannot prove that PostgreSQL's saved PID is stale".into());
            }
        }
        fs::remove_file(file).map_err(err)
    }
    fn start_api(&mut self) -> Result<()> {
        let mut child = self.command("api", None)?;
        pump(child.stdout.take().unwrap(), self.log.clone());
        pump(child.stderr.take().unwrap(), self.log.clone());
        self.api = Some(child);
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .map_err(err)?;
        for _ in 0..120 {
            if let Ok(r) = client
                .get(format!("http://127.0.0.1:{}/api/health", self.api_port))
                .header("x-desktop-probe", &self.token)
                .send()
            {
                if r.status().is_success()
                    && r.json::<Value>()
                        .map(|v| v["desktop"] == true)
                        .unwrap_or(false)
                {
                    return Ok(());
                }
            }
            thread::sleep(Duration::from_millis(500));
        }
        Err("API did not become ready; see logs/desktop.log".into())
    }
    fn stop_api(&mut self) {
        if let Some(mut c) = self.api.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
        self.ready = false;
    }
    fn stop(&mut self) {
        self.stop_api();
        if self.postgres.is_some() {
            let _ = hidden(self.bin("pg_ctl"))
                .arg("-D")
                .arg(self.data.join("postgres-data"))
                .args(["stop", "-m", "fast", "-w", "-t", "30"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            if let Some(mut c) = self.postgres.take() {
                let _ = c.kill();
                let _ = c.wait();
            }
        }
    }
    fn diagnostics(&self) -> Value {
        json!({"version":VERSION,"dataFolder":self.data,"database":if self.ready{"ready"}else{"stopped"},"postgresPort":self.pg_port,"apiPort":self.api_port,"logPath":self.data.join("logs/desktop.log")})
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        self.stop()
    }
}
pub struct Desktop(pub Mutex<Option<Runtime>>);
#[tauri::command]
pub async fn desktop_data(
    state: tauri::State<'_, Desktop>,
    action: String,
    token: String,
    name: Option<String>,
    confirmation: Option<String>,
) -> Result<Value> {
    let mut guard = state.0.lock().map_err(err)?;
    let r = guard.as_mut().ok_or("Desktop is not available")?;
    if token != r.token {
        return Err("Administrator authorization required".into());
    }
    match action.as_str() {
        "status" => {
            let mut info = r.diagnostics();
            info["backups"] = r.operation("list", None)?;
            Ok(info)
        }
        "diagnostics" => Ok(r.diagnostics()),
        "backup" => r.operation("backup", None),
        "open" => {
            hidden("explorer.exe").arg(&r.data).spawn().map_err(err)?;
            Ok(json!({}))
        }
        "restore" => {
            if confirmation.as_deref() != Some("RESTORE") {
                return Err("Type RESTORE to continue".into());
            }
            r.stop_api();
            let result = r.operation("restore", name.as_deref());
            let restart = r.start_api();
            r.ready = restart.is_ok();
            restart?;
            result
        }
        _ => Err("Unknown desktop action".into()),
    }
}
pub fn initialize(app: tauri::AppHandle) {
    thread::spawn(move || {
        let resources = match app.path().resource_dir() {
            Ok(p) => {
                // PostgreSQL's Windows helper commands do not accept verbatim \\?\ paths.
                let text = p.to_string_lossy();
                let plain = if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
                    format!(r"\\{}", unc)
                } else {
                    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
                };
                PathBuf::from(plain).join("resources")
            }
            Err(_) => return,
        };
        let state = app.state::<Desktop>();
        let mut guard = state.0.lock().unwrap();
        match Runtime::new(resources) {
            Ok(mut runtime) => {
                let outcome = runtime.start();
                let diagnostic = runtime.diagnostics();
                if let Some(w) = app.get_webview_window("main") {
                    match outcome {
                        Ok(()) => {
                            let _ = w.navigate(
                                format!("http://127.0.0.1:{}/", runtime.api_port)
                                    .parse()
                                    .unwrap(),
                            );
                        }
                        Err(message) => {
                            runtime.stop();
                            let payload = json!({"message":message,"diagnostics":diagnostic});
                            let _ = w.eval(&format!("window.showFailure({payload})"));
                        }
                    }
                }
                *guard = Some(runtime);
            }
            Err(message) => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.eval(&format!(
                        "window.showFailure({})",
                        json!({"message":message})
                    ));
                }
            }
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chooses_free_loopback_port() {
        let busy = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let p = busy.local_addr().unwrap().port();
        assert_ne!(port(p).unwrap(), p);
    }
    #[test]
    fn secrets_are_unique_and_valid() {
        let a = Secrets::new();
        let b = Secrets::new();
        assert!(a.valid());
        assert_ne!(a.postgres, b.postgres);
        assert!(!Secrets {
            app: a.owner.clone(),
            ..a
        }
        .valid());
    }
    #[test]
    fn stale_pid_requires_proof_and_never_removes_live_pid() {
        let data = std::env::temp_dir().join(format!("baloch-pid-test-{}", random()));
        let runtime = Runtime::new_at(PathBuf::new(), data.clone()).unwrap();
        fs::write(data.join("postmaster.pid"), std::process::id().to_string()).unwrap();
        assert!(runtime.check_stale_pid(&data).is_err());
        assert!(data.join("postmaster.pid").exists());
        fs::write(data.join("postmaster.pid"), "4294967294").unwrap();
        runtime.check_stale_pid(&data).unwrap();
        assert!(!data.join("postmaster.pid").exists());
        fs::write(data.join("postmaster.pid"), "invalid").unwrap();
        assert!(runtime.check_stale_pid(&data).is_err());
    }
    #[test]
    fn secrets_json_roundtrips_without_shared_passwords() {
        let folder = std::env::temp_dir().join(format!("baloch-secrets-test-{}", random()));
        fs::create_dir_all(&folder).unwrap();
        protect(&folder).unwrap();
        let secret = Secrets::new();
        let file = folder.join("secrets.json");
        fs::write(&file, serde_json::to_vec(&secret).unwrap()).unwrap();
        let loaded: Secrets = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        assert!(loaded.valid());
        assert_eq!(loaded.postgres, secret.postgres);
        let acl = hidden("icacls.exe").arg(&file).output().unwrap();
        assert!(acl.status.success());
        assert!(!String::from_utf8_lossy(&acl.stdout).contains("BUILTIN\\Users:"));
    }
    #[test]
    #[ignore = "Starts isolated bundled PostgreSQL; run after desktop:prepare"]
    fn bundled_lifecycle_setup_backup_restore() {
        let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
        let data = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("var")
            .join(format!("desktop-smoke-{}", random()));
        let mut r = Runtime::new_at(resources, data.clone()).unwrap();
        if let Err(e) = r.start() {
            panic!("{e}; log: {}", data.join("logs/desktop.log").display());
        }
        let client = reqwest::blocking::Client::new();
        let base = format!("http://127.0.0.1:{}", r.api_port);
        assert_eq!(
            client
                .get(format!("{base}/api/setup-status"))
                .send()
                .unwrap()
                .json::<Value>()
                .unwrap()["needed"],
            true
        );
        let password = random();
        let payload = json!({"companyName":"Desktop smoke","fullName":"Test administrator","username":"smokeadmin","email":"smoke@example.test","password":password,"confirm":password});
        assert_eq!(
            client
                .post(format!("{base}/api/setup"))
                .json(&payload)
                .send()
                .unwrap()
                .status()
                .as_u16(),
            403
        );
        let setup = client
            .post(format!("{base}/api/setup"))
            .header("x-requested-with", "BalochBuilder")
            .json(&payload)
            .send()
            .unwrap();
        assert_eq!(setup.status().as_u16(), 201, "{}", setup.text().unwrap());
        assert_eq!(
            client
                .post(format!("{base}/api/setup"))
                .header("x-requested-with", "BalochBuilder")
                .json(&payload)
                .send()
                .unwrap()
                .status()
                .as_u16(),
            409
        );
        let login = client
            .post(format!("{base}/api/login"))
            .header("x-requested-with", "BalochBuilder")
            .json(&json!({"username":"smokeadmin","password":password}))
            .send()
            .unwrap();
        assert!(login.status().is_success());
        let cookie = login
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_string();
        let before = r.operation("backup", None).unwrap()["name"]
            .as_str()
            .unwrap()
            .to_string();
        let id = client
            .post(format!("{base}/api/projects/reserve-id"))
            .header("Cookie", &cookie)
            .header("x-requested-with", "BalochBuilder")
            .json(&json!({}))
            .send()
            .unwrap()
            .json::<Value>()
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let created = client
            .post(format!("{base}/api/projects"))
            .header("Cookie", &cookie)
            .header("x-requested-with", "BalochBuilder")
            .json(&json!({"id":id,"name":"Restore verification"}))
            .send()
            .unwrap();
        assert!(created.status().is_success(), "{}", created.text().unwrap());
        r.stop_api();
        r.operation("restore", Some(&before)).unwrap();
        r.start_api().unwrap();
        let login = client
            .post(format!("{base}/api/login"))
            .header("x-requested-with", "BalochBuilder")
            .json(&json!({"username":"smokeadmin","password":password}))
            .send()
            .unwrap();
        let cookie = login
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_string();
        assert_eq!(
            client
                .get(format!("{base}/api/projects/{id}"))
                .header("Cookie", cookie)
                .send()
                .unwrap()
                .status()
                .as_u16(),
            404
        );
        let bad = "baloch-20000101-000000.dump";
        fs::write(data.join("backups").join(bad), "broken").unwrap();
        r.stop_api();
        assert!(r.operation("restore", Some(bad)).is_err());
        r.start_api().unwrap();
        let pg_port = r.pg_port;
        let api_port = r.api_port;
        r.stop();
        assert!(TcpListener::bind(("127.0.0.1", pg_port)).is_ok());
        assert!(TcpListener::bind(("127.0.0.1", api_port)).is_ok());
        r.start().unwrap();
        r.stop();
    }
}
