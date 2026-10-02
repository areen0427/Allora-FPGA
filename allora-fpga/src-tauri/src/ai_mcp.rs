//! Session-scoped MCP adapter for Allora's existing project and FPGA services.
//!
//! The GUI launches this executable with `--allora-mcp`. Only newline-delimited
//! JSON-RPC goes to stdout; no Tauri runtime or webview is created. The server
//! implements the MCP initialization, tools, ping, and form-elicitation surface.
//! Workspace and board catalog are supplied by the trusted chat host, never by
//! model-supplied tool arguments.

use super::*;
use serde_json::{json, Map};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::sync::atomic::AtomicU64;
use std::sync::mpsc;

const MAX_MESSAGE: usize = 4 * 1024 * 1024;
const MAX_FILE: usize = 1024 * 1024;
const MAX_FILES: usize = 2048;
const MAX_SNAPSHOT: usize = 16 * 1024 * 1024;
const MAX_LOG_LINES: usize = 400;
const MAX_JOBS: usize = 32;

type ToolResult = Result<Value, String>;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Board {
    id: String,
    name: String,
    family: String,
    package: String,
    fpga_id: String,
    synthesis_flow: String,
    constraints_file: String,
    #[serde(default)]
    identity_unresolved: bool,
    toolchain: Value,
    #[serde(default)]
    programmer: Option<Value>,
    #[serde(default)]
    pins: Vec<Pin>,
    #[serde(default)]
    leds: Vec<Pin>,
    #[serde(default)]
    buttons: Vec<Pin>,
    #[serde(default)]
    clocks: Vec<Clock>,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pin {
    name: String,
    pin: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    verified: bool,
    #[serde(default)]
    active_low: bool,
    #[serde(default)]
    io_standard: Option<String>,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Clock {
    name: String,
    pin: Option<String>,
    frequency: f64,
    #[serde(default)]
    verified: bool,
    #[serde(default)]
    io_standard: Option<String>,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

impl Board {
    fn can_build(&self) -> bool {
        let family = self.family.to_ascii_lowercase();
        let fpga = self.fpga_id.to_ascii_lowercase();
        self.synthesis_flow == "yosys-nextpnr"
            && !self.identity_unresolved
            && !self.package.is_empty()
            && self.package != "unknown"
            && ((family.contains("ice40")
                && ["up5k", "hx8k", "hx4k", "hx1k", "lp8k", "lp1k"]
                    .iter()
                    .any(|part| fpga.contains(part)))
                || (family.contains("ecp5")
                    && ["lfe5u-", "lfe5um-", "lfe5um5g-"]
                        .iter()
                        .any(|class| fpga.starts_with(class))
                    && ["12f", "25f", "45f", "85f"]
                        .iter()
                        .any(|part| fpga.contains(part))
                    && !(fpga.contains("12f") && !fpga.starts_with("lfe5u-"))))
            && matches!(self.constraints_file.as_str(), "pcf" | "lpf")
    }

    fn programmer_command(&self) -> Option<&str> {
        self.programmer
            .as_ref()
            .and_then(|p| p.get("command")?.as_str())
            .or_else(|| self.toolchain.get("program")?.as_str())
    }

    fn description(&self) -> Value {
        let mut value = json!({
            "id": self.id, "name": self.name, "family": self.family,
            "package": self.package, "fpgaId": self.fpga_id,
            "synthesisFlow": self.synthesis_flow, "constraintsFile": self.constraints_file,
            "identityUnresolved": self.identity_unresolved, "toolchain": self.toolchain,
            "programmer": self.programmer, "pins": self.pins, "leds": self.leds,
            "buttons": self.buttons, "clocks": self.clocks,
            "buildSupported": self.can_build(),
            "programmingSupported": self.can_build() && self.programmer_command()
                .is_some_and(|p| matches!(p, "iceprog" | "icesprog" | "ecpprog")),
            "programmingNote": "USB discovery is indicative only. Programming requires user confirmation of the physical target."
        });
        for (key, entry) in &self.extra {
            value
                .as_object_mut()
                .unwrap()
                .insert(key.clone(), entry.clone());
        }
        value
    }
}

struct Job {
    id: String,
    kind: String,
    project: String,
    status: String,
    logs: Vec<String>,
    result: Option<Value>,
    failure: Option<String>,
    cancellation: Arc<AtomicBool>,
}

impl Job {
    fn value(&self, include_result: bool) -> Value {
        let mut value = json!({"jobId":self.id,"kind":self.kind,"projectPath":self.project,
            "status":self.status,"logs":self.logs,"error":self.failure});
        if include_result {
            value["result"] = self.result.clone().unwrap_or(Value::Null);
        }
        value
    }
}

#[derive(Clone)]
struct Artifact {
    project: PathBuf,
    board_id: String,
    path: PathBuf,
    hash: String,
    snapshot: String,
}

struct Server {
    workspace: PathBuf,
    boards: BTreeMap<String, Board>,
    writer: Mutex<io::Stdout>,
    initialized: AtomicBool,
    elicitation: AtomicBool,
    active_calls: AtomicU32,
    next_id: AtomicU64,
    pending: Mutex<HashMap<String, mpsc::Sender<Value>>>,
    mutations: Mutex<()>,
    jobs: Mutex<BTreeMap<String, Arc<Mutex<Job>>>>,
    artifacts: Mutex<BTreeMap<String, Artifact>>,
}

impl Server {
    fn from_environment() -> Result<Arc<Self>, String> {
        let root =
            env::var("ALLORA_WORKSPACE_PATH").map_err(|_| "Missing Allora workspace scope.")?;
        let workspace =
            fs::canonicalize(&root).map_err(|e| format!("Unable to resolve workspace: {e}"))?;
        if !workspace.is_dir() {
            return Err("Allora workspace scope must be a directory.".into());
        }
        let catalog_path =
            env::var("ALLORA_BOARD_CATALOG_PATH").map_err(|_| "Missing Allora board catalog.")?;
        let bytes = bounded_read(Path::new(&catalog_path), 8 * 1024 * 1024)?;
        let catalog: Vec<Board> =
            serde_json::from_slice(&bytes).map_err(|e| format!("Invalid board catalog: {e}"))?;
        let mut boards = BTreeMap::new();
        for board in catalog {
            if board.id.is_empty() || boards.insert(board.id.clone(), board).is_some() {
                return Err("Board catalog contains missing or duplicate IDs.".into());
            }
        }
        if boards.is_empty() {
            return Err("Board catalog is empty.".into());
        }
        Ok(Arc::new(Self {
            workspace,
            boards,
            writer: Mutex::new(io::stdout()),
            initialized: AtomicBool::new(false),
            elicitation: AtomicBool::new(false),
            active_calls: AtomicU32::new(0),
            next_id: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
            mutations: Mutex::new(()),
            jobs: Mutex::new(BTreeMap::new()),
            artifacts: Mutex::new(BTreeMap::new()),
        }))
    }

    fn write(&self, message: Value) {
        let Ok(mut bytes) = serde_json::to_vec(&message) else {
            return;
        };
        if bytes.len() > MAX_MESSAGE {
            let id = message.get("id").cloned().unwrap_or(Value::Null);
            bytes=serde_json::to_vec(&json!({"jsonrpc":"2.0","id":id,"error":{"code":-32000,
                "message":"Allora's response exceeded the transport limit. Inspect a smaller file or a narrower job result."}})).unwrap_or_default();
        }
        if let Ok(mut writer) = self.writer.lock() {
            let _ = writer.write_all(&bytes);
            let _ = writer.write_all(b"\n");
            let _ = writer.flush();
        }
    }

    fn error(&self, id: Value, code: i32, message: &str) {
        self.write(json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}}));
    }

    fn result(&self, id: Value, value: Value) {
        self.write(json!({"jsonrpc":"2.0","id":id,"result":value}));
    }

    fn board(&self, id: &str) -> Result<Board, String> {
        self.boards
            .get(id)
            .cloned()
            .ok_or_else(|| format!("Unknown board ID '{id}'. Use list_supported_boards."))
    }

    fn project(&self, path: &str) -> Result<PathBuf, String> {
        let given = Path::new(path);
        let path = if given.is_absolute() {
            given.to_path_buf()
        } else {
            self.workspace.join(safe_relative(path)?)
        };
        if !path.starts_with(&self.workspace) {
            return Err("Project is outside the selected chat workspace.".into());
        }
        reject_symlinks(&self.workspace, &path)?;
        let canonical =
            fs::canonicalize(&path).map_err(|e| format!("Unable to open project: {e}"))?;
        if !canonical.starts_with(&self.workspace) {
            return Err("Project is outside the selected chat workspace.".into());
        }
        project_file(&canonical, "allora-project.json")?;
        if !canonical.join("allora-project.json").is_file() {
            return Err("Choose an Allora project containing allora-project.json.".into());
        }
        Ok(canonical)
    }

    fn metadata(&self, project: &Path) -> Result<Value, String> {
        let path = project_file(project, "allora-project.json")?;
        let bytes = bounded_read(&path, MAX_FILE)?;
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|e| format!("Invalid allora-project.json: {e}"))?;
        if !value.is_object() {
            return Err("Project metadata must be an object.".into());
        }
        Ok(value)
    }

    fn project_board(&self, metadata: &Value) -> Result<Board, String> {
        let board_id = string(metadata, "boardId")?;
        self.board(board_id)
    }

    fn next(&self, prefix: &str) -> String {
        format!("{prefix}-{}", self.next_id.fetch_add(1, Ordering::Relaxed))
    }

    fn call(self: &Arc<Self>, name: &str, args: &Value) -> ToolResult {
        match name {
            "list_supported_boards" => {
                let query = args
                    .get("query")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_ascii_lowercase();
                Ok(
                    json!({"boards":self.boards.values().filter(|b| query.is_empty()
                    || b.name.to_ascii_lowercase().contains(&query) || b.id.to_ascii_lowercase().contains(&query))
                    .map(|b| json!({"id":b.id,"name":b.name,"family":b.family,"fpgaId":b.fpga_id,
                        "buildSupported":b.can_build(),"hasVerifiedClock":b.clocks.iter().any(|c| c.verified),
                        "hasVerifiedLed":b.leds.iter().any(|p| p.verified)})).collect::<Vec<_>>() }),
                )
            }
            "get_board_definition" => Ok(self.board(string(args, "boardId")?)?.description()),
            "get_toolchain_status" => {
                let mut names = BTreeSet::from(["iverilog".to_string(), "vvp".to_string()]);
                if let Some(id) = args.get("boardId").and_then(Value::as_str) {
                    let board = self.board(id)?;
                    for key in ["synth", "placeRoute", "pack", "program"] {
                        if let Some(tool) = board
                            .toolchain
                            .get(key)
                            .and_then(Value::as_str)
                            .filter(|s| !s.is_empty())
                        {
                            names.insert(tool.to_string());
                        }
                    }
                }
                let tools = names.iter().map(|name| {
                    // Packers and vvp do not consistently support --help or
                    // --version. Do not execute a hardware programmer merely
                    // to discover whether its binary exists.
                    let path=executable_path(name);
                    json!({"command":name,"installed":path.is_some(),"path":path,"version":Value::Null,
                        "message":if path.is_some(){"Executable found; operational readiness is checked by the actual job."}
                            else{"Executable not found in Allora's tool directories or PATH."}})
                }).collect::<Vec<_>>();
                Ok(json!({"tools":tools}))
            }
            "detect_hardware" => {
                let board = self.board(string(args, "boardId")?)?;
                let programmer = board
                    .programmer_command()
                    .ok_or("No programmer is configured for this board.")?;
                let command = executable_path(programmer)
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_else(|| programmer.into());
                let info = detect_connected_board(DetectConnectedBoardRequest {
                    programmer_command: command,
                    usb_vendor_id: None,
                    usb_product_id: None,
                })
                .map_err(|e| e.message)?;
                let mut value = serde_json::to_value(info).map_err(|e| e.to_string())?;
                value["targetIdentityVerified"] = json!(false);
                value["note"] = json!("USB names and IDs suggest candidate boards; they do not identify an exact board. Disconnect other compatible targets and confirm the physical board before programming.");
                Ok(value)
            }
            "get_project_context" => {
                if args.get("projectPath").is_none() {
                    let mut projects = Vec::new();
                    if self.workspace.join("allora-project.json").is_file() {
                        projects.push(self.workspace.clone());
                    }
                    for entry in fs::read_dir(&self.workspace)
                        .map_err(|e| format!("Unable to read workspace: {e}"))?
                    {
                        if projects.len() >= 200 {
                            break;
                        }
                        let entry = entry.map_err(|e| format!("Unable to read workspace: {e}"))?;
                        let kind = entry
                            .file_type()
                            .map_err(|e| format!("Unable to inspect workspace: {e}"))?;
                        if kind.is_dir() && entry.path().join("allora-project.json").is_file() {
                            projects.push(entry.path());
                        }
                    }
                    return Ok(json!({"workspacePath":self.workspace,"projects":projects,
                        "note":"Call get_project_context with a projectPath to inspect a project, or create_project to create one in this workspace."}));
                }
                let project = self.project(string(args, "projectPath")?)?;
                let metadata = self.metadata(&project)?;
                let entries = project_entries(&project)?;
                Ok(
                    json!({"workspacePath":self.workspace,"projectPath":project,"metadata":metadata,
                    "snapshotRevision":snapshot(&entries),"files":entries.iter().map(|(name,bytes)|
                        json!({"path":name,"bytes":bytes.len(),"revision":revision(bytes)})).collect::<Vec<_>>(),
                    "editorNote":"Tools read saved files. The chat host must save or resolve editor changes before a turn."}),
                )
            }
            "read_file" => {
                let project = self.project(string(args, "projectPath")?)?;
                let relative = string(args, "path")?;
                let path = project_file(&project, relative)?;
                if !path.exists() {
                    return Ok(
                        json!({"path":relative,"exists":false,"revision":Value::Null,"content":Value::Null}),
                    );
                }
                let bytes = bounded_read(&path, MAX_FILE)?;
                let content = String::from_utf8(bytes.clone())
                    .map_err(|_| "This file is binary; read_file supports text only.")?;
                Ok(
                    json!({"path":relative,"exists":true,"revision":revision(&bytes),"content":content}),
                )
            }
            "create_project" => self.create_project(args),
            "apply_file_changes" => {
                let _lock = self
                    .mutations
                    .lock()
                    .map_err(|_| "Project writer is unavailable.")?;
                let project = self.project(string(args, "projectPath")?)?;
                let changes: Vec<FileChange> =
                    serde_json::from_value(args.get("changes").cloned().ok_or("Missing changes.")?)
                        .map_err(|e| format!("Invalid file changes: {e}"))?;
                apply_changes(&project, &changes)?;
                Ok(
                    json!({"projectPath":project,"changedFiles":changes.iter().map(|c| &c.path).collect::<Vec<_>>(),
                    "snapshotRevision":snapshot(&project_entries(&project)?)}),
                )
            }
            "configure_project" => self.configure_project(args),
            "set_pin_assignments" | "validate_pin_assignments" => {
                self.pin_assignments(args, name == "set_pin_assignments")
            }
            "lint_hdl" => {
                let project = self.project(string(args, "projectPath")?)?;
                let entries = project_entries(&project)?;
                let sources = source_files(&entries, None)?;
                let result =
                    lint_hdl_service(LintHdlRequest { files: sources }).map_err(|e| e.message)?;
                serde_json::to_value(result).map_err(|e| e.to_string())
            }
            "simulate_testbench" => self.start_simulation(args),
            "build_bitstream" => self.start_build(args),
            "get_job_status" | "get_job_result" => {
                let jobs = self.jobs.lock().map_err(|_| "Jobs are unavailable.")?;
                let job = jobs
                    .get(string(args, "jobId")?)
                    .ok_or("Unknown job ID in this chat session.")?;
                let value = job
                    .lock()
                    .map_err(|_| "Job is unavailable.")?
                    .value(name == "get_job_result");
                Ok(value)
            }
            "cancel_job" => {
                let jobs = self.jobs.lock().map_err(|_| "Jobs are unavailable.")?;
                let job = jobs
                    .get(string(args, "jobId")?)
                    .ok_or("Unknown job ID in this chat session.")?;
                let mut job = job.lock().map_err(|_| "Job is unavailable.")?;
                if job.status == "running" {
                    job.cancellation.store(true, Ordering::Release);
                    job.status = "cancelling".into();
                }
                Ok(job.value(false))
            }
            "cancel_all_jobs" => {
                let jobs = self.jobs.lock().map_err(|_| "Jobs are unavailable.")?;
                let mut cancelled = Vec::new();
                for job in jobs.values() {
                    let mut job = job.lock().map_err(|_| "Job is unavailable.")?;
                    if matches!(job.status.as_str(), "running" | "cancelling") {
                        job.cancellation.store(true, Ordering::Release);
                        job.status = "cancelling".into();
                        cancelled.push(job.id.clone());
                    }
                }
                // Cancelling the chat must also dismiss a pending hardware form.
                if let Ok(mut pending) = self.pending.lock() {
                    pending.clear();
                }
                Ok(json!({"cancelledJobIds":cancelled,"status":"cancelling"}))
            }
            "program_board" => self.start_programming(args),
            _ => Err(format!("Unknown Allora tool '{name}'.")),
        }
    }

    fn create_project(&self, args: &Value) -> ToolResult {
        let _lock = self
            .mutations
            .lock()
            .map_err(|_| "Project writer is unavailable.")?;
        let name = string(args, "name")?.trim();
        if name.is_empty() || name.len() > 120 {
            return Err("Project name must have 1–120 characters.".into());
        }
        let board = self.board(string(args, "boardId")?)?;
        let top = args
            .get("topModule")
            .and_then(Value::as_str)
            .unwrap_or("top");
        identifier(top)?;
        let folder = sanitize_name(name);
        let response = create_project_workspace(CreateProjectWorkspaceRequest {
            project_name: name.into(),
            folder_name: folder,
            parent_directory: Some(self.workspace.to_string_lossy().into()),
            initialize_git: false,
            files: vec![WorkspaceFileSpec {
                relative_path: "allora-project.json".into(),
                content: serde_json::to_string_pretty(&json!({
                    "name":name,"boardId":board.id,"boardName":board.name,"topModule":top,
                    "language":"SystemVerilog","template":"empty","testbench":Value::Null,
                }))
                .map_err(|e| e.to_string())?,
            }],
        })
        .map_err(|e| e.message)?;
        let mut value = serde_json::to_value(response).map_err(|e| e.to_string())?;
        value["projectName"] = json!(name);
        Ok(value)
    }

    fn configure_project(&self, args: &Value) -> ToolResult {
        let _lock = self
            .mutations
            .lock()
            .map_err(|_| "Project writer is unavailable.")?;
        let project = self.project(string(args, "projectPath")?)?;
        let mut metadata = self.metadata(&project)?;
        let original = bounded_read(&project_file(&project, "allora-project.json")?, MAX_FILE)?;
        if let Some(board_id) = args.get("boardId").and_then(Value::as_str) {
            let board = self.board(board_id)?;
            if metadata.get("boardId").and_then(Value::as_str) != Some(board_id) {
                metadata.as_object_mut().unwrap().remove("aiPinAssignments");
            }
            metadata["boardId"] = json!(board.id);
            metadata["boardName"] = json!(board.name);
        }
        if let Some(top) = args.get("topModule").and_then(Value::as_str) {
            identifier(top)?;
            metadata["topModule"] = json!(top);
        }
        if let Some(testbench) = args.get("testbench").and_then(Value::as_str) {
            identifier(testbench)?;
            metadata["testbench"] = json!(testbench);
        }
        if let Some(source) = args.get("sourceFile").and_then(Value::as_str) {
            safe_relative(source)?;
            metadata["sourceFile"] = json!(source);
        }
        apply_changes(
            &project,
            &[FileChange {
                path: "allora-project.json".into(),
                content: Some(serde_json::to_string_pretty(&metadata).map_err(|e| e.to_string())?),
                expected_revision: Some(revision(&original)),
            }],
        )?;
        Ok(json!({"projectPath":project,"metadata":metadata}))
    }

    fn pin_assignments(&self, args: &Value, write: bool) -> ToolResult {
        let _lock = self
            .mutations
            .lock()
            .map_err(|_| "Project writer is unavailable.")?;
        let project = self.project(string(args, "projectPath")?)?;
        let mut metadata = self.metadata(&project)?;
        let board = self.project_board(&metadata)?;
        let assignments: Vec<Assignment> = serde_json::from_value(
            args.get("assignments")
                .cloned()
                .or_else(|| metadata.get("aiPinAssignments").cloned())
                .ok_or("Provide assignments or call set_pin_assignments first.")?,
        )
        .map_err(|e| format!("Invalid pin assignments: {e}"))?;
        let constraints = verified_constraints(&board, &assignments)?;
        let constraint_path = format!("constraints/constraints.{}", board.constraints_file);
        if write {
            let metadata_bytes =
                bounded_read(&project_file(&project, "allora-project.json")?, MAX_FILE)?;
            let path = project_file(&project, &constraint_path)?;
            let previous = read_if_exists(&path)?;
            metadata["aiPinAssignments"] =
                serde_json::to_value(&assignments).map_err(|e| e.to_string())?;
            apply_changes(
                &project,
                &[
                    FileChange {
                        path: constraint_path.clone(),
                        content: Some(constraints.clone()),
                        expected_revision: previous.as_deref().map(revision),
                    },
                    FileChange {
                        path: "allora-project.json".into(),
                        content: Some(
                            serde_json::to_string_pretty(&metadata).map_err(|e| e.to_string())?,
                        ),
                        expected_revision: Some(revision(&metadata_bytes)),
                    },
                ],
            )?;
        }
        Ok(
            json!({"valid":true,"boardId":board.id,"assignments":assignments,
            "constraintPath":constraint_path,"constraints":constraints,"saved":write}),
        )
    }

    fn start_job<F>(self: &Arc<Self>, kind: &str, project: &Path, task: F) -> ToolResult
    where
        F: FnOnce(&LogSink) -> ToolResult + Send + 'static,
    {
        let id = self.next("job");
        let cancel = Arc::new(AtomicBool::new(false));
        let job = Arc::new(Mutex::new(Job {
            id: id.clone(),
            kind: kind.into(),
            project: project.to_string_lossy().into(),
            status: "running".into(),
            logs: Vec::new(),
            result: None,
            failure: None,
            cancellation: cancel.clone(),
        }));
        {
            let mut jobs = self.jobs.lock().map_err(|_| "Jobs are unavailable.")?;
            for running in jobs.values() {
                let running = running.lock().map_err(|_| "Job is unavailable.")?;
                if matches!(running.status.as_str(), "running" | "cancelling")
                    && running.project == project.to_string_lossy()
                {
                    return Err(format!("Job {} is still {} for this project. Wait or cancel it before starting another.",running.id,running.status));
                }
            }
            if jobs.len() >= MAX_JOBS {
                let completed = jobs.iter().find_map(|(id, job)| {
                    job.lock()
                        .ok()
                        .filter(|j| !matches!(j.status.as_str(), "running" | "cancelling"))
                        .map(|_| id.clone())
                });
                if let Some(id) = completed {
                    jobs.remove(&id);
                } else {
                    return Err("Too many active jobs.".into());
                }
            }
            jobs.insert(id.clone(), job.clone());
        }
        let log_job = job.clone();
        let sink = LogSink::new(
            move |line| {
                if let Ok(mut job) = log_job.lock() {
                    if job.logs.len() >= MAX_LOG_LINES {
                        job.logs.remove(0);
                    }
                    job.logs.push(line.chars().take(4000).collect());
                }
            },
            Some(cancel.clone()),
        );
        let completion_server = self.clone();
        thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| task(&sink)))
                .unwrap_or_else(|_| Err("Allora job stopped unexpectedly.".into()));
            if let Ok(mut job) = job.lock() {
                if cancel.load(Ordering::Acquire) {
                    job.status = "cancelled".into();
                    if let Ok(value) = &result {
                        if job.kind == "build" {
                            if let Some(id) = value.get("artifactId").and_then(Value::as_str) {
                                if let Ok(mut artifacts) = completion_server.artifacts.lock() {
                                    // A cancelled build must not leave an artifact
                                    // available by a guessed session ID.
                                    if let Some(artifact) = artifacts.remove(id) {
                                        let _ = fs::remove_file(&artifact.path);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    match result {
                        Ok(value) => {
                            job.status = "succeeded".into();
                            job.result = Some(value);
                        }
                        Err(e) => {
                            job.status = "failed".into();
                            job.failure = Some(e);
                        }
                    }
                }
            }
        });
        Ok(json!({"jobId":id,"status":"running","pollWith":"get_job_result"}))
    }

    fn start_simulation(self: &Arc<Self>, args: &Value) -> ToolResult {
        let project = self.project(string(args, "projectPath")?)?;
        let metadata = self.metadata(&project)?;
        let entries = project_entries(&project)?;
        let testbench = string(args, "testbenchPath")?;
        safe_relative(testbench)?;
        let bytes = entries
            .iter()
            .find(|(name, _)| name == testbench)
            .map(|(_, bytes)| bytes)
            .ok_or("Testbench file does not exist.")?;
        let tb_top = args
            .get("topModule")
            .and_then(Value::as_str)
            .or_else(|| metadata.get("testbench").and_then(Value::as_str))
            .ok_or("Specify the testbench topModule.")?;
        identifier(tb_top)?;
        let request = SimulateTestbenchRequest {
            project_name: metadata
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("allora_project")
                .into(),
            source_files: source_files(&entries, Some(testbench))?,
            testbench_file: SynthesisInputFile {
                name: testbench.into(),
                content: String::from_utf8(bytes.clone()).map_err(|_| "Testbench must be text.")?,
            },
            top_module: Some(tb_top.into()),
            project_path: Some(project.to_string_lossy().into()),
        };
        let source_snapshot = snapshot(&entries);
        let waveform_name = format!("{}.vcd", sanitize_name(&request.project_name));
        project_file(&project, &format!("sim/{waveform_name}"))?;
        self.start_job("simulation", &project, move |sink| {
            let result = simulate_testbench_service(request, sink).map_err(|e| e.message)?;
            Ok(json!({"topModule":result.top_module,"waveformName":result.waveform_name,
                "waveformPath":result.waveform_path,"sourceRevision":source_snapshot,
                "vcdPreview":result.vcd.chars().take(12000).collect::<String>(),"vcdBytes":result.vcd.len()}))
        })
    }

    fn start_build(self: &Arc<Self>, args: &Value) -> ToolResult {
        let _lock = self
            .mutations
            .lock()
            .map_err(|_| "Project writer is unavailable.")?;
        let project = self.project(string(args, "projectPath")?)?;
        let metadata = self.metadata(&project)?;
        let board = self.project_board(&metadata)?;
        if !board.can_build() {
            return Err("This board has no supported local bitstream flow, or its device/package is unresolved. Choose a build-supported iCE40/ECP5 board.".into());
        }
        let top = string(&metadata, "topModule")?;
        identifier(top)?;
        let entries = project_entries(&project)?;
        let assignments: Vec<Assignment> =
            serde_json::from_value(metadata.get("aiPinAssignments").cloned().ok_or(
                "Use set_pin_assignments to generate verified board constraints before building.",
            )?)
            .map_err(|e| format!("Invalid project pin assignments: {e}"))?;
        let constraints = verified_constraints(&board, &assignments)?;
        let constraint_path = format!("constraints/constraints.{}", board.constraints_file);
        let actual = entries
            .iter()
            .find(|(name, _)| name == &constraint_path)
            .map(|(_, bytes)| bytes.as_slice())
            .ok_or("Constraint file is missing.")?;
        if actual != constraints.as_bytes() {
            return Err("Constraint file differs from verified pin assignments. Re-run set_pin_assignments before building.".into());
        }
        // Guard service output paths, including an existing build directory.
        project_file(&project, "build")?;
        let frequency = assignments
            .iter()
            .filter_map(|a| {
                board
                    .clocks
                    .iter()
                    .find(|c| c.verified && c.name == a.board_pin)
                    .map(|c| (a.port.clone(), c.frequency / 1_000_000.0))
            })
            .next();
        let extension = if board.family.to_ascii_lowercase().contains("ice40") {
            "bin"
        } else {
            "bit"
        };
        let request = GenerateBitstreamRequest {
            project_name: metadata
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("allora_project")
                .into(),
            board_name: board.name.clone(),
            board_family: board.family.clone(),
            board_package: board.package.clone(),
            fpga_id: board.fpga_id.clone(),
            synthesis_flow: board.synthesis_flow.clone(),
            top_module: Some(top.into()),
            source_files: source_files(&entries, None)?,
            constraint_file: SynthesisInputFile {
                name: constraint_path,
                content: constraints,
            },
            output_extension: extension.into(),
            project_path: Some(project.to_string_lossy().into()),
            target_clock_name: frequency.as_ref().map(|(name, _)| name.clone()),
            target_frequency_mhz: frequency.map(|(_, freq)| freq),
        };
        project_file(
            &project,
            &format!(
                "build/{}.{}",
                sanitize_name(&request.project_name),
                extension
            ),
        )?;
        let source_snapshot = snapshot(&entries);
        let server = self.clone();
        let task_project = project.clone();
        self.start_job("build", &project, move |sink| {
            let result = generate_bitstream_service(request,sink).map_err(|e| e.message)?;
            if sink.cancelled() { return Err("Build cancelled.".into()); }
            check_build_timing(&result.timing)?;
            if snapshot(&project_entries(&task_project)?) != source_snapshot {
                return Err("Project changed during the build. Rebuild the current files before programming.".into());
            }
            let artifact_id = server.next("artifact");
            let relative = format!("build/allora-ai/{artifact_id}.{extension}");
            let path = project_file(&task_project,&relative)?;
            fs::create_dir_all(path.parent().unwrap()).map_err(|e| format!("Unable to save build artifact: {e}"))?;
            fs::write(&path,&result.bytes).map_err(|e| format!("Unable to save build artifact: {e}"))?;
            let hash = revision(&result.bytes);
            server.artifacts.lock().map_err(|_| "Artifacts are unavailable.")?.insert(artifact_id.clone(),Artifact {
                project:task_project.clone(),board_id:board.id.clone(),path:path.clone(),hash:hash.clone(),snapshot:source_snapshot.clone(),
            });
            Ok(json!({"artifactId":artifact_id,"artifactPath":path,"boardId":board.id,"sourceRevision":source_snapshot,
                "artifactRevision":hash,"bytes":result.bytes.len(),"topModule":result.top_module,"timing":result.timing}))
        })
    }

    fn validate_artifact(&self, artifact: &Artifact) -> Result<Board, String> {
        let project = self.project(&artifact.project.to_string_lossy())?;
        let metadata = self.metadata(&project)?;
        let board = self.project_board(&metadata)?;
        if board.id != artifact.board_id {
            return Err(
                "Artifact board does not match the project's current target. Rebuild.".into(),
            );
        }
        if snapshot(&project_entries(&project)?) != artifact.snapshot {
            return Err("Artifact is stale: project files changed after the build. Rebuild before programming.".into());
        }
        let relative = artifact
            .path
            .strip_prefix(&project)
            .map_err(|_| "Artifact is outside its project.")?;
        let path = project_file(&project, &relative.to_string_lossy())?;
        if revision(&bounded_read(&path, MAX_SNAPSHOT)?) != artifact.hash {
            return Err("Artifact changed after the build. Rebuild before programming.".into());
        }
        Ok(board)
    }

    fn start_programming(self: &Arc<Self>, args: &Value) -> ToolResult {
        if !self.elicitation.load(Ordering::Acquire) {
            return Err("This MCP client cannot request user confirmation. Programming requires in-chat hardware confirmation; no programming was started.".into());
        }
        let project = self.project(string(args, "projectPath")?)?;
        let artifact_id = string(args, "artifactId")?;
        let artifact = self
            .artifacts
            .lock()
            .map_err(|_| "Artifacts are unavailable.")?
            .get(artifact_id)
            .cloned()
            .ok_or("Unknown artifact ID. Build the bitstream in this chat session first.")?;
        if project != artifact.project {
            return Err("Artifact belongs to another project.".into());
        }
        let board = self.validate_artifact(&artifact)?;
        let programmer = board
            .programmer_command()
            .ok_or("Board programmer is not configured.")?;
        if !matches!(programmer, "iceprog" | "icesprog" | "ecpprog") {
            return Err("Automated programming currently supports iceprog, icesprog, and ecpprog. This board's programmer requires additional target-specific integration.".into());
        }
        let programmer_path = executable_path(programmer).ok_or_else(|| {
            format!(
                "{programmer} is not installed. Install the board programmer before programming."
            )
        })?;
        let discovery = detect_connected_board(DetectConnectedBoardRequest {
            programmer_command: programmer_path.to_string_lossy().into(),
            usb_vendor_id: None,
            usb_product_id: None,
        })
        .map_err(|e| e.message)?;
        if !discovery.programmer_detected {
            return Err(discovery.programmer_details);
        }
        // Do not pretend generic USB IDs select one target. The human verifies
        // a single physical board; the model cannot supply an approval argument.
        self.confirm_programming(&board, artifact_id, &artifact, discovery.usb_devices.len())?;
        let board = self.validate_artifact(&artifact)?;
        let request = ProgramFpgaRequest {
            programmer_command: programmer_path.to_string_lossy().into(),
            bitstream_path: artifact.path.to_string_lossy().into(),
            board_name: board.name,
            extra_args: None,
        };
        let server = self.clone();
        let task_artifact_id = artifact_id.to_string();
        self.start_job("programming",&project,move |sink| {
            // Recheck immediately before invoking the programmer.
            server.validate_artifact(&artifact)?;
            let result = program_fpga_service(request,sink).map_err(|e| e.message)?;
            if !result.success { return Err(result.message); }
            Ok(json!({"artifactId":task_artifact_id,"success":result.success,"message":result.message,
                "physicalBehaviorVerified":false,"note":"The programmer confirmed upload; physical LED behavior still requires observation."}))
        })
    }

    fn confirm_programming(
        &self,
        board: &Board,
        artifact_id: &str,
        artifact: &Artifact,
        usb_count: usize,
    ) -> Result<(), String> {
        let id = self.next("approval");
        let (send, receive) = mpsc::channel();
        {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| "Approvals are unavailable.")?;
            if !pending.is_empty() {
                return Err("Another hardware confirmation is pending. Answer it first.".into());
            }
            pending.insert(id.clone(), send);
        }
        self.write(json!({"jsonrpc":"2.0","id":id,"method":"elicitation/create","params":{
            "mode":"form",
            "message":format!("Program {} ({}) with {}? Project: {}. This writes the board's configuration flash. USB discovery saw {} devices and cannot verify the exact target. Disconnect all other compatible boards and confirm that the single connected target is {}. Artifact: {}.",board.name,board.fpga_id,artifact_id,artifact.project.display(),usb_count,board.name,artifact.path.display()),
            "requestedSchema":{"type":"object","properties":{"confirmTarget":{"type":"boolean",
                "title":format!("I confirm the only connected compatible target is {} and authorize programming this artifact",board.name)}},"required":["confirmTarget"]}
        }}));
        let answer = receive.recv_timeout(Duration::from_secs(300));
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&id);
        }
        let answer = answer.map_err(|_| {
            "Hardware confirmation expired or the chat disconnected. No programming started."
        })?;
        if answer.get("error").is_some() {
            return Err("Hardware confirmation could not be shown. No programming started.".into());
        }
        let result = answer.get("result").unwrap_or(&Value::Null);
        if result.get("action").and_then(Value::as_str) == Some("accept")
            && result
                .pointer("/content/confirmTarget")
                .and_then(Value::as_bool)
                == Some(true)
        {
            Ok(())
        } else {
            Err("Programming was declined or cancelled. No programming started.".into())
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FileChange {
    path: String,
    /// null deletes an existing file; a string writes a text file.
    content: Option<String>,
    /// null requires a new file; otherwise exact SHA-256 from read_file.
    expected_revision: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Assignment {
    port: String,
    board_pin: String,
}

fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Missing or invalid '{key}'."))
}

fn identifier(value: &str) -> Result<(), String> {
    let mut chars = value.chars();
    if !chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        || !chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
        || value.len() > 128
    {
        return Err("Use a plain Verilog identifier (letters, digits, underscores; start with a letter or underscore).".into());
    }
    Ok(())
}

fn port_identifier(value: &str) -> Result<(), String> {
    if let Some((base, index)) = value.split_once('[') {
        identifier(base)?;
        let number = index.strip_suffix(']').ok_or("Invalid bus port index.")?;
        if number.is_empty() || !number.chars().all(|c| c.is_ascii_digit()) {
            return Err("Invalid bus port index.".into());
        }
        Ok(())
    } else {
        identifier(value)
    }
}

fn safe_relative(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if value.is_empty()
        || value.len() > 1024
        || value.contains('\\')
        || value.contains('\0')
        || path.is_absolute()
        || path
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err("Use a nonempty project-relative path without '..', '.', backslashes, or absolute components.".into());
    }
    if path.components().any(|c| matches!(c,std::path::Component::Normal(p) if p == ".git" || p == ".codex" || p == ".agents")) {
        return Err("Agent and Git configuration cannot be accessed through Allora tools.".into());
    }
    // HDL tool scripts interpolate names. Restrict shell/Tcl/Yosys metacharacters
    // before these names reach the existing production toolchain helpers.
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '.'))
    {
        return Err(
            "File paths may contain letters, digits, slashes, underscores, hyphens, and dots."
                .into(),
        );
    }
    Ok(path.to_path_buf())
}

