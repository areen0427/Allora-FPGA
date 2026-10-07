//! Embedded Codex app-server connection. The child owns the user's Codex account;
//! Allora never reads or copies credentials and never edits the user's config.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, Weak};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{ipc::Channel, State};

const RPC_TIMEOUT: Duration = Duration::from_secs(40);
const TURN_TIMEOUT: Duration = Duration::from_secs(20 * 60);
const MAX_LINE_BYTES: usize = 16 * 1024 * 1024;
static SESSION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

const INSTRUCTIONS: &str = "You are the FPGA engineering assistant embedded in Allora. \
Use only the Allora MCP tools for project files, board discovery, constraints, simulation, \
builds and programming. Before creating any new project, ask the user where to save it unless \
they have explicitly supplied a destination in chat or selected one in the workspace picker. \
The current workspace alone is not permission to save a new project there. Always pass \
parentDirectory to create_project. When a current project is supplied, inspect its context \
and work on that project rather than creating a replacement. When the user requests another \
location, pass its absolute path as create_project parentDirectory; missing folders are created \
automatically and the new project is accessible for the rest of this session. Do not ask the user \
to switch workspaces for this. Only use destinations the user requested. Board definitions \
returned by Allora are authoritative: never guess FPGA package, physical pins, oscillator \
frequency, LED polarity or programmer configuration. Check available boards and toolchains \
before creating a design. Create projects through create_project so they open correctly in \
Allora. Read files before changing them and use the returned revision for conflict detection. \
When simulation is requested, discover_design_ports, configure_simulator to persist visible \
peripheral connections, and compile_simulator using the interactive engine; also run the \
assertion-based testbench. Testbench success alone is not a connected or compiled simulator. \
When synthesis or a build is requested, generate_synthesis_diagram as well as the requested \
build so the Synthesis view has its saved graph. For requested end-to-end designs, write RTL \
and a testbench, configure top module and validated \
pin constraints, simulate, build, inspect timing and program only the exact compatible build \
artifact and target. Hardware programming prompts must be answered by the user, never by you. \
Do not use shell, apply_patch, unrelated MCP servers or alternative paths to bypass Allora's \
validation or approvals. Explain missing toolchains or disconnected/ambiguous hardware clearly. \
Never claim a simulation, build or upload succeeded without a successful tool result. \
After uploading, distinguish upload success from observation of the physical board. \
Communicate progress briefly and explain errors with useful next steps.";

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AiChatEvent {
    ContextUsage {
        usage: Value,
    },
    RateLimits {
        limits: Value,
    },
    AssistantDelta {
        delta: String,
    },
    ToolStarted {
        id: String,
        name: String,
        arguments: Value,
    },
    ToolCompleted {
        id: String,
        name: String,
        result: Value,
        #[serde(rename = "isError")]
        is_error: bool,
    },
    ApprovalRequired {
        #[serde(rename = "requestId")]
        request_id: String,
        title: String,
        description: String,
        details: Value,
    },
    TurnCompleted {
        #[serde(rename = "threadId")]
        thread_id: String,
    },
    Error {
        message: String,
    },
    ProjectCreated {
        #[serde(rename = "projectPath")]
        project_path: String,
        #[serde(rename = "projectName")]
        project_name: Option<String>,
    },
    Status {
        message: String,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStartRequest {
    workspace_path: String,
    thread_id: Option<String>,
    model: String,
    boards: Vec<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSendRequest {
    session_id: String,
    text: String,
    model: Option<String>,
    reasoning_effort: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    session_id: String,
    thread_id: String,
}

#[derive(Default)]
pub struct AiChatState {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}

impl AiChatState {
    fn session(&self, id: &str) -> Result<Arc<Session>, String> {
        self.sessions
            .lock()
            .map_err(|_| "Chat state unavailable.")?
            .get(id)
            .cloned()
            .ok_or_else(|| "This chat session is closed. Reconnect to continue.".into())
    }

    pub fn shutdown_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, session) in sessions.drain() {
                session.decline_approvals();
                session.cancel_jobs();
                session.shutdown();
            }
        }
    }
}

impl Drop for AiChatState {
    fn drop(&mut self) {
        self.shutdown_all();
    }
}

type RpcReply = Result<Value, String>;
struct Approval {
    rpc_id: Value,
}

struct Session {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    pending: Mutex<HashMap<u64, mpsc::Sender<RpcReply>>>,
    approvals: Mutex<HashMap<String, Approval>>,
    completion: Mutex<Option<mpsc::Sender<Result<(), String>>>>,
    channel: Mutex<Channel<AiChatEvent>>,
    thread_id: Mutex<String>,
    current_turn: Mutex<Option<String>>,
    last_agent_item: Mutex<Option<String>>,
    busy: AtomicBool,
    closed: AtomicBool,
    next_rpc: AtomicU64,
    last_activity: Mutex<Instant>,
    // Keep catalog alive until after the app-server and MCP child are stopped.
    _catalog: tempfile::NamedTempFile,
}

impl Drop for Session {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl Session {
    fn emit(&self, event: AiChatEvent) {
        if let Ok(channel) = self.channel.lock() {
            let _ = channel.send(event);
        }
    }

    fn write(&self, value: &Value) -> Result<(), String> {
        if self.closed.load(Ordering::SeqCst) {
            return Err("The Codex connection has closed.".into());
        }
        let mut stdin = self
            .stdin
            .lock()
            .map_err(|_| "Chat connection unavailable.")?;
        let writer = stdin.as_mut().ok_or("The Codex connection has closed.")?;
        let line = serde_json::to_vec(value).map_err(|error| error.to_string())?;
        writer
            .write_all(&line)
            .and_then(|_| writer.write_all(b"\n"))
            .and_then(|_| writer.flush())
            .map_err(|_| "Could not send a message to Codex.".into())
    }

    fn rpc(&self, method: &str, params: Value) -> RpcReply {
        self.rpc_with_timeout(method, params, RPC_TIMEOUT)
    }

