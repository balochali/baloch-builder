//! Google Drive REST calls used by the backup: find or create the backup folder, upload the
//! archive with a resumable (chunked) upload, list backups and delete old ones.

use super::oauth::{Endpoints, AUTH_EXPIRED};
use reqwest::header::{HeaderMap, CONTENT_RANGE};
use serde::Deserialize;
use std::{io::SeekFrom, path::Path, time::Duration};
use tokio::io::{AsyncReadExt, AsyncSeekExt};

pub const BACKUP_FOLDER_NAME: &str = "Baloch Builder Backups";
pub const BACKUP_FILE_PREFIX: &str = "Baloch-Builder-backup-";
/// Google requires chunk sizes that are multiples of 256 KiB.
const DEFAULT_CHUNK_BYTES: u64 = 8 * 1024 * 1024;
const MAX_ATTEMPTS: u32 = 4;
const MAX_STALLS: u32 = 3;

#[derive(Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub created_time: String,
}

enum ChunkOutcome {
    Done(DriveFile),
    /// Number of bytes Google has received so far.
    Next(u64),
}

pub struct DriveClient {
    http: reqwest::Client,
    endpoints: Endpoints,
    token: String,
    chunk_bytes: u64,
    retry_delay: Duration,
}

struct Reply {
    status: u16,
    headers: HeaderMap,
    body: String,
}

fn network_error(error: reqwest::Error) -> String {
    format!("Could not reach Google Drive. Check your internet connection. ({error})")
}

fn api_error(status: u16, body: &str) -> String {
    if status == 401 {
        return AUTH_EXPIRED.to_string();
    }
    let value: Option<serde_json::Value> = serde_json::from_str(body).ok();
    let reason = value
        .as_ref()
        .and_then(|v| v["error"]["errors"][0]["reason"].as_str())
        .unwrap_or("");
    let message = value
        .as_ref()
        .and_then(|v| v["error"]["message"].as_str())
        .unwrap_or("");
    match reason {
        "storageQuotaExceeded" => {
            "Your Google Drive is full. Free some space and try again.".into()
        }
        "rateLimitExceeded" | "userRateLimitExceeded" => {
            "Google asked the app to slow down. It will try again later.".into()
        }
        _ if message.is_empty() => format!("Google Drive error (HTTP {status})."),
        _ => format!("Google Drive error (HTTP {status}): {message}"),
    }
}

/// How many bytes Google reports having received, from a `Range: bytes=0-N` header.
fn received_bytes(headers: &HeaderMap) -> u64 {
    headers
        .get("range")
        .and_then(|value| value.to_str().ok())
        .and_then(|text| text.rsplit('-').next())
        .and_then(|last| last.trim().parse::<u64>().ok())
        .map(|last| last + 1)
        .unwrap_or(0)
}

fn parse_file(body: &str) -> Result<DriveFile, String> {
    serde_json::from_str(body).map_err(|_| "Google Drive sent an unexpected reply.".to_string())
}

fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() < 200
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Ids of backups older than the newest `keep`, never touching files that are not ours.
pub fn files_to_prune(files: &[DriveFile], keep: usize) -> Vec<String> {
    let mut backups: Vec<&DriveFile> = files
        .iter()
        .filter(|file| file.name.starts_with(BACKUP_FILE_PREFIX))
        .collect();
    backups.sort_by(|a, b| b.created_time.cmp(&a.created_time));
    backups
        .into_iter()
        .skip(keep.max(1))
        .map(|file| file.id.clone())
        .collect()
}

impl DriveClient {
    pub fn new(http: reqwest::Client, endpoints: Endpoints, access_token: String) -> Self {
        DriveClient {
            http,
            endpoints,
            token: access_token,
            chunk_bytes: DEFAULT_CHUNK_BYTES,
            retry_delay: Duration::from_secs(2),
        }
    }