fn reject_symlinks(root: &Path, path: &Path) -> Result<(), String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "Path is outside the workspace.")?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        if !matches!(component, std::path::Component::Normal(_)) {
            return Err("Invalid project path.".into());
        }
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("Allora tools cannot follow symbolic links.".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("Unable to inspect project path: {e}")),
        }
    }
    Ok(())
}

fn project_file(project: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = safe_relative(relative)?;
    let path = project.join(relative);
    reject_symlinks(project, &path)?;
    Ok(path)
}

fn bounded_read(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    let file =
        fs::File::open(path).map_err(|e| format!("Unable to read {}: {e}", path.display()))?;
    let mut bytes = Vec::new();
    file.take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Unable to read {}: {e}", path.display()))?;
    if bytes.len() > limit {
        return Err(format!(
            "{} exceeds the tool's {} byte limit.",
            path.display(),
            limit
        ));
    }
    Ok(bytes)
}

fn read_if_exists(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::symlink_metadata(path) {
        Ok(_) => bounded_read(path, MAX_FILE).map(Some),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Unable to inspect file: {e}")),
    }
}

fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn check_build_timing(timing: &TimingAnalysis) -> Result<(), String> {
    if matches!(timing.status.as_str(), "fail" | "failed") || !timing.violations.is_empty() {
        return Err(
            "Bitstream generation completed but timing failed. Fix timing before programming."
                .into(),
        );
    }
    if timing.target_frequency_mhz.is_some()
        && !matches!(timing.status.as_str(), "pass" | "no-paths")
    {
        return Err("Timing could not be verified for the mapped board clock. Resolve the timing report before programming.".into());
    }
    Ok(())
}