    fn rpc_with_timeout(&self, method: &str, params: Value, timeout: Duration) -> RpcReply {
        let id = self.next_rpc.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = mpsc::channel();
        self.pending
            .lock()
            .map_err(|_| "Chat connection unavailable.")?
            .insert(id, tx);
        if let Err(error) = self.write(&json!({"id":id,"method":method,"params":params})) {
            if let Ok(mut pending) = self.pending.lock() {
                pending.remove(&id);
            }
            return Err(error);
        }
        let result = rx.recv_timeout(timeout).map_err(|_| {
            format!("Codex did not respond to {method} in time. Reconnect to continue.")
        });
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&id);
        }
        result?
    }

    fn complete(&self, result: Result<(), String>) {
        if let Ok(mut completion) = self.completion.lock() {
            if let Some(reply) = completion.take() {
                let _ = reply.send(result);
            }
        }
    }

    fn cancel_jobs(&self) {
        if let Ok(thread_id) = self.thread_id() {
            if !thread_id.is_empty() && !self.closed.load(Ordering::SeqCst) {
                let _ = self.rpc_with_timeout("mcpServer/tool/call", json!({"threadId":thread_id,"server":"allora","tool":"cancel_all_jobs","arguments":{}}), Duration::from_secs(8));
            }
        }
    }

    fn shutdown(&self) {
        let _ = self.shutdown_checked();
    }

    fn shutdown_checked(&self) -> Result<(), String> {
        self.closed.store(true, Ordering::SeqCst);
        let mut failure = None;
        if let Ok(mut child) = self.child.lock() {
            if let Some(mut process) = child.take() {
                #[cfg(unix)]
                let process_group = -(process.id() as i32);
                // Killing only the parent first closes the MCP pipes. The MCP
                // server gets EOF and cancels its independent toolchain groups.
                // Killing the whole group immediately would skip that cleanup.
                let stopped = match process.try_wait() {
                    Ok(Some(_)) => Ok(()),
                    _ => process.kill().and_then(|_| process.wait().map(|_| ())),
                };
                if let Err(error) = stopped {
                    failure = Some(format!("Could not stop the Codex process: {error}"));
                    *child = Some(process);
                }
                #[cfg(unix)]
                {
                    let deadline = Instant::now() + Duration::from_millis(3200);
                    while unsafe { libc::kill(process_group, 0) } == 0 {
                        if Instant::now() >= deadline {
                            let result = unsafe { libc::kill(process_group, libc::SIGTERM) };
                            if result != 0 {
                                let error = std::io::Error::last_os_error();
                                if error.raw_os_error() != Some(libc::ESRCH) {
                                    failure = Some(format!(
                                        "Could not stop the Codex tool processes: {error}"
                                    ));
                                }
                            }
                            break;
                        }
                        thread::sleep(Duration::from_millis(50));
                    }
                }
            }
        } else {
            failure = Some("Could not access the Codex process for cleanup.".into());
        }
        if let Ok(mut input) = self.stdin.lock() {
            input.take();
        }
        self.busy.store(false, Ordering::SeqCst);
        self.complete(Err("The Codex connection has closed.".into()));
        if let Ok(mut turn) = self.current_turn.lock() {
            turn.take();
        }
        if let Ok(mut approvals) = self.approvals.lock() {
            approvals.clear();
        }
        if let Ok(mut pending) = self.pending.lock() {
            for (_, reply) in pending.drain() {
                let _ = reply.send(Err("The Codex connection has closed.".into()));
            }
        }
        failure.map_or(Ok(()), Err)
    }

    fn cancel(&self) -> Result<(), String> {
        self.decline_approvals();
        self.cancel_jobs();
        let turn = self
            .current_turn
            .lock()
            .map_err(|_| "Chat state unavailable.")?
            .clone();
        if let Some(turn_id) = turn {
            // An interrupt acknowledgement is optional once we stop the whole
            // session. A pending turn or RPC timeout still stops successfully
            // when cleanup succeeds.
            let _ = self.rpc_with_timeout(
                "turn/interrupt",
                json!({"threadId":self.thread_id()?,"turnId":turn_id}),
                Duration::from_secs(5),
            );
        }
        self.complete(Ok(()));
        self.shutdown_checked()
    }

    fn thread_id(&self) -> Result<String, String> {
        self.thread_id
            .lock()
            .map(|id| id.clone())
            .map_err(|_| "Chat state unavailable.".into())
    }

    fn decline_approvals(&self) {
        let approvals = self
            .approvals
            .lock()
            .map(|mut list| list.drain().map(|(_, a)| a).collect::<Vec<_>>())
            .unwrap_or_default();
        for approval in approvals {
            let _ = self.write(&json!({"id":approval.rpc_id,"result":{"action":"cancel"}}));
        }
    }

    fn answer_approval(&self, request_id: &str, approved: bool) -> Result<(), String> {
        let approval = self
            .approvals
            .lock()
            .map_err(|_| "Chat state unavailable.")?
            .remove(request_id)
            .ok_or("This approval request is no longer active.")?;
        let result = if approved {
            json!({"action":"accept","content":{"confirmTarget":true}})
        } else {
            json!({"action":"decline"})
        };
        self.write(&json!({"id":approval.rpc_id,"result":result}))
    }

    fn handle_message(&self, message: Value) {
        if let Ok(mut activity) = self.last_activity.lock() {
            *activity = Instant::now();
        }
        let method = message.get("method").and_then(Value::as_str);
        if let Some(method) = method {
            let params = &message["params"];
            if let Some(id) = message.get("id") {
                self.handle_server_request(id.clone(), method, params.clone());
            } else {
                self.handle_notification(method, params);
            }
        } else if let Some(id) = message.get("id").and_then(Value::as_u64) {
            if let Ok(mut pending) = self.pending.lock() {
                if let Some(reply) = pending.remove(&id) {
                    let result = if let Some(error) = message.get("error") {
                        Err(error
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("Codex request failed.")
                            .to_string())
                    } else {
                        Ok(message.get("result").cloned().unwrap_or(Value::Null))
                    };
                    let _ = reply.send(result);
                }
            }
        }
    }

    fn handle_server_request(&self, id: Value, method: &str, params: Value) {
        if method == "mcpServer/elicitation/request"
            && params["serverName"] == "allora"
            && params["mode"] == "form"
            && params
                .pointer("/requestedSchema/properties/confirmTarget/type")
                .and_then(Value::as_str)
                == Some("boolean")
        {
            let request_id = id.to_string();
            if let Ok(mut approvals) = self.approvals.lock() {
                approvals.insert(request_id.clone(), Approval { rpc_id: id });
            }
            self.emit(AiChatEvent::ApprovalRequired {
                request_id,
                title: "Program FPGA board".into(),
                description: params["message"]
                    .as_str()
                    .unwrap_or("Confirm the exact board and build artifact before programming.")
                    .into(),
                details: params,
            });
            return;
        }
        // Only the Allora hardware form is supported. Never turn an arbitrary
        // shell/file/permissions request into a way around scoped MCP services.
        let reply = match method {
            "mcpServer/elicitation/request" => json!({"id":id,"result":{"action":"decline"}}),
            "item/commandExecution/requestApproval"
            | "item/fileChange/requestApproval"
            | "execCommandApproval"
            | "applyPatchApproval" => json!({"id":id,"result":{"decision":"decline"}}),
            "item/permissions/requestApproval" => {
                json!({"id":id,"result":{"permissions":{},"scope":"turn"}})
            }
            "item/tool/requestUserInput" => {
                json!({"id":id,"error":{"code":-32601,"message":"Ask the user your clarification in an ordinary chat message, then wait for their reply."}})
            }
            _ => {
                json!({"id":id,"error":{"code":-32601,"message":"This client supports Allora MCP tools and hardware confirmation only."}})
            }
        };
        let _ = self.write(&reply);
    }

    fn handle_notification(&self, method: &str, params: &Value) {
        match method {
            "thread/tokenUsage/updated" => {
                self.emit(AiChatEvent::ContextUsage {
                    usage: params["tokenUsage"].clone(),
                });
            }
            "account/rateLimits/updated" => {
                self.emit(AiChatEvent::RateLimits {
                    limits: params["rateLimits"].clone(),
                });
            }
            "item/agentMessage/delta" => {
                if let Some(delta) = params["delta"].as_str() {
                    if let Some(item_id) = params["itemId"].as_str() {
                        if let Ok(mut last_item) = self.last_agent_item.lock() {
                            if last_item.as_deref() != Some(item_id) {
                                if last_item.is_some() {
                                    self.emit(AiChatEvent::AssistantDelta {
                                        delta: "\n\n".into(),
                                    });
                                }
                                *last_item = Some(item_id.into());
                            }
                        }
                    }
                    self.emit(AiChatEvent::AssistantDelta {
                        delta: delta.into(),
                    });
                }
            }
            "turn/started" => {
                if let Some(id) = params.pointer("/turn/id").and_then(Value::as_str) {
                    if let Ok(mut turn) = self.current_turn.lock() {
                        *turn = Some(id.into());
                    }
                }
            }
            "item/started" | "item/completed" => {
                let item = &params["item"];
                if item["type"] == "contextCompaction" {
                    self.emit(AiChatEvent::Status {
                        message: if method == "item/started" {
                            "Compacting context…"
                        } else {
                            "Thinking…"
                        }
                        .into(),
                    });
                    return;
                }
                if item["type"] != "mcpToolCall" {
                    return;
                }
                let id = item["id"].as_str().unwrap_or_default().to_string();
                let name = item["tool"].as_str().unwrap_or("Allora tool").to_string();
                if method == "item/started" {
                    self.emit(AiChatEvent::ToolStarted {
                        id,
                        name,
                        arguments: item["arguments"].clone(),
                    });
                } else {
                    let result = item
                        .get("result")
                        .filter(|r| !r.is_null())
                        .cloned()
                        .unwrap_or_else(|| item["error"].clone());
                    let is_error = item["status"] == "failed"
                        || !item["error"].is_null()
                        || result["isError"].as_bool().unwrap_or(false);
                    if !is_error && name == "create_project" {
                        if let Some(project) = structured_result(&result) {
                            if let Some(path) = project.get("projectPath").and_then(Value::as_str) {
                                self.emit(AiChatEvent::ProjectCreated {
                                    project_path: path.into(),
                                    project_name: project
                                        .get("projectName")
                                        .or_else(|| project.get("name"))
                                        .and_then(Value::as_str)
                                        .map(String::from),
                                });
                            }
                        }
                    }
                    self.emit(AiChatEvent::ToolCompleted {
                        id,
                        name,
                        result,
                        is_error,
                    });
                }
            }
            "turn/completed" => {
                self.busy.store(false, Ordering::SeqCst);
                if let Ok(mut turn) = self.current_turn.lock() {
                    turn.take();
                }
                if let Ok(mut approvals) = self.approvals.lock() {
                    approvals.clear();
                }
                let mut outcome = Ok(());
                if params.pointer("/turn/status").and_then(Value::as_str) == Some("failed") {
                    let message = params
                        .pointer("/turn/error/message")
                        .and_then(Value::as_str)
                        .unwrap_or("Codex could not complete this request.")
                        .to_string();
                    outcome = Err(message.clone());
                    self.emit(AiChatEvent::Error { message });
                }
                self.emit(AiChatEvent::TurnCompleted {
                    thread_id: self.thread_id().unwrap_or_default(),
                });
                self.complete(outcome);
            }
            "error" => {
                let message = params
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .or_else(|| params["message"].as_str())
                    .unwrap_or("Codex reported an error.")
                    .to_string();
                self.emit(AiChatEvent::Error { message });
            }
            "item/mcpToolCall/progress" => {
                if let Some(message) = params["message"].as_str() {
                    self.emit(AiChatEvent::Status {
                        message: message.chars().take(1000).collect(),
                    });
                }
            }
            _ => {}
        }
    }
}

