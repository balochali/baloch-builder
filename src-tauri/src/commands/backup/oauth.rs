//! Google sign-in for a desktop app: OAuth 2.0 authorization-code flow with PKCE and a
//! loopback redirect (`http://127.0.0.1:<port>`), as recommended by Google for installed apps.
//!
//! Only the `drive.file` scope is requested, so the app can see and manage just the backup
//! files it created itself, never the rest of the user's Drive.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

pub const AUTH_EXPIRED: &str =
    "Google access has expired or was removed. Reconnect Google Drive in Settings.";
const SCOPES: &str = "openid email https://www.googleapis.com/auth/drive.file";

/// Every Google URL in one place so tests can point the code at a local fake server.
#[derive(Clone, Debug)]
pub struct Endpoints {
    pub auth: String,
    pub token: String,
    pub userinfo: String,
    pub revoke: String,
    pub drive_api: String,
    pub drive_upload: String,
}

impl Default for Endpoints {
    fn default() -> Self {
        Endpoints {
            auth: "https://accounts.google.com/o/oauth2/v2/auth".into(),
            token: "https://oauth2.googleapis.com/token".into(),
            userinfo: "https://openidconnect.googleapis.com/v1/userinfo".into(),
            revoke: "https://oauth2.googleapis.com/revoke".into(),
            drive_api: "https://www.googleapis.com/drive/v3".into(),
            drive_upload: "https://www.googleapis.com/upload/drive/v3".into(),
        }
    }
}

/// One HTTP client for everything. Redirects are off because Google's resumable-upload
/// "keep going" answer (308) must be read by us, not followed.
pub fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(180))
        .user_agent(concat!("BalochBuilder/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("Could not start the network client: {e}"))
}

pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

pub fn challenge_for(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn new_pkce() -> Pkce {
    let mut random = [0u8; 64];
    OsRng.fill_bytes(&mut random);
    let verifier = URL_SAFE_NO_PAD.encode(random);
    let challenge = challenge_for(&verifier);
    Pkce {
        verifier,
        challenge,
    }
}

pub fn random_state() -> String {
    let mut random = [0u8; 24];
    OsRng.fill_bytes(&mut random);
    URL_SAFE_NO_PAD.encode(random)
}

pub fn auth_url(
    endpoints: &Endpoints,
    client_id: &str,
    redirect_uri: &str,
    challenge: &str,
    state: &str,
) -> Result<String, String> {
    url::Url::parse_with_params(
        &endpoints.auth,
        &[
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("response_type", "code"),
            ("scope", SCOPES),
            ("code_challenge", challenge),
            ("code_challenge_method", "S256"),
            ("state", state),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ],
    )
    .map(|url| url.to_string())
    .map_err(|e| format!("Could not build the Google sign-in address: {e}"))
}

#[derive(Debug, PartialEq)]
pub enum Callback {
    Code(String),
    /// Something else (for example the browser asking for a favicon).
    Ignore,
}

/// Reads the request line the browser sends to the loopback address, e.g.
/// `GET /?code=abc&state=xyz HTTP/1.1`.
pub fn parse_callback(request_line: &str, expected_state: &str) -> Result<Callback, String> {
    let mut parts = request_line.split_whitespace();
    let (Some("GET"), Some(target)) = (parts.next(), parts.next()) else {
        return Ok(Callback::Ignore);
    };
    let Ok(url) = url::Url::parse(&format!("http://127.0.0.1{target}")) else {
        return Ok(Callback::Ignore);
    };
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => error = Some(value.into_owned()),
            _ => {}
        }
    }
    if code.is_none() && error.is_none() {
        return Ok(Callback::Ignore);
    }
    if state.as_deref() != Some(expected_state) {
        return Err(
            "The Google sign-in response did not match this request. Please try again.".into(),
        );
    }
    if let Some(error) = error {
        return Err(if error == "access_denied" {
            "Google sign-in was cancelled.".into()
        } else {
            format!("Google sign-in failed ({error}).")
        });
    }
    Ok(Callback::Code(code.unwrap_or_default()))
}

fn page(title: &str, message: &str) -> String {
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{title}</title></head>\
         <body style=\"font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem\">\
         <h1>{title}</h1><p>{message}</p></body></html>"
    );
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\
         Connection: close\r\n\r\n{body}",
        body.len()
    )
}