    async fn send(&self, request: reqwest::RequestBuilder) -> Result<Reply, String> {
        let response = request.send().await.map_err(network_error)?;
        let status = response.status().as_u16();
        let headers = response.headers().clone();
        let body = response.text().await.unwrap_or_default();
        Ok(Reply {
            status,
            headers,
            body,
        })
    }

    pub async fn ensure_folder(
        &self,
        name: &str,
        known_id: Option<&str>,
    ) -> Result<String, String> {
        if let Some(id) = known_id.filter(|id| safe_id(id)) {
            let reply = self
                .send(
                    self.http
                        .get(format!("{}/files/{id}", self.endpoints.drive_api))
                        .bearer_auth(&self.token)
                        .query(&[("fields", "id,trashed")]),
                )
                .await?;
            match reply.status {
                200 => {
                    let value: serde_json::Value =
                        serde_json::from_str(&reply.body).unwrap_or_default();
                    if value["trashed"] != serde_json::Value::Bool(true) {
                        return Ok(id.to_string());
                    }
                }
                404 => {}
                status => return Err(api_error(status, &reply.body)),
            }
        }

        let query = format!(
            "name = '{name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        );
        let reply = self
            .send(
                self.http
                    .get(format!("{}/files", self.endpoints.drive_api))
                    .bearer_auth(&self.token)
                    .query(&[
                        ("q", query.as_str()),
                        ("fields", "files(id,name)"),
                        ("pageSize", "10"),
                    ]),
            )
            .await?;
        if reply.status != 200 {
            return Err(api_error(reply.status, &reply.body));
        }
        let value: serde_json::Value = serde_json::from_str(&reply.body).unwrap_or_default();
        if let Some(id) = value["files"][0]["id"].as_str() {
            return Ok(id.to_string());
        }

        let reply = self
            .send(
                self.http
                    .post(format!("{}/files", self.endpoints.drive_api))
                    .bearer_auth(&self.token)
                    .query(&[("fields", "id")])
                    .json(&serde_json::json!({
                        "name": name,
                        "mimeType": "application/vnd.google-apps.folder"
                    })),
            )
            .await?;
        if reply.status != 200 && reply.status != 201 {
            return Err(api_error(reply.status, &reply.body));
        }
        let value: serde_json::Value = serde_json::from_str(&reply.body).unwrap_or_default();
        value["id"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| "Google Drive did not return the new folder.".to_string())
    }

    async fn start_session(
        &self,
        folder_id: &str,
        name: &str,
        total: u64,
    ) -> Result<String, String> {
        let reply = self
            .send(
                self.http
                    .post(format!("{}/files", self.endpoints.drive_upload))
                    .bearer_auth(&self.token)
                    .query(&[("uploadType", "resumable"), ("fields", "id,name")])
                    .header("X-Upload-Content-Type", "application/zip")
                    .header("X-Upload-Content-Length", total.to_string())
                    .json(&serde_json::json!({
                        "name": name,
                        "parents": [folder_id],
                        "mimeType": "application/zip"
                    })),
            )
            .await?;
        if reply.status != 200 {
            return Err(api_error(reply.status, &reply.body));
        }
        reply
            .headers
            .get("location")
            .and_then(|value| value.to_str().ok())
            .map(String::from)
            .ok_or_else(|| "Google Drive did not start the upload.".to_string())
    }

    /// Asks Google how much of the upload it already has (used after an interruption).
    async fn query_status(&self, session: &str, total: u64) -> Result<ChunkOutcome, String> {
        let reply = self
            .send(
                self.http
                    .put(session)
                    .header(CONTENT_RANGE, format!("bytes */{total}")),
            )
            .await?;
        match reply.status {
            200 | 201 => Ok(ChunkOutcome::Done(parse_file(&reply.body)?)),
            308 => Ok(ChunkOutcome::Next(received_bytes(&reply.headers))),
            status => Err(api_error(status, &reply.body)),
        }
    }

    async fn put_chunk(
        &self,
        session: &str,
        data: Vec<u8>,
        offset: u64,
        total: u64,
    ) -> Result<ChunkOutcome, String> {
        let range = format!("bytes {offset}-{}/{total}", offset + data.len() as u64 - 1);
        let mut attempt = 0u32;
        loop {
            attempt += 1;
            // The upload address is self-authenticating, so no token is sent here; this also
            // means a long upload is not cut short when the access token expires.
            let failure = match self
                .send(
                    self.http
                        .put(session)
                        .header(CONTENT_RANGE, &range)
                        .body(data.clone()),
                )
                .await
            {
                Ok(reply) => match reply.status {
                    200 | 201 => return Ok(ChunkOutcome::Done(parse_file(&reply.body)?)),
                    308 => return Ok(ChunkOutcome::Next(received_bytes(&reply.headers))),
                    500 | 502 | 503 | 504 => {
                        format!("Google Drive is busy (HTTP {}).", reply.status)
                    }
                    status => return Err(api_error(status, &reply.body)),
                },
                Err(message) => message,
            };
            if attempt >= MAX_ATTEMPTS {
                return Err(failure);
            }
            tokio::time::sleep(self.retry_delay * 2u32.pow(attempt - 1)).await;
            match self.query_status(session, total).await {
                Ok(ChunkOutcome::Done(file)) => return Ok(ChunkOutcome::Done(file)),
                Ok(ChunkOutcome::Next(next)) if next != offset => {
                    return Ok(ChunkOutcome::Next(next))
                }
                _ => {}
            }
        }
    }

    pub async fn upload_file(
        &self,
        folder_id: &str,
        name: &str,
        path: &Path,
    ) -> Result<DriveFile, String> {
        let total = tokio::fs::metadata(path)
            .await
            .map_err(|e| e.to_string())?
            .len();
        if total == 0 {
            return Err("The backup file is empty.".into());
        }
        let session = self.start_session(folder_id, name, total).await?;
        let mut file = tokio::fs::File::open(path)
            .await
            .map_err(|e| e.to_string())?;
        let mut offset = 0u64;
        let mut stalls = 0u32;
        loop {
            let length = self.chunk_bytes.min(total - offset);
            file.seek(SeekFrom::Start(offset))
                .await
                .map_err(|e| e.to_string())?;
            let mut data = vec![0u8; length as usize];
            file.read_exact(&mut data)
                .await
                .map_err(|e| e.to_string())?;
            match self.put_chunk(&session, data, offset, total).await? {
                ChunkOutcome::Done(uploaded) => return Ok(uploaded),
                ChunkOutcome::Next(next) => {
                    if next > total {
                        return Err("Google Drive reported more data than was sent.".into());
                    }
                    if next <= offset {
                        stalls += 1;
                        if stalls >= MAX_STALLS {
                            return Err("Google Drive stopped accepting the upload.".into());
                        }
                    } else {
                        stalls = 0;
                    }
                    offset = next;
                }
            }
        }
    }

    pub async fn list_backups(&self, folder_id: &str) -> Result<Vec<DriveFile>, String> {
        if !safe_id(folder_id) {
            return Err("The backup folder id is not valid.".into());
        }
        let query = format!("'{folder_id}' in parents and trashed = false");
        let reply = self
            .send(
                self.http
                    .get(format!("{}/files", self.endpoints.drive_api))
                    .bearer_auth(&self.token)
                    .query(&[
                        ("q", query.as_str()),
                        ("fields", "files(id,name,createdTime)"),
                        ("orderBy", "createdTime desc"),
                        ("pageSize", "200"),
                    ]),
            )
            .await?;
        if reply.status != 200 {
            return Err(api_error(reply.status, &reply.body));
        }
        #[derive(Deserialize)]
        struct Listing {
            #[serde(default)]
            files: Vec<DriveFile>,
        }
        let listing: Listing = serde_json::from_str(&reply.body)
            .map_err(|_| "Google Drive sent an unexpected reply.".to_string())?;
        Ok(listing.files)
    }

    pub async fn delete_file(&self, id: &str) -> Result<(), String> {
        if !safe_id(id) {
            return Err("The file id is not valid.".into());
        }
        let reply = self
            .send(
                self.http
                    .delete(format!("{}/files/{id}", self.endpoints.drive_api))
                    .bearer_auth(&self.token),
            )
            .await?;
        match reply.status {
            200 | 204 | 404 => Ok(()),
            status => Err(api_error(status, &reply.body)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::backup::oauth::http_client;
    use std::{
        collections::HashMap,
        sync::{Arc, Mutex},
    };
    use tokio::{
        io::AsyncWriteExt,
        net::{TcpListener, TcpStream},
    };

    #[derive(Clone, Debug)]
    struct Req {
        method: String,
        target: String,
        headers: HashMap<String, String>,
        body: Vec<u8>,
    }
    struct Resp {
        status: u16,
        headers: Vec<(String, String)>,
        body: String,
    }
    fn ok(body: &str) -> Resp {
        Resp {
            status: 200,
            headers: vec![],
            body: body.into(),
        }
    }
    fn status(code: u16, body: &str) -> Resp {
        Resp {
            status: code,
            headers: vec![],
            body: body.into(),
        }
    }
    type Handler = Arc<dyn Fn(&Req) -> Resp + Send + Sync>;

    async fn handle(mut stream: TcpStream, handler: Handler) {
        let mut data = Vec::new();
        let mut buffer = [0u8; 16384];
        let header_end = loop {
            let read = stream.read(&mut buffer).await.unwrap_or(0);
            if read == 0 {
                return;
            }
            data.extend_from_slice(&buffer[..read]);
            if let Some(position) = data.windows(4).position(|window| window == b"\r\n\r\n") {
                break position + 4;
            }
        };
        let head = String::from_utf8_lossy(&data[..header_end]).to_string();
        let mut lines = head.lines();
        let mut first = lines.next().unwrap_or("").split_whitespace();
        let method = first.next().unwrap_or("").to_string();
        let target = first.next().unwrap_or("").to_string();
        let headers: HashMap<String, String> = lines
            .filter_map(|line| line.split_once(':'))
            .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string()))
            .collect();
        let length: usize = headers
            .get("content-length")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        while data.len() < header_end + length {
            let read = stream.read(&mut buffer).await.unwrap_or(0);
            if read == 0 {
                break;
            }
            data.extend_from_slice(&buffer[..read]);
        }
        let request = Req {
            method,
            target,
            headers,
            body: data[header_end..].to_vec(),
        };
        let response = handler(&request);
        let mut text = format!("HTTP/1.1 {} Test\r\n", response.status);
        for (key, value) in &response.headers {
            text.push_str(&format!("{key}: {value}\r\n"));
        }
        text.push_str(&format!(
            "Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            response.body.len(),
            response.body
        ));
        let _ = stream.write_all(text.as_bytes()).await;
        let _ = stream.shutdown().await;
    }

    /// Starts a tiny fake Google server and returns its base address.
    async fn serve(handler: impl Fn(&Req) -> Resp + Send + Sync + 'static) -> String {
        let handler: Handler = Arc::new(handler);
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                let (stream, _) = listener.accept().await.unwrap();
                tokio::spawn(handle(stream, handler.clone()));
            }
        });
        format!("http://127.0.0.1:{port}")
    }

    fn client(base: &str) -> DriveClient {
        let endpoints = Endpoints {
            drive_api: format!("{base}/drive/v3"),
            drive_upload: format!("{base}/upload/drive/v3"),
            ..Endpoints::default()
        };
        let mut client = DriveClient::new(http_client().unwrap(), endpoints, "ACCESS".into());
        client.retry_delay = Duration::from_millis(5);
        client
    }

    fn temp_file(label: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path =
            std::env::temp_dir().join(format!("bb-drive-{label}-{}.zip", std::process::id()));
        std::fs::write(&path, bytes).unwrap();
        path
    }

    fn pattern(length: usize) -> Vec<u8> {
        (0..length).map(|i| (i % 251) as u8).collect()
    }

    #[tokio::test]
    async fn the_backup_folder_is_created_when_it_does_not_exist() {
        let seen: Arc<Mutex<Vec<Req>>> = Arc::default();
        let log = seen.clone();
        let base = serve(move |req| {
            log.lock().unwrap().push(req.clone());
            match (req.method.as_str(), req.target.split('?').next().unwrap()) {
                ("GET", "/drive/v3/files") => ok(r#"{"files":[]}"#),
                ("POST", "/drive/v3/files") => ok(r#"{"id":"NEWFOLDER"}"#),
                _ => status(404, ""),
            }
        })
        .await;
        let id = client(&base)
            .ensure_folder(BACKUP_FOLDER_NAME, None)
            .await
            .unwrap();
        assert_eq!(id, "NEWFOLDER");
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0].headers["authorization"], "Bearer ACCESS");
        let (_, query) = seen[0].target.split_once('?').unwrap();
        let search: HashMap<String, String> = url::form_urlencoded::parse(query.as_bytes())
            .into_owned()
            .collect();
        assert_eq!(
            search["q"],
            "name = 'Baloch Builder Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        );
        let created: serde_json::Value = serde_json::from_slice(&seen[1].body).unwrap();
        assert_eq!(created["name"], BACKUP_FOLDER_NAME);
        assert_eq!(created["mimeType"], "application/vnd.google-apps.folder");
    }

    #[tokio::test]
    async fn a_known_folder_is_reused_and_a_deleted_one_is_replaced() {
        let calls: Arc<Mutex<Vec<String>>> = Arc::default();
        let log = calls.clone();
        let base = serve(move |req| {
            log.lock().unwrap().push(format!(
                "{} {}",
                req.method,
                req.target.split('?').next().unwrap()
            ));
            match req.target.split('?').next().unwrap() {
                "/drive/v3/files/GOOD" => ok(r#"{"id":"GOOD","trashed":false}"#),
                "/drive/v3/files/BINNED" => ok(r#"{"id":"BINNED","trashed":true}"#),
                "/drive/v3/files/GONE" => status(404, "{}"),
                "/drive/v3/files" if req.method == "GET" => {
                    ok(r#"{"files":[{"id":"FOUND","name":"x"}]}"#)
                }
                _ => status(500, ""),
            }
        })
        .await;
        let drive = client(&base);
        assert_eq!(
            drive
                .ensure_folder(BACKUP_FOLDER_NAME, Some("GOOD"))
                .await
                .unwrap(),
            "GOOD"
        );
        assert_eq!(
            calls.lock().unwrap().len(),
            1,
            "no search when the saved folder is fine"
        );
        assert_eq!(
            drive
                .ensure_folder(BACKUP_FOLDER_NAME, Some("BINNED"))
                .await
                .unwrap(),
            "FOUND"
        );
        assert_eq!(
            drive
                .ensure_folder(BACKUP_FOLDER_NAME, Some("GONE"))
                .await
                .unwrap(),
            "FOUND"
        );
        // An id with odd characters is never put into a URL.
        assert_eq!(
            drive
                .ensure_folder(BACKUP_FOLDER_NAME, Some("../evil"))
                .await
                .unwrap(),
            "FOUND"
        );
    }

    #[derive(Default)]
    struct Upload {
        ranges: Vec<String>,
        received: Vec<u8>,
        start_headers: HashMap<String, String>,
        start_body: serde_json::Value,
        put_had_authorization: bool,
    }

    #[tokio::test]
    async fn large_files_are_uploaded_in_chunks_and_arrive_intact() {
        let state: Arc<Mutex<Upload>> = Arc::default();
        let shared = state.clone();
        let base_cell: Arc<Mutex<String>> = Arc::default();
        let base_for_handler = base_cell.clone();
        let base = serve(move |req| {
            let mut upload = shared.lock().unwrap();
            if req.method == "POST" && req.target.starts_with("/upload/drive/v3/files") {
                upload.start_headers = req.headers.clone();
                upload.start_body = serde_json::from_slice(&req.body).unwrap();
                return Resp {
                    status: 200,
                    headers: vec![(
                        "Location".into(),
                        format!("{}/session/1", base_for_handler.lock().unwrap()),
                    )],
                    body: String::new(),
                };
            }
            assert_eq!(req.method, "PUT");
            assert_eq!(req.target, "/session/1");
            upload.put_had_authorization |= req.headers.contains_key("authorization");
            let range = req.headers["content-range"].clone();
            upload.ranges.push(range.clone());
            upload.received.extend_from_slice(&req.body);
            let spec = range.trim_start_matches("bytes ");
            let (span, total) = spec.split_once('/').unwrap();
            let (_, end) = span.split_once('-').unwrap();
            if end.parse::<u64>().unwrap() + 1 == total.parse::<u64>().unwrap() {
                ok(r#"{"id":"FILE1","name":"Baloch-Builder-backup-test.zip"}"#)
            } else {
                Resp {
                    status: 308,
                    headers: vec![("Range".into(), format!("bytes=0-{end}"))],
                    body: String::new(),
                }
            }
        })
        .await;
        *base_cell.lock().unwrap() = base.clone();

        let bytes = pattern(256 * 1024 * 2 + 5000);
        let path = temp_file("chunks", &bytes);
        let mut drive = client(&base);
        drive.chunk_bytes = 256 * 1024;
        let uploaded = drive
            .upload_file("FOLDER1", "Baloch-Builder-backup-test.zip", &path)
            .await
            .unwrap();
        assert_eq!(uploaded.id, "FILE1");

        let upload = state.lock().unwrap();
        let total = bytes.len();
        assert_eq!(
            upload.ranges,
            vec![
                format!("bytes 0-262143/{total}"),
                format!("bytes 262144-524287/{total}"),
                format!("bytes 524288-{}/{total}", total - 1),
            ]
        );
        assert_eq!(
            upload.received, bytes,
            "the reassembled upload equals the original file"
        );
        assert_eq!(upload.start_headers["authorization"], "Bearer ACCESS");
        assert_eq!(
            upload.start_headers["x-upload-content-length"],
            total.to_string()
        );
        assert_eq!(upload.start_body["parents"][0], "FOLDER1");
        assert_eq!(upload.start_body["name"], "Baloch-Builder-backup-test.zip");
        assert!(
            !upload.put_had_authorization,
            "chunks go to the self-authenticating session address"
        );
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn an_interrupted_chunk_is_resumed_from_where_google_left_off() {
        let committed: Arc<Mutex<Vec<u8>>> = Arc::default();
        let puts = Arc::new(Mutex::new(0u32));
        let shared = committed.clone();
        let count = puts.clone();
        let base_cell: Arc<Mutex<String>> = Arc::default();
        let base_for_handler = base_cell.clone();
        let base = serve(move |req| {
            if req.method == "POST" {
                return Resp {
                    status: 200,
                    headers: vec![(
                        "Location".into(),
                        format!("{}/session/9", base_for_handler.lock().unwrap()),
                    )],
                    body: String::new(),
                };
            }
            let range = req.headers["content-range"].clone();
            let mut bytes = shared.lock().unwrap();
            if range.starts_with("bytes */") {
                // Status query: report what has been committed so far.
                return if bytes.is_empty() {
                    status(308, "")
                } else {
                    Resp {
                        status: 308,
                        headers: vec![("Range".into(), format!("bytes=0-{}", bytes.len() - 1))],
                        body: String::new(),
                    }
                };
            }
            let mut n = count.lock().unwrap();
            *n += 1;
            if *n == 2 {
                return status(503, "{}"); // second chunk fails once, nothing stored
            }
            bytes.extend_from_slice(&req.body);
            let (span, total) = range.trim_start_matches("bytes ").split_once('/').unwrap();
            let end: u64 = span.split_once('-').unwrap().1.parse().unwrap();
            if end + 1 == total.parse::<u64>().unwrap() {
                ok(r#"{"id":"FILE2","name":"Baloch-Builder-backup-test.zip"}"#)
            } else {
                Resp {
                    status: 308,
                    headers: vec![("Range".into(), format!("bytes=0-{end}"))],
                    body: String::new(),
                }
            }
        })
        .await;
        *base_cell.lock().unwrap() = base.clone();

        let bytes = pattern(256 * 1024 * 3);
        let path = temp_file("resume", &bytes);
        let mut drive = client(&base);
        drive.chunk_bytes = 256 * 1024;
        let uploaded = drive
            .upload_file("F", "Baloch-Builder-backup-test.zip", &path)
            .await
            .unwrap();
        assert_eq!(uploaded.id, "FILE2");
        assert_eq!(
            *committed.lock().unwrap(),
            bytes,
            "no bytes lost or duplicated after the retry"
        );
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn expired_access_and_full_drives_give_clear_messages() {
        let base = serve(|req| {
            if req.target.contains("uploadType=resumable") {
                status(403, r#"{"error":{"message":"The user's Drive storage quota has been exceeded.","errors":[{"reason":"storageQuotaExceeded"}]}}"#)
            } else {
                status(401, r#"{"error":{"message":"Invalid Credentials"}}"#)
            }
        })
        .await;
        let drive = client(&base);
        let path = temp_file("errors", b"abc");
        let full = drive.upload_file("F", "n.zip", &path).await.unwrap_err();
        assert_eq!(
            full,
            "Your Google Drive is full. Free some space and try again."
        );
        let expired = drive
            .ensure_folder(BACKUP_FOLDER_NAME, None)
            .await
            .unwrap_err();
        assert_eq!(expired, AUTH_EXPIRED);
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn listing_and_deleting_old_backups_works() {
        let deleted: Arc<Mutex<Vec<String>>> = Arc::default();
        let log = deleted.clone();
        let base = serve(move |req| {
            if req.method == "DELETE" {
                log.lock().unwrap().push(req.target.clone());
                return status(204, "");
            }
            assert!(req.target.contains("%27FOLDER1%27") || req.target.contains("'FOLDER1'"));
            ok(r#"{"files":[
                {"id":"b3","name":"Baloch-Builder-backup-3.zip","createdTime":"2026-10-03T00:00:00.000Z"},
                {"id":"b1","name":"Baloch-Builder-backup-1.zip","createdTime":"2026-10-01T00:00:00.000Z"},
                {"id":"other","name":"holiday-photo.jpg","createdTime":"2026-09-01T00:00:00.000Z"},
                {"id":"b2","name":"Baloch-Builder-backup-2.zip","createdTime":"2026-10-02T00:00:00.000Z"}]}"#)
        })
        .await;
        let drive = client(&base);
        let files = drive.list_backups("FOLDER1").await.unwrap();
        assert_eq!(files.len(), 4);
        for id in files_to_prune(&files, 2) {
            drive.delete_file(&id).await.unwrap();
        }
        assert_eq!(
            *deleted.lock().unwrap(),
            vec!["/drive/v3/files/b1".to_string()]
        );
        assert!(drive.delete_file("../x").await.is_err());
    }

    #[test]
    fn pruning_keeps_the_newest_and_never_everything_or_foreign_files() {
        let file = |id: &str, name: &str, day: u32| DriveFile {
            id: id.into(),
            name: name.into(),
            created_time: format!("2026-10-{day:02}T00:00:00Z"),
        };
        let files = vec![
            file("a", "Baloch-Builder-backup-a.zip", 1),
            file("b", "Baloch-Builder-backup-b.zip", 2),
            file("c", "Baloch-Builder-backup-c.zip", 3),
            file("x", "unrelated.txt", 1),
        ];
        assert_eq!(files_to_prune(&files, 2), vec!["a"]);
        assert_eq!(files_to_prune(&files, 3), Vec::<String>::new());
        assert_eq!(
            files_to_prune(&files, 0),
            vec!["b", "a"],
            "at least one backup is always kept"
        );
    }
}
