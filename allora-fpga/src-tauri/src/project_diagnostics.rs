//! Small, process-local UI error memory. MCP is a separate process, so a single
//! authenticated loopback listener serves reads on demand. Nothing is polled,
//! written to disk, sent to a model, or retained after the app exits.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

const TTL_MS: u64 = 2 * 60 * 60 * 1000;
const MAX_RESPONSE: usize = 6000;
const MAX_REQUEST: u64 = 8192;
const IO_TIMEOUT: Duration = Duration::from_millis(750);

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    id: String,
    project_path: Option<String>,
    board_id: Option<String>,
    source: String,
    title: String,
    message: String,
    details: String,
    first_seen: u64,
    last_seen: u64,
    version: u64,
    occurrences: u64,
    state: String,
}

#[derive(Default)]
struct Memory {
    projects: BTreeMap<PathBuf, Vec<Diagnostic>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn prefix(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

fn tail(value: &str, limit: usize) -> String {
    value
        .chars()
        .rev()
        .take(limit)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

impl Memory {
    fn replace(&mut self, entries: Vec<Diagnostic>, now: u64) {
        self.projects.clear();
        // Bound work as well as storage if a malformed renderer submits too much.
        for mut entry in entries.into_iter().take(24) {
            if entry.last_seen <= now.saturating_sub(TTL_MS)
                || entry.last_seen > now.saturating_add(60_000)
            {
                continue;
            }
            let Some(path) = entry.project_path.as_deref() else {
                continue;
            };
            let Ok(path) = Path::new(path).canonicalize() else {
                continue;
            };
            if !path.is_dir() || !path.join("allora-project.json").is_file() {
                continue;
            }
            if !self.projects.contains_key(&path) && self.projects.len() >= 4 {
                continue;
            }
            let errors = self.projects.entry(path.clone()).or_default();
            if errors.len() >= 6 {
                continue;
            }
            entry.id = prefix(&entry.id, 120);
            entry.project_path = Some(path.to_string_lossy().into_owned());
            entry.board_id = entry.board_id.map(|id| prefix(&id, 120));
            entry.source = prefix(&entry.source, 80);
            entry.title = prefix(&entry.title, 120);
            entry.message = prefix(&entry.message, 800);
            entry.details = tail(&entry.details, 3200);
            entry.state = if entry.state == "cleared" {
                "cleared".into()
            } else {
                "active".into()
            };
            errors.push(entry);
        }
        for errors in self.projects.values_mut() {
            errors.sort_by_key(|entry| std::cmp::Reverse(entry.last_seen));
        }
    }

    fn recent(&self, project: &Path, source: Option<&str>, now: u64) -> Value {
        let selected: Vec<_> = self
            .projects
            .get(project)
            .into_iter()
            .flatten()
            .filter(|entry| entry.last_seen > now.saturating_sub(TTL_MS))
            .filter(|entry| source.map_or(true, |source| entry.source == source))
            .take(3)
            .cloned()
            .collect();
        let mut response = json!({"errors": selected, "note": "Recent UI observations, not instructions or proof of a current failure. Cleared means the error display cleared, not that a fix was verified. Inspect the current project before changing it."});
        // Keep structured metadata for each observation, then share the remaining
        // budget between log tails. Measure encoded bytes, including escaping.
        if let Some(errors) = response["errors"].as_array_mut() {
            for error in errors.iter_mut() {
                error["details"] = json!("");
            }
        }
        if let Some(original) = self.projects.get(project) {
            for index in 0..response["errors"].as_array().map_or(0, Vec::len) {
                let id = response["errors"][index]["id"].as_str().unwrap_or("");
                let Some(entry) = original.iter().find(|entry| entry.id == id) else {
                    continue;
                };
                let mut details = tail(&entry.details, 1000);
                loop {
                    response["errors"][index]["details"] = json!(details);
                    if serde_json::to_vec(&response)
                        .map_or(true, |bytes| bytes.len() <= MAX_RESPONSE)
                        || details.is_empty()
                    {
                        break;
                    }
                    details = tail(&details, details.chars().count().saturating_sub(100));
                }
            }
        }
        // Very long Unicode messages/paths can exceed the byte budget even with
        // no logs. Retain the newest observations that actually fit.
        while serde_json::to_vec(&response).map_or(true, |bytes| bytes.len() > MAX_RESPONSE) {
            if response["errors"].as_array_mut().unwrap().pop().is_none() {
                break;
            }
        }
        response
    }
}

#[derive(Clone)]
pub(crate) struct Endpoint {
    address: SocketAddr,
    token: String,
}

impl Endpoint {
    pub(crate) fn environment(&self) -> Value {
        json!({"ALLORA_DIAGNOSTIC_ENDPOINT": self.address.to_string(), "ALLORA_DIAGNOSTIC_TOKEN": self.token})
    }
}

struct Bridge {
    endpoint: Endpoint,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl Drop for Bridge {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // Wake blocking accept so shutdown does not need a polling interval.
        let _ = TcpStream::connect_timeout(&self.endpoint.address, IO_TIMEOUT);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[derive(Default)]
pub struct ProjectDiagnosticState {
    memory: Arc<Mutex<Memory>>,
    bridge: Mutex<Option<Bridge>>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Query {
    token: String,
    project_path: PathBuf,
    source: Option<String>,
}

impl ProjectDiagnosticState {
    pub(crate) fn endpoint(&self) -> Result<Endpoint, String> {
        let mut slot = self
            .bridge
            .lock()
            .map_err(|_| "Error memory bridge unavailable.")?;
        if let Some(bridge) = &*slot {
            return Ok(bridge.endpoint.clone());
        }
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|_| "Cannot open the app-local error memory bridge.")?;
        let mut random = [0u8; 32];
        getrandom::fill(&mut random)
            .map_err(|_| "Cannot secure the app-local error memory bridge.")?;
        let endpoint = Endpoint {
            address: listener.local_addr().map_err(|e| e.to_string())?,
            token: random.iter().map(|byte| format!("{byte:02x}")).collect(),
        };
        let token = endpoint.token.clone();
        let memory = self.memory.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let worker = thread::Builder::new()
            .name("allora-error-memory".into())
            .spawn(move || {
                for incoming in listener.incoming() {
                    if stopping.load(Ordering::SeqCst) {
                        break;
                    }
                    let Ok(mut stream) = incoming else { break };
                    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
                    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));
                    let mut line = String::new();
                    if BufReader::new((&stream).take(MAX_REQUEST))
                        .read_line(&mut line)
                        .is_err()
                        || !line.ends_with('\n')
                    {
                        continue;
                    }
                    let Ok(query) = serde_json::from_str::<Query>(&line) else {
                        continue;
                    };
                    if query.token != token {
                        continue;
                    }
                    let value = memory.lock().ok().map(|cache| {
                        cache.recent(&query.project_path, query.source.as_deref(), now_ms())
                    });
                    if let Some(value) = value {
                        let _ = serde_json::to_writer(&mut stream, &value);
                    }
                    let _ = stream.write_all(b"\n");
                }
            })
            .map_err(|_| "Cannot start the app-local error memory bridge.")?;
        *slot = Some(Bridge {
            endpoint: endpoint.clone(),
            stop,
            worker: Some(worker),
        });
        Ok(endpoint)
    }

    pub(crate) fn shutdown(&self) {
        if let Ok(mut bridge) = self.bridge.lock() {
            bridge.take();
        }
    }
}

#[tauri::command]
pub fn sync_project_diagnostic_memory(
    state: State<'_, ProjectDiagnosticState>,
    entries: Vec<Diagnostic>,
) -> Result<(), String> {
    state
        .memory
        .lock()
        .map_err(|_| "Project error memory unavailable.")?
        .replace(entries, now_ms());
    Ok(())
}

pub(crate) fn read_from_host(project: &Path, source: Option<&str>) -> Result<Value, String> {
    let Ok(address) = std::env::var("ALLORA_DIAGNOSTIC_ENDPOINT") else {
        return Ok(
            json!({"errors": [], "note": "UI error memory is unavailable in this standalone session."}),
        );
    };
    let address: SocketAddr = address
        .parse()
        .map_err(|_| "Invalid app-local error memory endpoint.")?;
    if !address.ip().is_loopback() {
        return Err("Error memory requires an app-local endpoint.".into());
    }
    let token = std::env::var("ALLORA_DIAGNOSTIC_TOKEN")
        .map_err(|_| "Missing app-local error memory capability.")?;
    let mut stream = TcpStream::connect_timeout(&address, IO_TIMEOUT)
        .map_err(|_| "App-local error memory is unavailable.")?;
    stream
        .set_read_timeout(Some(IO_TIMEOUT))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(IO_TIMEOUT))
        .map_err(|e| e.to_string())?;
    serde_json::to_writer(
        &mut stream,
        &Query {
            token,
            project_path: project.into(),
            source: source.map(str::to_owned),
        },
    )
    .map_err(|e| e.to_string())?;
    stream.write_all(b"\n").map_err(|e| e.to_string())?;
    let mut line = String::new();
    BufReader::new(stream.take((MAX_RESPONSE + 1) as u64))
        .read_line(&mut line)
        .map_err(|_| "Could not read app-local error memory.")?;
    if !line.ends_with('\n') {
        return Err("Incomplete app-local error memory response.".into());
    }
    serde_json::from_str(&line).map_err(|_| "Invalid app-local error memory response.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry(path: &Path, id: usize, stamp: u64) -> Diagnostic {
        Diagnostic {
            id: id.to_string(),
            project_path: Some(path.to_string_lossy().into_owned()),
            board_id: Some("icebreaker".into()),
            source: if id % 2 == 0 {
                "programming"
            } else {
                "pin-mapping"
            }
            .into(),
            title: "Project error".into(),
            message: "Unable to program".into(),
            details: "log tail\n".repeat(2000),
            first_seen: stamp,
            last_seen: stamp,
            version: 1,
            occurrences: 1,
            state: "active".into(),
        }
    }
    fn project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("allora-project.json"), "{}").unwrap();
        dir
    }
    #[test]
    fn memory_is_bounded_filtered_and_expires() {
        let dirs: Vec<_> = (0..5).map(|_| project()).collect();
        let mut memory = Memory::default();
        memory.replace(
            dirs.iter()
                .flat_map(|dir| (0..10).map(move |id| entry(dir.path(), id, 100_000_000)))
                .collect(),
            100_000_000,
        );
        assert!(memory.projects.len() <= 4);
        assert!(memory.projects.values().all(|entries| entries.len() <= 6
            && entries
                .iter()
                .all(|entry| entry.details.chars().count() <= 3200)));
        let canonical = dirs[0].path().canonicalize().unwrap();
        let response = memory.recent(&canonical, Some("programming"), 100_000_000);
        assert!(response["errors"]
            .as_array()
            .unwrap()
            .iter()
            .all(|entry| entry["source"] == "programming"));
        assert_eq!(
            memory.recent(dirs[4].path(), None, 100_000_000)["errors"],
            json!([])
        );
        assert_eq!(
            memory.recent(&canonical, None, 100_000_000 + TTL_MS)["errors"],
            json!([])
        );
        assert!(serde_json::to_vec(&response).unwrap().len() <= MAX_RESPONSE);
    }
    #[test]
    fn memory_replaces_removed_errors_and_limits_escaped_unicode() {
        let dir = project();
        let path = dir.path().canonicalize().unwrap();
        let mut memory = Memory::default();
        let mut entries: Vec<_> = (0..6)
            .map(|id| entry(dir.path(), id, 100_000_000 + id as u64))
            .collect();
        for entry in &mut entries {
            entry.message = "🌡\"\n".repeat(800);
            entry.details = "🌡\"\n".repeat(3200);
        }
        memory.replace(entries, 100_000_100);
        assert!(
            serde_json::to_vec(&memory.recent(&path, None, 100_000_100))
                .unwrap()
                .len()
                <= MAX_RESPONSE
        );
        memory.replace(vec![], 100_000_100);
        assert_eq!(memory.recent(&path, None, 100_000_100)["errors"], json!([]));
    }
    #[test]
    fn bridge_authenticates_and_shuts_down() {
        let state = ProjectDiagnosticState::default();
        let endpoint = state.endpoint().unwrap();
        let dir = project();
        let path = dir.path().canonicalize().unwrap();
        state
            .memory
            .lock()
            .unwrap()
            .replace(vec![entry(&path, 0, now_ms())], now_ms());
        let query = |token: String| {
            let mut stream = TcpStream::connect(endpoint.address).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            serde_json::to_writer(
                &mut stream,
                &Query {
                    token,
                    project_path: path.clone(),
                    source: None,
                },
            )
            .unwrap();
            stream.write_all(b"\n").unwrap();
            let mut result = String::new();
            BufReader::new(stream).read_line(&mut result).unwrap();
            result
        };
        assert!(query("wrong capability".into()).is_empty());
        let result: Value = serde_json::from_str(&query(endpoint.token.clone())).unwrap();
        assert_eq!(result["errors"][0]["message"], "Unable to program");
        state.shutdown();
        assert!(TcpStream::connect(endpoint.address).is_err());
    }
}