fn executable_path(command: &str) -> Option<PathBuf> {
    fn executable(path: &Path) -> bool {
        if !path.is_file() {
            return false;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            return fs::metadata(path)
                .ok()
                .is_some_and(|m| m.permissions().mode() & 0o111 != 0);
        }
        #[cfg(not(unix))]
        {
            true
        }
    }
    let candidate = tool_command(command);
    if candidate.components().count() > 1 {
        return executable(&candidate).then_some(candidate);
    }
    for directory in env::split_paths(&env::var_os("PATH").unwrap_or_default()) {
        let candidate = directory.join(command);
        if executable(&candidate) {
            return Some(candidate);
        }
        #[cfg(windows)]
        {
            for extension in ["exe", "cmd", "bat"] {
                let candidate = directory.join(format!("{command}.{extension}"));
                if executable(&candidate) {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

fn project_entries(project: &Path) -> Result<Vec<(String, Vec<u8>)>, String> {
    fn collect(
        project: &Path,
        current: &Path,
        entries: &mut Vec<(String, Vec<u8>)>,
        total: &mut usize,
    ) -> Result<(), String> {
        for entry in fs::read_dir(current).map_err(|e| format!("Unable to list project: {e}"))? {
            let entry = entry.map_err(|e| format!("Unable to list project: {e}"))?;
            let path = entry.path();
            let relative = path
                .strip_prefix(project)
                .map_err(|_| "Invalid project path.")?
                .to_string_lossy()
                .replace('\\', "/");
            // Generated output is excluded from source revisions; private agent
            // configuration is never sent to the model through this server.
            if matches!(
                entry.file_name().to_str(),
                Some(".git" | ".codex" | ".agents" | "node_modules" | "target")
            ) || relative == "build"
                || relative.starts_with("build/")
                || (relative.starts_with("sim/")
                    && matches!(
                        path.extension().and_then(|ext| ext.to_str()),
                        Some("vcd" | "fst" | "out" | "vvp")
                    ))
            {
                continue;
            }
            let kind = entry
                .file_type()
                .map_err(|e| format!("Unable to inspect project file: {e}"))?;
            if kind.is_symlink() {
                return Err(format!("Project contains a symbolic link: {relative}. Tools require regular project-owned files."));
            }
            safe_relative(&relative)?;
            if kind.is_dir() {
                collect(project, &path, entries, total)?;
            } else if kind.is_file() {
                if entries.len() >= MAX_FILES {
                    return Err("Project exceeds the MCP file-count limit.".into());
                }
                let bytes = bounded_read(&path, MAX_FILE)?;
                *total += bytes.len();
                if *total > MAX_SNAPSHOT {
                    return Err("Project exceeds the MCP source snapshot limit.".into());
                }
                entries.push((relative, bytes));
            }
        }
        Ok(())
    }
    let mut entries = Vec::new();
    let mut total = 0;
    collect(project, project, &mut entries, &mut total)?;
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(entries)
}

fn snapshot(entries: &[(String, Vec<u8>)]) -> String {
    let mut hash = Sha256::new();
    for (name, bytes) in entries {
        hash.update((name.len() as u64).to_le_bytes());
        hash.update(name.as_bytes());
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    }
    format!("{:x}", hash.finalize())
}

fn source_files(
    entries: &[(String, Vec<u8>)],
    excluded: Option<&str>,
) -> Result<Vec<SynthesisInputFile>, String> {
    let sources = entries
        .iter()
        .filter(|(name, _)| {
            (name.ends_with(".v") || name.ends_with(".sv"))
                && !name.starts_with("sim/")
                && !name.starts_with("test/")
                && !name.starts_with("tests/")
                && excluded != Some(name.as_str())
        })
        .map(|(name, bytes)| {
            Ok(SynthesisInputFile {
                name: name.clone(),
                content: String::from_utf8(bytes.clone())
                    .map_err(|_| "HDL source must be text.")?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    if sources.is_empty() {
        return Err("No Verilog/SystemVerilog design sources were found. Write RTL under src/ and testbenches under sim/.".into());
    }
    Ok(sources)
}

fn apply_changes(project: &Path, changes: &[FileChange]) -> Result<(), String> {
    if changes.is_empty() || changes.len() > 64 {
        return Err("A file transaction must contain 1–64 changes.".into());
    }
    let mut paths = HashSet::new();
    let mut staged = Vec::new();
    // Check every expected revision before creating directories or writing files.
    for change in changes {
        let relative = safe_relative(&change.path)?;
        if relative.starts_with("build") {
            return Err("Build artifacts cannot be edited with apply_file_changes.".into());
        }
        if change.path == "allora-project.json" && change.content.is_none() {
            return Err("The Allora project manifest cannot be deleted.".into());
        }
        let path = project_file(project, &change.path)?;
        if !paths.insert(path.clone()) {
            return Err("A transaction cannot change a file twice.".into());
        }
        let previous = read_if_exists(&path)?;
        if previous.as_deref().map(revision) != change.expected_revision {
            return Err(format!("{} changed or already exists. Read its current revision and retry; no files were changed.",change.path));
        }
        if change.content.as_ref().is_some_and(|s| s.len() > MAX_FILE) {
            return Err("A file exceeds the MCP file-size limit.".into());
        }
        if change.path == "allora-project.json" {
            let value: Value = serde_json::from_str(change.content.as_deref().unwrap())
                .map_err(|e| format!("Invalid project metadata: {e}"))?;
            if !value.is_object() {
                return Err("Project metadata must be an object.".into());
            }
        }
        staged.push((
            path,
            previous,
            change.content.as_ref().map(|s| s.as_bytes().to_vec()),
        ));
    }
    for (index, (path, previous, next)) in staged.iter().enumerate() {
        let result = (|| -> Result<(), String> {
            reject_symlinks(project, path)?;
            if read_if_exists(path)? != *previous {
                return Err("File changed during transaction.".into());
            }
            if let Some(bytes) = next {
                let parent = path.parent().ok_or("Invalid file path.")?;
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Unable to create project folder: {e}"))?;
                let mut temporary = tempfile::NamedTempFile::new_in(parent)
                    .map_err(|e| format!("Unable to stage file: {e}"))?;
                temporary
                    .write_all(bytes)
                    .map_err(|e| format!("Unable to stage file: {e}"))?;
                temporary
                    .persist(path)
                    .map_err(|e| format!("Unable to commit file: {}", e.error))?;
            } else if previous.is_some() {
                fs::remove_file(path).map_err(|e| format!("Unable to delete file: {e}"))?;
            }
            Ok(())
        })();
        if let Err(e) = result {
            let mut recovery = Vec::new();
            for (path, previous, _) in staged[..index].iter().rev() {
                let restored = if let Some(bytes) = previous {
                    fs::write(path, bytes)
                } else {
                    fs::remove_file(path)
                };
                if let Err(e) = restored {
                    recovery.push(format!("{}: {e}", path.display()));
                }
            }
            return Err(if recovery.is_empty() {
                format!("Unable to save files: {e}. Previous files restored.")
            } else {
                format!(
                    "Unable to save files: {e}. Recovery required: {}",
                    recovery.join("; ")
                )
            });
        }
    }
    Ok(())
}

fn verified_constraints(board: &Board, assignments: &[Assignment]) -> Result<String, String> {
    if assignments.is_empty() || assignments.len() > 512 {
        return Err("Supply 1–512 pin assignments.".into());
    }
    if !matches!(board.constraints_file.as_str(), "pcf" | "lpf") {
        return Err(
            "Verified MCP constraint generation currently supports PCF and LPF boards.".into(),
        );
    }
    let mut ports = HashSet::new();
    let mut physical = HashSet::new();
    let mut lines = vec![format!("# Allora verified pin assignments: {}", board.name)];
    for assignment in assignments {
        port_identifier(&assignment.port)?;
        if !ports.insert(&assignment.port) {
            return Err(format!("Duplicate port '{}'.", assignment.port));
        }
        let pin = board
            .pins
            .iter()
            .chain(board.leds.iter())
            .chain(board.buttons.iter())
            .find(|p| p.name == assignment.board_pin);
        let clock = board.clocks.iter().find(|c| c.name == assignment.board_pin);
        let (package_pin, io_standard, verified, reserved) = if let Some(pin) = pin {
            (
                Some(pin.pin.as_str()),
                pin.io_standard.as_deref(),
                pin.verified,
                pin.kind == "flash",
            )
        } else if let Some(clock) = clock {
            (
                clock.pin.as_deref(),
                clock.io_standard.as_deref(),
                clock.verified,
                false,
            )
        } else {
            return Err(format!("Unknown board pin '{}'. Retrieve get_board_definition and use its exact pin/clock name.",assignment.board_pin));
        };
        if !verified {
            return Err(format!(
                "{} is not verified in Allora's board catalog.",
                assignment.board_pin
            ));
        }
        if reserved {
            return Err(format!(
                "{} belongs to the onboard programming flash and is reserved.",
                assignment.board_pin
            ));
        }
        let package_pin=package_pin.ok_or("Internal oscillators do not have an external package pin. Instantiate the documented oscillator primitive in RTL.")?;
        if package_pin.is_empty() || !package_pin.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err("Board catalog contains an invalid package pin.".into());
        }
        if !physical.insert(package_pin.to_string()) {
            return Err(format!(
                "Package pin {package_pin} is assigned more than once."
            ));
        }
        if board.constraints_file == "pcf" {
            lines.push(format!("set_io {} {}", assignment.port, package_pin));
        } else {
            lines.push(format!(
                "LOCATE COMP \"{}\" SITE \"{}\";",
                assignment.port, package_pin
            ));
            let standard = io_standard.unwrap_or("LVCMOS33");
            if !standard
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_')
            {
                return Err("Invalid IO standard in board catalog.".into());
            }
            lines.push(format!(
                "IOBUF PORT \"{}\" IO_TYPE={};",
                assignment.port, standard
            ));
        }
    }
    Ok(format!("{}\n", lines.join("\n")))
}

fn tool(
    name: &str,
    description: &str,
    properties: Value,
    required: &[&str],
    read_only: bool,
) -> Value {
    json!({"name":name,"description":description,
        "inputSchema":{"type":"object","properties":properties,"required":required,"additionalProperties":false},
        "annotations":{"readOnlyHint":read_only,"destructiveHint":name=="program_board"||name=="apply_file_changes",
            "idempotentHint":read_only,"openWorldHint":name=="detect_hardware"||name=="program_board"}})
}

fn tool_definitions() -> Vec<Value> {
    let text = json!({"type":"string"});
    let project = json!({"type":"string","description":"Absolute project path returned by create_project, within the selected workspace."});
    let assignment = json!({"type":"object","properties":{"port":{"type":"string"},"boardPin":{"type":"string","description":"Exact verified board pin or clock name from get_board_definition."}},"required":["port","boardPin"],"additionalProperties":false});
    vec![
        tool("list_supported_boards","Find Allora board IDs and local build support. Use the named board requested by the user; choose an alternative only with user agreement.",json!({"query":text}),&[],true),
        tool("get_board_definition","Read authoritative FPGA, package, clocks (Hz), pin names, LED polarity and programmer. Never invent hardware pins, clock frequencies or device identities.",json!({"boardId":text}),&["boardId"],true),
        tool("get_toolchain_status","Probe installed simulation/build/programmer tools for the chosen board. Report missing dependencies to the user.",json!({"boardId":text}),&[],true),
        tool("detect_hardware","Inspect USB candidate boards and programmer availability. Discovery does not verify the exact hardware target.",json!({"boardId":text}),&["boardId"],true),
        tool("get_project_context","Without projectPath, discover the selected workspace and its projects. With projectPath, read saved metadata, file list/revisions and source snapshot. Use this before changing or building a project.",json!({"projectPath":project}),&[],true),
        tool("read_file","Read a project text file and its SHA-256 revision. A missing file returns revision:null, required to create it with apply_file_changes.",json!({"projectPath":project,"path":text}),&["projectPath","path"],true),
        tool("create_project","Create an empty Allora project in the selected workspace with verified target metadata. Then write RTL under src/ and testbenches under sim/.",json!({"name":text,"boardId":text,"topModule":text}),&["name","boardId"],false),
        tool("apply_file_changes","Apply a checked transaction of project text changes. Always read existing files first; expectedRevision must match read_file. Null expectedRevision requires absence; null content deletes a file. Keep board constraints generated by set_pin_assignments.",json!({"projectPath":project,"changes":{"type":"array","minItems":1,"maxItems":64,"items":{"type":"object","properties":{"path":text,"content":{"type":["string","null"]},"expectedRevision":{"type":["string","null"]}},"required":["path","content","expectedRevision"],"additionalProperties":false}}}),&["projectPath","changes"],false),
        tool("configure_project","Set project target, top module, source filename or testbench module. Switching board invalidates pin assignments and prior artifacts.",json!({"projectPath":project,"boardId":text,"topModule":text,"sourceFile":text,"testbench":text}),&["projectPath"],false),
        tool("set_pin_assignments","Generate and save verified PCF/LPF constraints from board pin names. Include all top-level ports. Honors verified pins and rejects duplicates and reserved flash pins.",json!({"projectPath":project,"assignments":{"type":"array","items":assignment}}),&["projectPath","assignments"],false),
        tool("validate_pin_assignments","Validate supplied or saved pin assignments against the authoritative board catalog without writing files.",json!({"projectPath":project,"assignments":{"type":"array","items":assignment}}),&["projectPath"],true),
        tool("lint_hdl","Run Allora's production Icarus HDL lint on saved design sources; testbenches under sim/ are excluded.",json!({"projectPath":project}),&["projectPath"],true),
        tool("simulate_testbench","Start Allora's production Icarus simulation using saved design and a testbench with a finite finish. Returns a job ID; poll get_job_result until terminal status and inspect waveform/logs.",json!({"projectPath":project,"testbenchPath":text,"topModule":text}),&["projectPath","testbenchPath"],false),
        tool("build_bitstream","Start synthesis, NextPNR place/route, timing analysis and packing with verified board settings. Pin assignments must be generated first. Returns a job ID; only a successful nonstale build yields a programmable artifact ID.",json!({"projectPath":project}),&["projectPath"],false),
        tool("get_job_status","Read bounded live job logs and status. Terminal statuses are succeeded, failed, cancelled.",json!({"jobId":text}),&["jobId"],true),
        tool("get_job_result","Read job status, bounded logs, errors and structured results including waveform or bitstream artifact ID. Wait for succeeded before proceeding to programming.",json!({"jobId":text}),&["jobId"],true),
        tool("cancel_job","Cancel an active simulation/build/programming subprocess; returns cancelling until process termination is observed.",json!({"jobId":text}),&["jobId"],false),
        tool("cancel_all_jobs","Cancel all active subprocess jobs and pending hardware confirmation in this chat session. The chat host calls this when Stop is pressed or the session closes.",json!({}),&[],false),
        tool("program_board","Program one user-confirmed iCE40/ECP5 target using a fresh, unchanged artifact from this session. A real in-chat form confirmation is required and cannot be supplied in tool arguments. Disconnect other compatible boards. Successful upload does not verify physical behavior.",json!({"projectPath":project,"artifactId":text}),&["projectPath","artifactId"],false),
    ]
}

/// Run the local stdio MCP mode without starting Tauri.
pub fn run_stdio() -> Result<(), String> {
    let server = Server::from_environment()?;
    let stdin = io::stdin();
    let mut input = stdin.lock();
    loop {
        let mut bytes = Vec::new();
        let count = input
            .by_ref()
            .take((MAX_MESSAGE + 1) as u64)
            .read_until(b'\n', &mut bytes)
            .map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        if bytes.len() > MAX_MESSAGE || bytes.last() != Some(&b'\n') {
            server.error(
                Value::Null,
                -32700,
                "MCP message exceeds the size limit or is not newline-delimited.",
            );
            break;
        }
        let value: Value = match serde_json::from_slice(&bytes) {
            Ok(value) => value,
            Err(_) => {
                server.error(Value::Null, -32700, "Invalid JSON.");
                continue;
            }
        };
        if value.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
            server.error(
                value.get("id").cloned().unwrap_or(Value::Null),
                -32600,
                "Expected JSON-RPC 2.0.",
            );
            continue;
        }
        if value.get("method").is_none() {
            if let Some(id) = value.get("id").and_then(Value::as_str) {
                if let Ok(mut pending) = server.pending.lock() {
                    if let Some(send) = pending.remove(id) {
                        let _ = send.send(value.clone());
                    }
                }
            }
            continue;
        }
        let method = value.get("method").and_then(Value::as_str).unwrap_or("");
        let Some(id) = value.get("id").cloned() else {
            continue;
        };
        let params = value.get("params").cloned().unwrap_or_else(|| json!({}));
        match method {
            "initialize" => {
                let version = params
                    .get("protocolVersion")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let chosen = if matches!(
                    version,
                    "2024-11-05" | "2025-03-26" | "2025-06-18" | "2025-11-25"
                ) {
                    version
                } else {
                    "2025-06-18"
                };
                server.elicitation.store(
                    params.pointer("/capabilities/elicitation").is_some(),
                    Ordering::Release,
                );
                server.initialized.store(true, Ordering::Release);
                server.result(id,json!({"protocolVersion":chosen,"capabilities":{"tools":{"listChanged":false}},
                    "serverInfo":{"name":"allora","version":env!("CARGO_PKG_VERSION")},
                    "instructions":"Allora is an FPGA design application. For an end-to-end task: discover board metadata and local tools; create or inspect a project; write Verilog/SystemVerilog RTL and a finite testbench; use verified board pins and clock Hz/polarity; save constraints with set_pin_assignments; lint, simulate, and inspect results; build and inspect timing; program only a fresh artifact after the user's hardware confirmation. All paths are restricted to the selected workspace. Put design sources under src/ and testbenches under sim/. Builds/simulation/programming return job IDs: poll get_job_result until terminal status; do not claim success from job creation. USB discovery is only suggestive and cannot verify exact physical targets. Never claim observed LED behavior from programmer output. Unsupported proprietary flows must be reported accurately."}));
            }
            "ping" => server.result(id, json!({})),
            _ if !server.initialized.load(Ordering::Acquire) => {
                server.error(id, -32002, "Initialize the MCP server first.")
            }
            "tools/list" => server.result(id, json!({"tools":tool_definitions()})),
            "tools/call" => {
                let Some(name) = params.get("name").and_then(Value::as_str) else {
                    server.error(id, -32602, "Missing tool name.");
                    continue;
                };
                let name = name.to_string();
                let args = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                let definition = tool_definitions().into_iter().find(|t| t["name"] == name);
                let Some(definition) = definition else {
                    server.error(id, -32602, "Unknown Allora tool.");
                    continue;
                };
                if let Err(e) = validate_arguments(&args, &definition["inputSchema"]) {
                    server.error(id, -32602, &e);
                    continue;
                }
                if server.active_calls.fetch_add(1, Ordering::AcqRel) >= 16 {
                    server.active_calls.fetch_sub(1, Ordering::AcqRel);
                    server.error(id, -32000, "Too many concurrent Allora tool calls.");
                    continue;
                }
                let server = server.clone();
                thread::spawn(move || {
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        server.call(&name, &args)
                    }))
                    .unwrap_or_else(|_| Err("Allora tool stopped unexpectedly.".into()));
                    match result {
                        Ok(value)=>server.result(id,json!({"content":[{"type":"text","text":value.to_string()}],"structuredContent":value,"isError":false})),
                        Err(error)=>server.result(id,json!({"content":[{"type":"text","text":error}],"isError":true})),
                    }
                    server.active_calls.fetch_sub(1, Ordering::AcqRel);
                });
            }
            _ => server.error(id, -32601, "MCP method is not supported by Allora."),
        }
    }
    if let Ok(jobs) = server.jobs.lock() {
        for job in jobs.values() {
            if let Ok(job) = job.lock() {
                job.cancellation.store(true, Ordering::Release);
            }
        }
    }
    if let Ok(mut pending) = server.pending.lock() {
        pending.clear();
    }
    // Give cancellable production subprocesses a chance to terminate on EOF.
    for _ in 0..30 {
        let active = server.jobs.lock().ok().is_some_and(|jobs| {
            jobs.values().any(|job| {
                job.lock()
                    .ok()
                    .is_some_and(|j| matches!(j.status.as_str(), "running" | "cancelling"))
            })
        });
        if !active {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    Ok(())
}

fn validate_arguments(args: &Value, schema: &Value) -> Result<(), String> {
    fn validate(value: &Value, schema: &Value, path: &str) -> Result<(), String> {
        let allowed = if let Some(kind) = schema["type"].as_str() {
            vec![kind]
        } else if let Some(types) = schema["type"].as_array() {
            types.iter().filter_map(Value::as_str).collect()
        } else {
            Vec::new()
        };
        let matches = allowed.iter().any(|kind| match *kind {
            "object" => value.is_object(),
            "array" => value.is_array(),
            "string" => value.is_string(),
            "boolean" => value.is_boolean(),
            "null" => value.is_null(),
            "number" => value.is_number(),
            _ => false,
        });
        if !allowed.is_empty() && !matches {
            return Err(format!("Invalid type for tool argument '{path}'."));
        }
        if let Some(object) = value.as_object() {
            let properties = schema["properties"]
                .as_object()
                .ok_or("Invalid tool schema.")?;
            for key in object.keys() {
                if !properties.contains_key(key) {
                    return Err(format!("Unknown tool argument '{path}.{key}'."));
                }
            }
            if let Some(required) = schema["required"].as_array() {
                for key in required.iter().filter_map(Value::as_str) {
                    if !object.contains_key(key) {
                        return Err(format!("Missing tool argument '{path}.{key}'."));
                    }
                }
            }
            for (key, entry) in object {
                validate(entry, &properties[key], &format!("{path}.{key}"))?;
            }
        }
        if let Some(array) = value.as_array() {
            if schema["minItems"]
                .as_u64()
                .is_some_and(|min| array.len() < (min as usize))
                || schema["maxItems"]
                    .as_u64()
                    .is_some_and(|max| array.len() > (max as usize))
            {
                return Err(format!("Invalid item count for tool argument '{path}'."));
            }
            for (index, entry) in array.iter().enumerate() {
                validate(entry, &schema["items"], &format!("{path}[{index}]"))?;
            }
        }
        Ok(())
    }
    validate(args, schema, "arguments")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        fs::write(
            root.path().join("allora-project.json"),
            r#"{"name":"Blink","boardId":"icebreaker","topModule":"top"}"#,
        )
        .unwrap();
        root
    }

    fn board() -> Board {
        serde_json::from_value(json!({"id":"icebreaker","name":"iCEBreaker","family":"iCE40 UltraPlus",
            "package":"SG48","fpgaId":"ice40up5k-sg48","synthesisFlow":"yosys-nextpnr","constraintsFile":"pcf",
            "toolchain":{"synth":"yosys","program":"iceprog"},"clocks":[{"name":"clk12","pin":"35","frequency":12000000,"verified":true}],
            "pins":[{"name":"led","pin":"39","type":"led","verified":true,"activeLow":true},
                {"name":"unverified","pin":"40","type":"gpio","verified":false},
                {"name":"flash","pin":"14","type":"flash","verified":true}]})).unwrap()
    }

    fn server(root: &Path) -> Arc<Server> {
        Arc::new(Server {
            workspace: fs::canonicalize(root).unwrap(),
            boards: BTreeMap::from([("icebreaker".into(), board())]),
            writer: Mutex::new(io::stdout()),
            initialized: AtomicBool::new(true),
            elicitation: AtomicBool::new(false),
            active_calls: AtomicU32::new(0),
            next_id: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
            mutations: Mutex::new(()),
            jobs: Mutex::new(BTreeMap::new()),
            artifacts: Mutex::new(BTreeMap::new()),
        })
    }

    #[test]
    fn conflicts_are_checked_before_any_file_changes() {
        let root = project();
        fs::write(root.path().join("top.sv"), "old").unwrap();
        let changes = vec![
            FileChange {
                path: "new.sv".into(),
                content: Some("new".into()),
                expected_revision: None,
            },
            FileChange {
                path: "top.sv".into(),
                content: Some("changed".into()),
                expected_revision: Some(revision(b"wrong")),
            },
        ];
        assert!(apply_changes(root.path(), &changes)
            .unwrap_err()
            .contains("no files were changed"));
        assert!(!root.path().join("new.sv").exists());
        assert_eq!(
            fs::read_to_string(root.path().join("top.sv")).unwrap(),
            "old"
        );
    }

    #[test]
    fn verified_pins_reject_unverified_reserved_and_duplicate_targets() {
        let board = board();
        let assign = |port: &str, name: &str| Assignment {
            port: port.into(),
            board_pin: name.into(),
        };
        assert_eq!(
            verified_constraints(&board, &[assign("clk", "clk12"), assign("led_n", "led")])
                .unwrap(),
            "# Allora verified pin assignments: iCEBreaker\nset_io clk 35\nset_io led_n 39\n"
        );
        assert!(verified_constraints(&board, &[assign("x", "unverified")]).is_err());
        assert!(verified_constraints(&board, &[assign("x", "flash")]).is_err());
        assert!(verified_constraints(&board, &[assign("a", "led"), assign("b", "led")]).is_err());
        assert!(verified_constraints(&board, &[assign("x; quit", "led")]).is_err());
    }

    #[test]
    fn source_revision_ignores_build_outputs_and_tracks_edits() {
        let root = project();
        fs::create_dir(root.path().join("src")).unwrap();
        fs::write(root.path().join("src/top.sv"), "old").unwrap();
        let original = snapshot(&project_entries(root.path()).unwrap());
        fs::create_dir(root.path().join("build")).unwrap();
        fs::write(root.path().join("build/output.bin"), [1, 2, 3]).unwrap();
        assert_eq!(original, snapshot(&project_entries(root.path()).unwrap()));
        fs::write(root.path().join("src/top.sv"), "new").unwrap();
        assert_ne!(original, snapshot(&project_entries(root.path()).unwrap()));
    }

    #[test]
    fn scoped_paths_reject_escape_and_tool_script_injection() {
        for path in [
            "../outside",
            "/outside",
            "src/../outside",
            "src/top.sv; quit",
            ".codex/config.toml",
            "src\\outside",
        ] {
            assert!(safe_relative(path).is_err(), "{path}");
        }
        assert!(safe_relative("src/top.sv").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn project_files_cannot_follow_symlinks() {
        let root = project();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("src")).unwrap();
        assert!(project_file(root.path(), "src/top.sv").is_err());
        assert!(project_entries(root.path()).is_err());
    }

    #[test]
    fn programming_tool_has_no_model_supplied_authorization() {
        let definition = tool_definitions()
            .into_iter()
            .find(|t| t["name"] == "program_board")
            .unwrap();
        assert!(validate_arguments(
            &json!({"projectPath":"p","artifactId":"a","approved":true}),
            &definition["inputSchema"]
        )
        .is_err());
        assert!(validate_arguments(
            &json!({"projectPath":"p","artifactId":"a"}),
            &definition["inputSchema"]
        )
        .is_ok());
    }

    #[test]
    fn changed_sources_board_or_artifact_cannot_be_programmed() {
        let root = project();
        let server = server(root.path());
        let canonical = server.workspace.clone();
        fs::write(canonical.join("top.sv"), "module top; endmodule").unwrap();
        fs::create_dir(canonical.join("build")).unwrap();
        let path = canonical.join("build/blink.bin");
        fs::write(&path, [1, 2, 3]).unwrap();
        let artifact = Artifact {
            project: canonical.clone(),
            board_id: "icebreaker".into(),
            path: path.clone(),
            hash: revision(&[1, 2, 3]),
            snapshot: snapshot(&project_entries(&canonical).unwrap()),
        };
        assert!(server.validate_artifact(&artifact).is_ok());
        fs::write(&path, [3, 2, 1]).unwrap();
        assert!(server
            .validate_artifact(&artifact)
            .unwrap_err()
            .contains("Artifact changed"));
        fs::write(&path, [1, 2, 3]).unwrap();
        fs::write(canonical.join("top.sv"), "module changed; endmodule").unwrap();
        assert!(server
            .validate_artifact(&artifact)
            .unwrap_err()
            .contains("stale"));
        fs::write(
            canonical.join("allora-project.json"),
            r#"{"name":"Blink","boardId":"other","topModule":"top"}"#,
        )
        .unwrap();
        assert!(server.validate_artifact(&artifact).is_err());
    }

    #[test]
    fn programming_fails_closed_without_a_user_approval_channel() {
        let root = project();
        let server = server(root.path());
        let result = server.call(
            "program_board",
            &json!({"projectPath":root.path(),"artifactId":"imaginary"}),
        );
        assert!(result
            .unwrap_err()
            .contains("cannot request user confirmation"));
        assert!(server.jobs.lock().unwrap().is_empty());
    }

    #[test]
    fn nested_changes_require_explicit_revision_and_content() {
        let definition = tool_definitions()
            .into_iter()
            .find(|t| t["name"] == "apply_file_changes")
            .unwrap();
        let schema = &definition["inputSchema"];
        assert!(validate_arguments(
            &json!({"projectPath":"p","changes":[{"path":"src/top.sv"}]}),
            schema
        )
        .is_err());
        assert!(validate_arguments(&json!({"projectPath":"p","changes":[{"path":"src/top.sv","content":"RTL","expectedRevision":null}]}),schema).is_ok());
    }

    #[test]
    fn failed_or_missing_clock_timing_never_yields_a_programmable_artifact() {
        let failed = parse_nextpnr_timing_report(
            &json!({"fmax":{"clk":{"achieved":10.0,"constraint":12.0}}}),
            "ice40up5k",
            Some("clk"),
            Some(12.0),
        );
        assert_eq!(failed.status, "fail");
        assert!(check_build_timing(&failed).is_err());
        let passed = parse_nextpnr_timing_report(
            &json!({"fmax":{"clk":{"achieved":24.0,"constraint":12.0}}}),
            "ice40up5k",
            Some("clk"),
            Some(12.0),
        );
        assert!(check_build_timing(&passed).is_ok());
        let missing = unavailable_timing(
            "ice40up5k",
            Some("clk".into()),
            Some(12.0),
            "No timing report".into(),
        );
        assert!(check_build_timing(&missing).is_err());
    }

    #[test]
    fn cancelling_after_artifact_registration_removes_programming_access() {
        let root = project();
        let server = server(root.path());
        let project = server.workspace.clone();
        fs::create_dir(project.join("build")).unwrap();
        let path = project.join("build/test.bin");
        fs::write(&path, [1, 2, 3]).unwrap();
        let artifact = Artifact {
            project: project.clone(),
            board_id: "icebreaker".into(),
            path: path.clone(),
            hash: revision(&[1, 2, 3]),
            snapshot: snapshot(&project_entries(&project).unwrap()),
        };
        let task_server = server.clone();
        let (ready_send, ready_receive) = mpsc::channel();
        let (finish_send, finish_receive) = mpsc::channel();
        let started = server
            .start_job("build", &project, move |_| {
                task_server
                    .artifacts
                    .lock()
                    .unwrap()
                    .insert("test-artifact".into(), artifact);
                ready_send.send(()).unwrap();
                finish_receive.recv_timeout(Duration::from_secs(2)).unwrap();
                Ok(json!({"artifactId":"test-artifact"}))
            })
            .unwrap();
        ready_receive.recv_timeout(Duration::from_secs(2)).unwrap();
        server
            .call("cancel_job", &json!({"jobId":started["jobId"]}))
            .unwrap();
        finish_send.send(()).unwrap();
        let started_at = std::time::Instant::now();
        loop {
            let status = server
                .call("get_job_status", &json!({"jobId":started["jobId"]}))
                .unwrap();
            if status["status"] == "cancelled" {
                break;
            }
            assert!(started_at.elapsed() < Duration::from_secs(2));
            thread::sleep(Duration::from_millis(5));
        }
        assert!(server.artifacts.lock().unwrap().is_empty());
        assert!(!path.exists());
    }
}