fn structured_result(result: &Value) -> Option<Value> {
    if let Some(value) = result.get("structuredContent") {
        return Some(value.clone());
    }
    result
        .get("content")
        .and_then(Value::as_array)?
        .iter()
        .find_map(|content| serde_json::from_str(content.get("text")?.as_str()?).ok())
}

fn non_null_config(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(_, v)| !v.is_null())
                .map(|(key, v)| (key.clone(), non_null_config(v)))
                .collect(),
        ),
        Value::Array(array) => Value::Array(array.iter().map(non_null_config).collect()),
        _ => value.clone(),
    }
}

fn spawn_app_server(
    mut command: Command,
    catalog: tempfile::NamedTempFile,
    on_event: Channel<AiChatEvent>,
) -> Result<Arc<Session>, String> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not start Codex app-server: {error}"))?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let session = Arc::new(Session {
        stdin: Mutex::new(child.stdin.take()),
        child: Mutex::new(Some(child)),
        pending: Mutex::new(HashMap::new()),
        approvals: Mutex::new(HashMap::new()),
        completion: Mutex::new(None),
        channel: Mutex::new(on_event),
        thread_id: Mutex::new(String::new()),
        current_turn: Mutex::new(None),
        last_agent_item: Mutex::new(None),
        busy: AtomicBool::new(false),
        closed: AtomicBool::new(false),
        next_rpc: AtomicU64::new(1),
        last_activity: Mutex::new(Instant::now()),
        _catalog: catalog,
    });
    // Drain stderr without forwarding raw CLI logs or credentials into chat.
    thread::spawn(move || {
        let _ = std::io::copy(&mut BufReader::new(stderr), &mut std::io::sink());
    });
    let weak = Arc::downgrade(&session);
    thread::spawn(move || read_messages(stdout, weak));
    let weak = Arc::downgrade(&session);
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(5));
        let Some(session) = weak.upgrade() else {
            break;
        };
        if session.closed.load(Ordering::SeqCst) {
            break;
        }
        let timed_out = session
            .last_activity
            .lock()
            .map(|time| time.elapsed() > TURN_TIMEOUT)
            .unwrap_or(false);
        if session.busy.load(Ordering::SeqCst) && timed_out {
            session.emit(AiChatEvent::Error {
                message: "Codex stopped responding. The session was closed; reconnect to continue."
                    .into(),
            });
            session.shutdown();
            break;
        }
    });
    Ok(session)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatModel {
    model: String,
    display_name: String,
    is_default: bool,
    description: String,
    context_window: Option<u64>,
    default_reasoning_effort: Option<String>,
    supported_reasoning_efforts: Vec<Value>,
}

