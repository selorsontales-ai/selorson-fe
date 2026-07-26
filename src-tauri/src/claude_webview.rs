use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tauri::Manager;
use tokio::sync::Mutex;

const CDP_PORT_START: u16 = 49_152;
const CDP_PORT_END: u16 = 65_535;
const CDP_CONNECT_TIMEOUT: Duration = Duration::from_millis(250);
const CDP_IO_TIMEOUT: Duration = Duration::from_millis(500);
const CDP_READY_ATTEMPTS: usize = 40;
const CDP_READY_INTERVAL: Duration = Duration::from_millis(500);
const WINDOW_CLOSE_ATTEMPTS: usize = 20;
const WINDOW_CLOSE_INTERVAL: Duration = Duration::from_millis(100);
const CLAUDE_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

#[derive(Clone, Debug)]
struct ManagedClaudeSession {
    account_id: i64,
    label: String,
    cdp_port: u16,
    profile_dir: PathBuf,
}

#[derive(Debug)]
struct CdpPortPool {
    start: u16,
    end: u16,
    next: u16,
    reserved: HashSet<u16>,
}

impl Default for CdpPortPool {
    fn default() -> Self {
        Self::new(CDP_PORT_START, CDP_PORT_END)
    }
}

impl CdpPortPool {
    fn new(start: u16, end: u16) -> Self {
        assert!(start <= end);
        Self {
            start,
            end,
            next: start,
            reserved: HashSet::new(),
        }
    }

    fn reserve(&mut self) -> Result<u16, String> {
        self.reserve_with(port_is_available)
    }

    fn reserve_with<F>(&mut self, mut is_available: F) -> Result<u16, String>
    where
        F: FnMut(u16) -> bool,
    {
        let capacity = u32::from(self.end) - u32::from(self.start) + 1;
        let mut candidate = self.next;

        for _ in 0..capacity {
            if !self.reserved.contains(&candidate) && is_available(candidate) {
                self.reserved.insert(candidate);
                self.next = self.advance(candidate);
                return Ok(candidate);
            }
            candidate = self.advance(candidate);
        }

        Err(format!(
            "No available CDP port in {}-{}",
            self.start, self.end
        ))
    }

    fn release(&mut self, port: u16) {
        self.reserved.remove(&port);
    }

    fn advance(&self, port: u16) -> u16 {
        if port == self.end {
            self.start
        } else {
            port + 1
        }
    }
}

#[derive(Default)]
struct ClaudeWindowRegistry {
    ports: CdpPortPool,
    sessions: HashMap<i64, ManagedClaudeSession>,
}

impl ClaudeWindowRegistry {
    fn session(&self, account_id: i64) -> Option<ManagedClaudeSession> {
        self.sessions.get(&account_id).cloned()
    }

    fn retain_if_healthy(
        &mut self,
        account_id: i64,
        window_exists: bool,
        cdp_healthy: bool,
    ) -> Option<ManagedClaudeSession> {
        if window_exists && cdp_healthy {
            return self.session(account_id);
        }

        if let Some(stale) = self.sessions.remove(&account_id) {
            self.ports.release(stale.cdp_port);
        }
        None
    }

    fn reserve_session(
        &mut self,
        account_id: i64,
        label: String,
        profile_dir: PathBuf,
    ) -> Result<ManagedClaudeSession, String> {
        let cdp_port = self.ports.reserve()?;
        Ok(ManagedClaudeSession {
            account_id,
            label,
            cdp_port,
            profile_dir,
        })
    }

    fn insert(&mut self, session: ManagedClaudeSession) {
        self.sessions.insert(session.account_id, session);
    }

    fn discard(&mut self, account_id: i64) {
        if let Some(session) = self.sessions.remove(&account_id) {
            self.ports.release(session.cdp_port);
        }
    }
}