/// Waits for the browser to come back to the loopback address and returns the one-time code.
pub async fn wait_for_code(
    listener: TcpListener,
    expected_state: &str,
    timeout: Duration,
) -> Result<String, String> {
    let waiting = async {
        loop {
            let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
            let mut buffer = vec![0u8; 8192];
            let read = match tokio::time::timeout(Duration::from_secs(10), stream.read(&mut buffer))
                .await
            {
                Ok(Ok(read)) => read,
                _ => continue,
            };
            let request = String::from_utf8_lossy(&buffer[..read]).to_string();
            let first_line = request.lines().next().unwrap_or("");
            match parse_callback(first_line, expected_state) {
                Ok(Callback::Ignore) => {
                    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
                }
                Ok(Callback::Code(code)) => {
                    let reply = page(
                        "Baloch Builder is connected",
                        "You can close this tab and return to the app.",
                    );
                    let _ = stream.write_all(reply.as_bytes()).await;
                    return Ok(code);
                }
                Err(message) => {
                    let reply = page("Sign-in did not finish", &message);
                    let _ = stream.write_all(reply.as_bytes()).await;
                    return Err(message);
                }
            }
        }
    };
    match tokio::time::timeout(timeout, waiting).await {
        Ok(result) => result,
        Err(_) => Err("Google sign-in timed out. Please try again.".into()),
    }
}

#[derive(Deserialize, Debug)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenError {
    error: Option<String>,
    error_description: Option<String>,
}

fn token_error(status: u16, body: &str) -> String {
    let parsed: Option<TokenError> = serde_json::from_str(body).ok();
    match parsed.as_ref().and_then(|e| e.error.as_deref()) {
        Some("invalid_grant") => AUTH_EXPIRED.to_string(),
        Some("invalid_client") | Some("unauthorized_client") => {
            "Google did not accept the saved Client ID and Client Secret. Check them in Settings."
                .into()
        }
        Some(code) => {
            let detail = parsed
                .as_ref()
                .and_then(|e| e.error_description.as_deref())
                .unwrap_or("");
            format!("Google sign-in error ({code}). {detail}")
                .trim()
                .to_string()
        }
        None => format!("Google sign-in failed (HTTP {status})."),
    }
}

async fn post_token(
    http: &reqwest::Client,
    endpoints: &Endpoints,
    form: &[(&str, &str)],
) -> Result<TokenResponse, String> {
    let response = http
        .post(&endpoints.token)
        .form(form)
        .send()
        .await
        .map_err(|e| format!("Could not reach Google. Check your internet connection. ({e})"))?;
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    if status != 200 {
        return Err(token_error(status, &body));
    }
    serde_json::from_str(&body).map_err(|_| "Google sent an unexpected reply.".to_string())
}

pub async fn exchange_code(
    http: &reqwest::Client,
    endpoints: &Endpoints,
    client_id: &str,
    client_secret: &str,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    post_token(
        http,
        endpoints,
        &[
            ("grant_type", "authorization_code"),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", redirect_uri),
        ],
    )
    .await
}

pub async fn refresh_access_token(
    http: &reqwest::Client,
    endpoints: &Endpoints,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<String, String> {
    post_token(
        http,
        endpoints,
        &[
            ("grant_type", "refresh_token"),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("refresh_token", refresh_token),
        ],
    )
    .await
    .map(|tokens| tokens.access_token)
}

#[derive(Deserialize)]
struct UserInfo {
    email: Option<String>,
}

pub async fn fetch_email(
    http: &reqwest::Client,
    endpoints: &Endpoints,
    access_token: &str,
) -> Result<String, String> {
    let response = http
        .get(&endpoints.userinfo)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err("Could not read the Google account email.".into());
    }
    let info: UserInfo = response.json().await.map_err(|e| e.to_string())?;
    info.email
        .ok_or_else(|| "Google did not share the account email.".to_string())
}