/// Read only model metadata; credentials are never opened.
fn context_windows() -> HashMap<String, u64> {
    use std::io::Read;
    let home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".codex")));
    let Some(path) = home.map(|home| home.join("models_cache.json")) else {
        return HashMap::new();
    };
    let Ok(file) = std::fs::File::open(path) else {
        return HashMap::new();
    };
    let Ok(catalog) = serde_json::from_reader::<_, Value>(file.take(4 * 1024 * 1024)) else {
        return HashMap::new();
    };
    catalog["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|model| {
            Some((
                model["slug"].as_str()?.to_string(),
                model["context_window"].as_u64().filter(|size| *size > 0)?,
            ))
        })
        .collect()
}

#[tauri::command]
pub async fn ai_chat_usage() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut command = Command::new(crate::ai_integration::authenticated_codex()?);
        command.args(["app-server", "--listen", "stdio://", "-c", "notify=[]", "-c", "features.hooks=false", "-c", "features.plugins=false"]);
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        let catalog = tempfile::NamedTempFile::new().map_err(|error| error.to_string())?;
        let session = spawn_app_server(command, catalog, Channel::new(|_| Ok(())))?;
        let result = (|| {
            session.rpc("initialize", json!({"clientInfo":{"name":"allora-fpga","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}))?;
            session.write(&json!({"method":"initialized"}))?;
            session.rpc("account/rateLimits/read", json!({}))
        })();
        let cleanup = session.shutdown_checked();
        match result { Ok(limits) => { cleanup?; Ok(limits) }, Err(error) => Err(error) }
    }).await.map_err(|_| "Could not load Codex usage.".to_string())?
}

#[tauri::command]
pub async fn ai_chat_models() -> Result<Vec<ChatModel>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut command = Command::new(crate::ai_integration::authenticated_codex()?);
        command.args(["app-server", "--listen", "stdio://", "-c", "notify=[]", "-c", "features.hooks=false", "-c", "features.plugins=false"]);
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        let catalog = tempfile::NamedTempFile::new().map_err(|error| error.to_string())?;
        let session = spawn_app_server(command, catalog, Channel::new(|_| Ok(())))?;
        let result = (|| {
            session.rpc("initialize", json!({"clientInfo":{"name":"allora-fpga","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}))?;
            session.write(&json!({"method":"initialized"}))?;
            let mut models = Vec::new();
            let mut cursor = Value::Null;
            for _ in 0..10 {
                let page = session.rpc("model/list", json!({"limit":100,"includeHidden":false,"cursor":cursor}))?;
                let windows = context_windows();
                for item in page["data"].as_array().ok_or("Codex returned an invalid model list.")? {
                    if item["hidden"] == true { continue; }
                    if let Some(model) = item["model"].as_str() {
                        models.push(ChatModel {
                            model: model.to_string(),
                            display_name: item["displayName"].as_str().unwrap_or(model).to_string(),
                            is_default: item["isDefault"].as_bool().unwrap_or(false),
                            description: item["description"].as_str().unwrap_or_default().to_string(),
                            context_window: windows.get(model).copied(),
                            default_reasoning_effort: item["defaultReasoningEffort"].as_str().map(String::from),
                            supported_reasoning_efforts: item["supportedReasoningEfforts"].as_array().cloned().unwrap_or_default(),
                        });
                    }
                }
                cursor = page["nextCursor"].clone();
                if cursor.is_null() { return Ok(models); }
            }
            Err("Codex model list exceeded the pagination limit.".into())
        })();
        let cleanup = session.shutdown_checked();
        match result { Ok(models) => { cleanup?; Ok(models) }, Err(error) => Err(error) }
    }).await.map_err(|_| "Could not load Codex models.".to_string())?
}

fn start_session(
    request: ChatStartRequest,
    on_event: Channel<AiChatEvent>,
) -> Result<(Arc<Session>, ChatSession), String> {
    let workspace = PathBuf::from(&request.workspace_path)
        .canonicalize()
        .map_err(|_| "Choose an existing workspace folder before starting chat.".to_string())?;
    if !workspace.is_dir() {
        return Err("The chat workspace must be a folder.".into());
    }
    if request.boards.is_empty() {
        return Err("Allora's board catalog is not loaded. Try again after boards load.".into());
    }
    let executable = crate::ai_integration::authenticated_codex()?;
    let mcp_executable = std::env::current_exe()
        .map_err(|_| "Cannot locate the Allora MCP executable.".to_string())?;
    #[cfg(test)]
    let mcp_executable = std::env::var_os("ALLORA_CHAT_SMOKE_EXECUTABLE")
        .map(PathBuf::from)
        .unwrap_or(mcp_executable);
    let mut catalog = tempfile::NamedTempFile::new()
        .map_err(|_| "Cannot prepare Allora board definitions.".to_string())?;
    serde_json::to_writer(catalog.as_file_mut(), &request.boards)
        .map_err(|error| error.to_string())?;
    catalog
        .as_file_mut()
        .flush()
        .map_err(|error| error.to_string())?;
    let mut command = Command::new(executable);
    command.args(["app-server", "--listen", "stdio://"]);
    // Disallow ambient tools and lifecycle commands. The user's account/model
    // are preserved while execution is limited to Allora's validated services.
    for feature in [
        "shell_tool",
        "unified_exec",
        "shell_snapshot",
        "hooks",
        "plugins",
        "apps",
        "multi_agent",
        "code_mode",
        "browser_use",
        "computer_use",
        "image_generation",
        "skill_mcp_dependency_install",
    ] {
        command.args(["-c", &format!("features.{feature}=false")]);
    }
    command.args(["-c", "web_search=\"disabled\"", "-c", "notify=[]"]);
    // Recent Codex versions route MCP execution through this host even when
    // code_mode is disabled. Keep the host available; its actual tools remain
    // constrained above and through the per-thread MCP inventory below.
    command.args(["-c", "features.code_mode_host=true"]);
    command
        .current_dir(&workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let session = spawn_app_server(command, catalog, on_event)?;
    let initialize = (|| {
        session.rpc("initialize", json!({"clientInfo":{"name":"allora-fpga","title":"Allora FPGA","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}))?;
        session.write(&json!({"method":"initialized"}))?;
        let config = session.rpc(
            "config/read",
            json!({"includeLayers":false,"cwd":workspace}),
        )?;
        let mut servers = non_null_config(&config["config"]["mcp_servers"])
            .as_object()
            .cloned()
            .unwrap_or_default();
        for server in servers.values_mut() {
            if let Some(server) = server.as_object_mut() {
                server.insert("enabled".into(), Value::Bool(false));
            }
        }
        servers.insert("allora".into(), json!({
            "command":mcp_executable,"args":["--allora-mcp"],"enabled":true,
            // User messages authorize scoped project work. Allora services
            // validate edits and enforce hardware confirmation internally;
            // Codex's generic destructive-tool prompt must not reject edits.
            "default_tools_approval_mode":"approve",
            "startup_timeout_sec":20,"tool_timeout_sec":900,
            "env":{"ALLORA_WORKSPACE_PATH":workspace,"ALLORA_BOARD_CATALOG_PATH":session._catalog.path()}
        }));
        let mut thread_params = json!({
            "model":request.model,
            "cwd":workspace,"runtimeWorkspaceRoots":[workspace],"sandbox":"read-only",
            "approvalPolicy":"on-request","approvalsReviewer":"user",
            "developerInstructions":INSTRUCTIONS,
            "config":{"mcp_servers":servers,"features.shell_tool":false,"features.unified_exec":false,"features.plugins":false,"features.apps":false,"features.hooks":false}
        });
        let method = if let Some(id) = request.thread_id.filter(|id| !id.is_empty()) {
            thread_params["threadId"] = json!(id);
            "thread/resume"
        } else {
            "thread/start"
        };
        let result = session.rpc(method, thread_params)?;
        let thread_id = result
            .pointer("/thread/id")
            .and_then(Value::as_str)
            .ok_or("Codex did not create a chat thread.")?
            .to_string();
        *session
            .thread_id
            .lock()
            .map_err(|_| "Chat state unavailable.")? = thread_id.clone();
        let inventory = session.rpc(
            "mcpServerStatus/list",
            json!({"threadId":thread_id,"limit":100}),
        )?;
        if inventory["data"]
            .as_array()
            .map(|servers| {
                servers.iter().any(|server| {
                    server["name"] != "allora"
                        && server["tools"]
                            .as_object()
                            .map(|tools| !tools.is_empty())
                            .unwrap_or(false)
                })
            })
            .unwrap_or(false)
        {
            return Err("This Codex configuration enables tools outside Allora. Chat requires a session restricted to Allora's tools.".into());
        }
        let server = inventory["data"]
            .as_array()
            .and_then(|servers| servers.iter().find(|s| s["name"] == "allora"))
            .ok_or("Allora MCP tools were not registered with Codex.")?;
        if server["tools"]
            .as_object()
            .map(|tools| tools.is_empty())
            .unwrap_or(true)
        {
            let detail = server["toolsError"]
                .as_str()
                .unwrap_or("No Allora tools were discovered.");
            return Err(format!("Allora MCP could not connect: {detail}"));
        }
        let session_id = format!(
            "allora-{}-{}",
            std::process::id(),
            SESSION_SEQUENCE.fetch_add(1, Ordering::SeqCst)
        );
        session.emit(AiChatEvent::Status {
            message: "Codex is connected to Allora's project tools.".into(),
        });
        Ok(ChatSession {
            session_id,
            thread_id,
        })
    })();
    match initialize {
        Ok(info) => Ok((session, info)),
        Err(error) => {
            session.shutdown();
            Err(error)
        }
    }
}

fn read_messages(stdout: std::process::ChildStdout, weak: Weak<Session>) {
    let mut reader = BufReader::new(stdout);
    loop {
        // Bound a single protocol frame before allocation can grow indefinitely.
        let mut bytes = Vec::new();
        use std::io::Read;
        let read = reader
            .by_ref()
            .take((MAX_LINE_BYTES + 1) as u64)
            .read_until(b'\n', &mut bytes);
        match read {
            Ok(0) | Err(_) => break,
            Ok(_) if bytes.len() > MAX_LINE_BYTES => break,
            _ => {}
        }
        let Some(session) = weak.upgrade() else {
            return;
        };
        if let Ok(message) = serde_json::from_slice::<Value>(&bytes) {
            session.handle_message(message);
        }
    }
    if let Some(session) = weak.upgrade() {
        if !session.closed.load(Ordering::SeqCst) {
            session.emit(AiChatEvent::Error {
                message: "The Codex connection ended. Reconnect to continue.".into(),
            });
            session.shutdown();
        }
    }
}

#[tauri::command]
pub async fn ai_chat_start(
    state: State<'_, AiChatState>,
    request: ChatStartRequest,
    on_event: Channel<AiChatEvent>,
) -> Result<ChatSession, String> {
    let (session, info) =
        tauri::async_runtime::spawn_blocking(move || start_session(request, on_event))
            .await
            .map_err(|_| "Could not start Codex chat.".to_string())??;
    state
        .sessions
        .lock()
        .map_err(|_| "Chat state unavailable.")?
        .insert(info.session_id.clone(), session);
    Ok(info)
}

#[tauri::command]
pub async fn ai_chat_send(
    state: State<'_, AiChatState>,
    request: ChatSendRequest,
    on_event: Channel<AiChatEvent>,
) -> Result<(), String> {
    if request.text.trim().is_empty() {
        return Err("Enter a message to send.".into());
    }
    if request.text.len() > 256 * 1024 {
        return Err("This message is too long. Send a shorter message.".into());
    }
    let session = state.session(&request.session_id)?;
    if session.closed.load(Ordering::SeqCst) {
        return Err("This chat session is closed. Reconnect to continue.".into());
    }
    if session.busy.swap(true, Ordering::SeqCst) {
        return Err(
            "Wait for the current response or stop it before sending another message.".into(),
        );
    }
    *session
        .channel
        .lock()
        .map_err(|_| "Chat connection unavailable.")? = on_event;
    *session
        .last_activity
        .lock()
        .map_err(|_| "Chat state unavailable.")? = Instant::now();
    let (completion_tx, completion_rx) = mpsc::channel();
    *session
        .last_agent_item
        .lock()
        .map_err(|_| "Chat state unavailable.")? = None;
    *session
        .completion
        .lock()
        .map_err(|_| "Chat state unavailable.")? = Some(completion_tx);
    tauri::async_runtime::spawn_blocking(move || {
        let result = session.rpc("turn/start", json!({"threadId":session.thread_id()?,"model":request.model,"effort":request.reasoning_effort,"input":[{"type":"text","text":request.text,"text_elements":[]}]}));
        match result {
            Ok(result) => {
                if session.busy.load(Ordering::SeqCst) {
                    if let Some(id) = result.pointer("/turn/id").and_then(Value::as_str) {
                        *session.current_turn.lock().map_err(|_| "Chat state unavailable.")? = Some(id.into());
                    }
                }
                match completion_rx.recv_timeout(TURN_TIMEOUT) {
                    Ok(result) => result,
                    Err(_) => {
                        session.cancel_jobs();
                        session.shutdown();
                        Err("The Codex response timed out. Reconnect to continue.".into())
                    }
                }
            }
            Err(error) => {
                session.busy.store(false, Ordering::SeqCst);
                session.emit(AiChatEvent::Error { message: error.clone() });
                // A timed-out turn/start might still be accepted remotely.
                // Close it so retry cannot overlap a hidden active turn.
                session.cancel_jobs();
                session.shutdown();
                Err(error)
            }
        }
    }).await.map_err(|_| "Could not send this message to Codex.".to_string())?
}

#[tauri::command]
pub async fn ai_chat_cancel(
    state: State<'_, AiChatState>,
    session_id: String,
) -> Result<(), String> {
    let session = state.session(&session_id)?;
    tauri::async_runtime::spawn_blocking(move || session.cancel())
        .await
        .map_err(|_| "Could not stop the Codex response.".to_string())?
}

#[tauri::command]
pub fn ai_chat_approve(
    state: State<'_, AiChatState>,
    session_id: String,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    let session = state.session(&session_id)?;
    session.answer_approval(&request_id, approved)
}

#[tauri::command]
pub async fn ai_chat_close(
    state: State<'_, AiChatState>,
    session_id: String,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| "Chat state unavailable.")?
        .remove(&session_id);
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(session) = session {
            session.decline_approvals();
            session.cancel_jobs();
            return session.shutdown_checked();
        }
        Ok(())
    })
    .await
    .map_err(|_| "Could not close the Codex session.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tool_results_support_both_mcp_encodings() {
        assert_eq!(
            structured_result(&json!({"structuredContent":{"projectPath":"/workspace/blink"}}))
                .unwrap()["projectPath"],
            "/workspace/blink"
        );
        assert_eq!(structured_result(&json!({"content":[{"type":"text","text":"{\"projectPath\":\"/workspace/blink\"}"}]})).unwrap()["projectPath"], "/workspace/blink");
        assert!(structured_result(&json!({"content":[{"text":"not json"}]})).is_none());
    }
    #[test]
    fn copied_cli_config_omits_nulls_for_toml_conversion() {
        assert_eq!(
            non_null_config(
                &json!({"command":"codex","timeout":null,"env":{"KEY":"value","EMPTY":null}})
            ),
            json!({"command":"codex","env":{"KEY":"value"}})
        );
    }
    #[test]
    fn usage_and_compaction_notifications_reach_frontend() {
        let (session, _) = test_session();
        let (tx, rx) = mpsc::channel();
        *session.channel.lock().unwrap() = Channel::new(move |event| {
            if let tauri::ipc::InvokeResponseBody::Json(body) = event {
                tx.send(serde_json::from_str::<Value>(&body).unwrap())
                    .unwrap();
            }
            Ok(())
        });
        session.handle_notification(
            "thread/tokenUsage/updated",
            &json!({"tokenUsage":{"last":{"totalTokens":500},"modelContextWindow":1000}}),
        );
        let event = rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(event["type"], "context_usage");
        assert_eq!(event["usage"]["last"]["totalTokens"], 500);
        session.handle_notification(
            "account/rateLimits/updated",
            &json!({"rateLimits":{"primary":{"usedPercent":20}}}),
        );
        assert_eq!(
            rx.recv_timeout(Duration::from_secs(1)).unwrap()["type"],
            "rate_limits"
        );
        for (method, message) in [
            ("item/started", "Compacting context…"),
            ("item/completed", "Thinking…"),
        ] {
            session.handle_notification(
                method,
                &json!({"item":{"type":"contextCompaction","id":"compact"}}),
            );
            assert_eq!(
                rx.recv_timeout(Duration::from_secs(1)).unwrap()["message"],
                message
            );
        }
    }

    #[test]
    fn event_contract_uses_frontend_names() {
        let event = serde_json::to_value(AiChatEvent::ApprovalRequired {
            request_id: "12".into(),
            title: "Program board".into(),
            description: "Confirm".into(),
            details: json!({}),
        })
        .unwrap();
        assert_eq!(event["type"], "approval_required");
        assert_eq!(event["requestId"], "12");
    }

    #[test]
    #[ignore = "requires an installed, logged-in Codex CLI"]
    fn live_available_models() {
        let models =
            tauri::async_runtime::block_on(ai_chat_models()).expect("live model discovery");
        assert!(!models.is_empty(), "Codex must expose available models");
        if let Ok(expected) = std::env::var("ALLORA_CHAT_SMOKE_MODEL") {
            assert!(
                models.iter().any(|model| model.model == expected),
                "expected model {expected} must be available"
            );
        }
        assert!(models
            .iter()
            .all(|model| !model.model.is_empty() && !model.display_name.is_empty()));
        for model in &models {
            assert!(!model.supported_reasoning_efforts.is_empty());
            assert!(model
                .supported_reasoning_efforts
                .iter()
                .all(|item| item["reasoningEffort"]
                    .as_str()
                    .is_some_and(|effort| !effort.is_empty())));
        }
        println!(
            "Codex model discovery passed: {} models, {} reported context windows",
            models.len(),
            models
                .iter()
                .filter(|model| model.context_window.is_some())
                .count()
        );
    }

    #[test]
    #[ignore = "requires an installed, logged-in Codex CLI"]
    fn live_account_usage() {
        let result = tauri::async_runtime::block_on(ai_chat_usage()).expect("account usage read");
        assert!(result["rateLimits"].is_object());
        for key in ["primary", "secondary"] {
            if !result["rateLimits"][key].is_null() {
                assert!(result["rateLimits"][key]["usedPercent"].is_number());
            }
        }
    }

    #[test]
    fn failed_turn_releases_waiting_send_and_preserves_error() {
        let (session, done_rx) = test_session();
        *session.current_turn.lock().unwrap() = Some("turn-1".into());
        session.handle_notification("turn/completed", &json!({"turn":{"id":"turn-1","status":"failed","error":{"message":"Account usage limit reached"}}}));
        assert_eq!(
            done_rx.recv_timeout(Duration::from_secs(1)).unwrap(),
            Err("Account usage limit reached".into())
        );
        assert!(!session.busy.load(Ordering::SeqCst));
        assert!(session.current_turn.lock().unwrap().is_none());
    }

    fn test_session() -> (Session, mpsc::Receiver<Result<(), String>>) {
        let (done_tx, done_rx) = mpsc::channel();
        let session = Session {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            approvals: Mutex::new(HashMap::new()),
            completion: Mutex::new(Some(done_tx)),
            channel: Mutex::new(Channel::new(|_| Ok(()))),
            thread_id: Mutex::new(String::new()),
            current_turn: Mutex::new(None),
            last_agent_item: Mutex::new(None),
            busy: AtomicBool::new(true),
            closed: AtomicBool::new(false),
            next_rpc: AtomicU64::new(1),
            last_activity: Mutex::new(Instant::now()),
            _catalog: tempfile::NamedTempFile::new().unwrap(),
        };
        (session, done_rx)
    }

    #[test]
    fn stopping_pending_connection_acknowledges_success() {
        let (session, done_rx) = test_session();
        assert!(session.busy.load(Ordering::SeqCst));
        assert_eq!(session.cancel(), Ok(()));
        assert_eq!(
            done_rx.recv_timeout(Duration::from_secs(1)).unwrap(),
            Ok(())
        );
        assert!(session.closed.load(Ordering::SeqCst));
        assert!(!session.busy.load(Ordering::SeqCst));
        assert_eq!(session.cancel(), Ok(()), "Stop is idempotent after cleanup");
    }

    /// Run explicitly with an actual Allora binary and a scoped scratch folder.
    /// This exercises the installed CLI, existing login, MCP startup and a real
    /// streamed agent turn; it does not use fake model/tool responses.
    #[test]
    #[ignore = "requires logged-in Codex and ALLORA_CHAT_SMOKE_* paths"]
    fn live_codex_mcp_turn() {
        let workspace_path = std::env::var("ALLORA_CHAT_SMOKE_WORKSPACE").expect("workspace path");
        let catalog = std::env::var("ALLORA_CHAT_SMOKE_CATALOG").expect("board catalog path");
        let boards = serde_json::from_slice(&std::fs::read(catalog).unwrap()).unwrap();
        let (event_tx, event_rx) = mpsc::channel();
        let channel = Channel::new(move |body| {
            if let tauri::ipc::InvokeResponseBody::Json(message) = body {
                let event: Value = serde_json::from_str(&message).unwrap();
                let _ = event_tx.send(event);
            }
            Ok(())
        });
        let (session, info) = start_session(
            ChatStartRequest {
                workspace_path,
                boards,
                thread_id: None,
                model: std::env::var("ALLORA_CHAT_SMOKE_MODEL")
                    .expect("set an available smoke-test model"),
            },
            channel,
        )
        .expect("live chat startup");
        let prompt = std::env::var("ALLORA_CHAT_SMOKE_PROMPT").unwrap_or_else(|_| "Use Allora's tools to list the supported boards and describe the first one. Do not edit files, build or program hardware.".into());
        session.rpc("turn/start", json!({"threadId":info.thread_id,"model":std::env::var("ALLORA_CHAT_SMOKE_MODEL").ok(),"effort":std::env::var("ALLORA_CHAT_SMOKE_EFFORT").ok(),"input":[{"type":"text","text":prompt,"text_elements":[]}]})).expect("live turn starts");
        let deadline = Instant::now() + Duration::from_secs(240);
        let mut tool_calls = 0;
        let mut successful_tools = Vec::new();
        let mut simulation_succeeded = false;
        let mut build_artifact = None;
        let expect_declined_program =
            std::env::var("ALLORA_CHAT_SMOKE_EXPECT_DECLINED_PROGRAM").as_deref() == Ok("1");
        let mut hardware_confirmation_seen = false;
        let mut declined_program_result = false;
        let mut assistant = String::new();
        let outcome = loop {
            if Instant::now() > deadline {
                break Err("live turn timed out".to_string());
            }
            let event = match event_rx.recv_timeout(Duration::from_secs(5)) {
                Ok(event) => event,
                Err(_) => continue,
            };
            match event["type"].as_str() {
                Some("assistant_delta") => {
                    assistant.push_str(event["delta"].as_str().unwrap_or_default())
                }
                Some("tool_completed") => {
                    tool_calls += 1;
                    println!(
                        "tool completed: {} error={}",
                        event["name"], event["isError"]
                    );
                    if event["isError"] == false {
                        successful_tools
                            .push(event["name"].as_str().unwrap_or_default().to_string());
                        if let Some(result) = structured_result(&event["result"]) {
                            if result["kind"] == "simulation" && result["status"] == "succeeded" {
                                simulation_succeeded = true;
                            }
                            if result["kind"] == "build" && result["status"] == "succeeded" {
                                build_artifact = result
                                    .pointer("/result/artifactId")
                                    .and_then(Value::as_str)
                                    .map(String::from);
                            }
                        }
                    } else {
                        println!("Tool error details: {}", event["result"]);
                        if event["name"] == "program_board" {
                            let details = event["result"].to_string().to_ascii_lowercase();
                            declined_program_result = details.contains("declined")
                                && details.contains("no programming started");
                        }
                    }
                }
                Some("error") => {
                    break Err(event["message"]
                        .as_str()
                        .unwrap_or("live error")
                        .to_string())
                }
                Some("approval_required") => {
                    // This test never authorizes a programmer. Exercise the
                    // production decline path shared with the UI command.
                    let request_id = event["requestId"].as_str().expect("hardware request ID");
                    session
                        .answer_approval(request_id, false)
                        .expect("decline hardware form");
                    if !expect_declined_program {
                        break Err("smoke turn unexpectedly requested programming confirmation"
                            .to_string());
                    }
                    assert_eq!(
                        event.pointer("/details/serverName").and_then(Value::as_str),
                        Some("allora")
                    );
                    assert_eq!(
                        event
                            .pointer("/details/requestedSchema/properties/confirmTarget/type")
                            .and_then(Value::as_str),
                        Some("boolean")
                    );
                    hardware_confirmation_seen = true;
                    println!("Real Allora hardware form received and declined; no programming authorized.");
                }
                Some("turn_completed") => break Ok(()),
                _ => {}
            }
        };
        session.cancel_jobs();
        session.shutdown();
        outcome.expect("live response completion");
        println!("Live assistant response: {assistant}");
        assert!(tool_calls > 0, "Codex must actually call Allora tools");
        assert!(
            !assistant.trim().is_empty(),
            "assistant response must stream"
        );
        if std::env::var("ALLORA_CHAT_SMOKE_EXPECT_BUILD").as_deref() == Ok("1") {
            for required in [
                "apply_file_changes",
                "set_pin_assignments",
                "simulate_testbench",
                "build_bitstream",
            ] {
                assert!(
                    successful_tools.iter().any(|tool| tool == required),
                    "workflow missing successful {required}"
                );
            }
            assert!(
                simulation_succeeded,
                "simulation must actually finish successfully"
            );
            assert!(
                build_artifact.is_some(),
                "build must finish with a real artifact ID"
            );
            println!(
                "Verified successful simulation and build artifact {}",
                build_artifact.as_deref().unwrap()
            );
        }
        if expect_declined_program {
            assert!(
                build_artifact.is_some(),
                "hardware form requires a fresh real build artifact"
            );
            assert!(
                hardware_confirmation_seen,
                "real MCP hardware elicitation must reach the bridge"
            );
            assert!(
                declined_program_result,
                "program_board must confirm declined and no programming started"
            );
            println!("Verified hardware confirmation decline roundtrip without programming.");
        }
        println!(
            "Live Codex response completed with {tool_calls} tools and {} text characters.",
            assistant.len()
        );
    }
}