#[derive(Clone, Default)]
pub struct ClaudeWindowManager {
    registry: Arc<Mutex<ClaudeWindowRegistry>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeWindowInfo {
    account_id: i64,
    label: String,
    cdp_port: u16,
    reused: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeWindowHealth {
    account_id: i64,
    label: String,
    cdp_port: Option<u16>,
    window_exists: bool,
    cdp_healthy: bool,
}

impl ClaudeWindowHealth {
    pub(crate) fn healthy_cdp_port(&self) -> Option<u16> {
        (self.window_exists && self.cdp_healthy)
            .then_some(self.cdp_port)
            .flatten()
    }
}

impl ClaudeWindowManager {
    pub async fn open(
        &self,
        app: tauri::AppHandle,
        account_id: i64,
        account_name: String,
    ) -> Result<ClaudeWindowInfo, String> {
        validate_account_id(account_id)?;

        let label = claude_window_label(account_id);
        let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let profile_dir = claude_profile_dir(&app_data_dir, account_id);
        let mut registry = self.registry.lock().await;

        let existing_window = app.get_webview_window(&label);
        let existing_session = registry.session(account_id);
        let cdp_healthy = if let (Some(_), Some(session)) =
            (existing_window.as_ref(), existing_session.as_ref())
        {
            probe_cdp_async(session.cdp_port).await
        } else {
            false
        };

        if let Some(session) =
            registry.retain_if_healthy(account_id, existing_window.is_some(), cdp_healthy)
        {
            if let Some(window) = existing_window {
                window.set_focus().map_err(|e| e.to_string())?;
            }
            return Ok(session.info(true));
        }

        if let Some(window) = existing_window {
            window.close().map_err(|e| e.to_string())?;
            if !wait_until_window_closed(&app, &label).await {
                return Err(format!(
                    "Claude window {label} did not close; refusing to open a duplicate"
                ));
            }
        }

        std::fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;
        let session = registry.reserve_session(account_id, label.clone(), profile_dir)?;
        let browser_args = cdp_browser_args(session.cdp_port);

        let window = match tauri::WebviewWindowBuilder::new(
            &app,
            &label,
            tauri::WebviewUrl::External(
                "https://claude.ai"
                    .parse()
                    .map_err(|error| format!("Invalid Claude URL: {error}"))?,
            ),
        )
        .title(format!("Claude Chat - {account_name}"))
        .inner_size(1100.0, 800.0)
        .data_directory(session.profile_dir.clone())
        .additional_browser_args(&browser_args)
        .user_agent(CLAUDE_USER_AGENT)
        .build()
        {
            Ok(window) => window,
            Err(error) => {
                registry.ports.release(session.cdp_port);
                return Err(error.to_string());
            }
        };

        registry.insert(session.clone());
        if wait_until_cdp_ready(session.cdp_port).await {
            return Ok(session.info(false));
        }

        let _ = window.close();
        registry.discard(account_id);
        Err(format!(
            "Claude window opened, but CDP port {} was not ready within {} milliseconds",
            session.cdp_port,
            CDP_READY_ATTEMPTS as u128 * CDP_READY_INTERVAL.as_millis()
        ))
    }

    pub async fn health(
        &self,
        app: tauri::AppHandle,
        account_id: i64,
    ) -> Result<ClaudeWindowHealth, String> {
        validate_account_id(account_id)?;

        let label = claude_window_label(account_id);
        let session = self.registry.lock().await.session(account_id);
        let window_exists = app.get_webview_window(&label).is_some();
        let cdp_healthy = if window_exists {
            match session.as_ref() {
                Some(session) => probe_cdp_async(session.cdp_port).await,
                None => false,
            }
        } else {
            false
        };

        Ok(ClaudeWindowHealth {
            account_id,
            label,
            cdp_port: session.map(|session| session.cdp_port),
            window_exists,
            cdp_healthy,
        })
    }

    /// Close one account's window and release its CDP port. A rate-limited
    /// account keeps showing its blocking modal, so the session is torn down
    /// rather than left behind for the next job to trip over.
    pub async fn close(&self, app: tauri::AppHandle, account_id: i64) -> Result<(), String> {
        validate_account_id(account_id)?;

        let label = claude_window_label(account_id);
        let mut registry = self.registry.lock().await;
        if let Some(window) = app.get_webview_window(&label) {
            window.close().map_err(|error| error.to_string())?;
            if !wait_until_window_closed(&app, &label).await {
                return Err(format!("Claude window {label} did not close"));
            }
        }
        registry.discard(account_id);
        Ok(())
    }
}

impl ClaudeWindowInfo {
    pub(crate) fn cdp_port(&self) -> u16 {
        self.cdp_port
    }
}

impl ManagedClaudeSession {
    fn info(&self, reused: bool) -> ClaudeWindowInfo {
        ClaudeWindowInfo {
            account_id: self.account_id,
            label: self.label.clone(),
            cdp_port: self.cdp_port,
            reused,
        }
    }
}

fn validate_account_id(account_id: i64) -> Result<(), String> {
    if account_id <= 0 {
        return Err("Claude account id must be positive".to_string());
    }
    Ok(())
}

fn claude_window_label(account_id: i64) -> String {
    format!("claude-account-{account_id}")
}

fn claude_profile_dir(app_data_dir: &Path, account_id: i64) -> PathBuf {
    app_data_dir
        .join("claude-profiles")
        .join(account_id.to_string())
}

fn cdp_browser_args(port: u16) -> String {
    format!(
        "--remote-debugging-address=127.0.0.1 --remote-debugging-port={port} \
--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"
    )
}

fn port_is_available(port: u16) -> bool {
    TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_ok()
}

fn cdp_endpoint_healthy(port: u16) -> bool {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, CDP_CONNECT_TIMEOUT) else {
        return false;
    };
    if stream.set_read_timeout(Some(CDP_IO_TIMEOUT)).is_err()
        || stream.set_write_timeout(Some(CDP_IO_TIMEOUT)).is_err()
    {
        return false;
    }

    let request = format!(
        "GET /json/version HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = Vec::with_capacity(4096);
    let mut buffer = [0_u8; 2048];
    while response.len() < 16 * 1024 {
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => {
                response.extend_from_slice(&buffer[..read]);
                let marker = b"\"webSocketDebuggerUrl\"";
                if response
                    .windows(marker.len())
                    .any(|window| window == marker)
                {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    let response = String::from_utf8_lossy(&response);
    (response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
        && response.contains("\"webSocketDebuggerUrl\"")
}

async fn probe_cdp_async(port: u16) -> bool {
    tokio::task::spawn_blocking(move || cdp_endpoint_healthy(port))
        .await
        .unwrap_or(false)
}

async fn wait_until_cdp_ready(port: u16) -> bool {
    for _ in 0..CDP_READY_ATTEMPTS {
        if probe_cdp_async(port).await {
            return true;
        }
        tokio::time::sleep(CDP_READY_INTERVAL).await;
    }
    false
}

async fn wait_until_window_closed(app: &tauri::AppHandle, label: &str) -> bool {
    for _ in 0..WINDOW_CLOSE_ATTEMPTS {
        if app.get_webview_window(label).is_none() {
            return true;
        }
        tokio::time::sleep(WINDOW_CLOSE_INTERVAL).await;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::{
        cdp_endpoint_healthy, claude_profile_dir, port_is_available, CdpPortPool,
        ClaudeWindowRegistry, ManagedClaudeSession,
    };
    use std::{
        io::{Read, Write},
        net::{Ipv4Addr, TcpListener},
        path::{Path, PathBuf},
        thread,
    };

    #[test]
    fn account_profiles_are_isolated() {
        let app_data = Path::new("C:/Users/example/AppData/Roaming/com.selorson.app");

        let first = claude_profile_dir(app_data, 1);
        let second = claude_profile_dir(app_data, 2);

        assert_ne!(first, second);
        assert_eq!(first, app_data.join("claude-profiles").join("1"));
        assert_eq!(second, app_data.join("claude-profiles").join("2"));
    }

    #[test]
    fn port_collision_is_skipped() {
        let mut pool = CdpPortPool::new(30_000, 30_002);

        let reserved = pool
            .reserve_with(|port| port != 30_000)
            .expect("a later candidate should be available");

        assert_eq!(reserved, 30_001);
    }

    #[test]
    fn occupied_socket_is_not_available() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("bind test listener");
        let port = listener.local_addr().expect("listener address").port();

        assert!(!port_is_available(port));
    }

    #[test]
    fn crashed_session_is_released_before_reopen() {
        let mut registry = ClaudeWindowRegistry {
            ports: CdpPortPool::new(31_000, 31_002),
            ..Default::default()
        };
        let first_port = registry
            .ports
            .reserve_with(|_| true)
            .expect("reserve first port");
        registry.insert(ManagedClaudeSession {
            account_id: 7,
            label: "claude-account-7".to_string(),
            cdp_port: first_port,
            profile_dir: PathBuf::from("profiles/7"),
        });

        let reusable = registry.retain_if_healthy(7, true, false);
        let replacement = registry
            .reserve_session(
                7,
                "claude-account-7".to_string(),
                PathBuf::from("profiles/7"),
            )
            .expect("reserve replacement");

        assert!(reusable.is_none());
        assert_ne!(replacement.cdp_port, first_port);
        assert!(!registry.ports.reserved.contains(&first_port));
    }

    #[test]
    fn cdp_probe_requires_the_version_endpoint_marker() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("bind mock CDP listener");
        let port = listener.local_addr().expect("listener address").port();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept probe");
            let mut request = [0_u8; 512];
            let _ = stream.read(&mut request);
            let body =
                r#"{"Browser":"Mock","webSocketDebuggerUrl":"ws://127.0.0.1/devtools/browser/1"}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream
                .write_all(response.as_bytes())
                .expect("write mock response");
        });

        assert!(cdp_endpoint_healthy(port));
        server.join().expect("join mock CDP server");
    }
}