/// Tells Google to forget the token. Failure is not important, so it is only best effort.
pub async fn revoke(http: &reqwest::Client, endpoints: &Endpoints, token: &str) {
    let _ = http
        .post(&endpoints.revoke)
        .form(&[("token", token)])
        .send()
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpStream;

    #[test]
    fn pkce_challenge_matches_the_rfc_7636_example() {
        let challenge = challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
        assert_eq!(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn generated_pkce_values_are_valid_and_unique() {
        let first = new_pkce();
        let second = new_pkce();
        assert!((43..=128).contains(&first.verifier.len()));
        assert!(first
            .verifier
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_eq!(first.challenge, challenge_for(&first.verifier));
        assert_ne!(first.verifier, second.verifier);
        assert_ne!(random_state(), random_state());
    }

    #[test]
    fn auth_url_carries_every_required_parameter() {
        let url = auth_url(
            &Endpoints::default(),
            "my-id.apps.googleusercontent.com",
            "http://127.0.0.1:5555",
            "CH",
            "ST",
        )
        .unwrap();
        let parsed = url::Url::parse(&url).unwrap();
        assert_eq!(parsed.host_str(), Some("accounts.google.com"));
        let pairs: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
        assert_eq!(pairs["client_id"], "my-id.apps.googleusercontent.com");
        assert_eq!(pairs["redirect_uri"], "http://127.0.0.1:5555");
        assert_eq!(pairs["response_type"], "code");
        assert_eq!(pairs["code_challenge"], "CH");
        assert_eq!(pairs["code_challenge_method"], "S256");
        assert_eq!(pairs["state"], "ST");
        assert!(pairs["scope"].contains("https://www.googleapis.com/auth/drive.file"));
        assert!(
            !pairs["scope"].contains("auth/drive "),
            "never the full-Drive scope"
        );
        assert_eq!(pairs["access_type"], "offline");
    }

    #[test]
    fn callbacks_are_parsed_and_checked_against_the_state() {
        assert_eq!(
            parse_callback("GET /?code=4%2Fabc&state=S1 HTTP/1.1", "S1").unwrap(),
            Callback::Code("4/abc".into())
        );
        assert_eq!(
            parse_callback("GET /favicon.ico HTTP/1.1", "S1").unwrap(),
            Callback::Ignore
        );
        assert_eq!(parse_callback("garbage", "S1").unwrap(), Callback::Ignore);
        assert!(parse_callback("GET /?code=abc&state=OTHER HTTP/1.1", "S1")
            .unwrap_err()
            .contains("did not match"));
        assert!(
            parse_callback("GET /?code=abc HTTP/1.1", "S1").is_err(),
            "a missing state is refused"
        );
        assert_eq!(
            parse_callback("GET /?error=access_denied&state=S1 HTTP/1.1", "S1").unwrap_err(),
            "Google sign-in was cancelled."
        );
        assert!(
            parse_callback("GET /?error=server_error&state=S1 HTTP/1.1", "S1")
                .unwrap_err()
                .contains("server_error")
        );
    }

    #[test]
    fn token_errors_become_plain_messages() {
        assert_eq!(
            token_error(400, r#"{"error":"invalid_grant"}"#),
            AUTH_EXPIRED
        );
        assert!(token_error(401, r#"{"error":"invalid_client"}"#).contains("Client ID"));
        assert!(token_error(
            400,
            r#"{"error":"weird","error_description":"Details here"}"#
        )
        .contains("Details here"));
        assert!(token_error(500, "<html>").contains("HTTP 500"));
    }

    async fn browser_request(port: u16, line: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        stream
            .write_all(format!("{line}\r\nHost: 127.0.0.1\r\n\r\n").as_bytes())
            .await
            .unwrap();
        let mut reply = String::new();
        stream.read_to_string(&mut reply).await.unwrap();
        reply
    }

    #[tokio::test]
    async fn the_loopback_listener_returns_the_code_and_skips_favicon_requests() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let waiter = tokio::spawn(wait_for_code(listener, "STATE", Duration::from_secs(5)));
        let favicon = browser_request(port, "GET /favicon.ico HTTP/1.1").await;
        assert!(favicon.starts_with("HTTP/1.1 404"));
        let reply = browser_request(port, "GET /?code=THE-CODE&state=STATE HTTP/1.1").await;
        assert!(reply.contains("200 OK") && reply.contains("close this tab"));
        assert_eq!(waiter.await.unwrap().unwrap(), "THE-CODE");
    }

    #[tokio::test]
    async fn a_wrong_state_is_rejected_and_a_silent_browser_times_out() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let waiter = tokio::spawn(wait_for_code(listener, "STATE", Duration::from_secs(5)));
        let reply = browser_request(port, "GET /?code=EVIL&state=FORGED HTTP/1.1").await;
        assert!(reply.contains("did not finish"));
        assert!(waiter.await.unwrap().unwrap_err().contains("did not match"));

        let quiet = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let result = wait_for_code(quiet, "STATE", Duration::from_millis(200)).await;
        assert!(result.unwrap_err().contains("timed out"));
    }
}
