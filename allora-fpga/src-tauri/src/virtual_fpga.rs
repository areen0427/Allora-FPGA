use crate::{copy_generated_memories, error, tool_command, ErrorPayload};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSourceFile {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverPortsRequest {
    pub source_files: Vec<SimulationSourceFile>,
    pub top_module: String,
    pub project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RtlPort {
    pub name: String,
    pub direction: String,
    pub width: usize,
    pub offset: i64,
    pub upto: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationToolsResponse {
    pub yosys: ToolAvailability,
    pub verilator: ToolAvailability,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAvailability {
    pub available: bool,
    pub path: Option<String>,
    pub install_hint: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSimulationRequest {
    pub source_files: Vec<SimulationSourceFile>,
    pub top_module: String,
    pub clock_signal: Option<String>,
    pub clock_frequency_hz: u64,
    pub enable_vcd: Option<bool>,
    pub project_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSimulationResponse {
    pub session_id: u32,
    pub ports: Vec<RtlPort>,
    pub state: SimulationSnapshot,
    pub logs: Vec<String>,
    pub waveform_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSnapshot {
    pub sim_time_ps: u64,
    pub values: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationStepResponse {
    pub state: SimulationSnapshot,
    pub trace: Vec<SimulationSnapshot>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HarnessTracePoint {
    tick: u64,
    values: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetInputRequest {
    pub session_id: u32,
    pub signal: String,
    pub value: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepSimulationRequest {
    pub session_id: u32,
    pub cycles: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetSimulationRequest {
    pub session_id: u32,
    pub reset_signal: Option<String>,
    pub active_high: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopSimulationRequest {
    pub session_id: u32,
}

struct VirtualFpgaSession {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    workspace: PathBuf,
    clock_signal: Option<String>,
    clock_frequency_hz: u64,
    sim_time_ps: u64,
    input_ports: HashMap<String, usize>,
    waveform_path: Option<String>,
}

impl Drop for VirtualFpgaSession {
    fn drop(&mut self) {
        let _ = writeln!(self.stdin, "QUIT");
        let _ = self.stdin.flush();
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = fs::remove_dir_all(&self.workspace);
    }
}

#[derive(Default, Clone)]
pub struct VirtualFpgaState {
    sessions: Arc<Mutex<HashMap<u32, VirtualFpgaSession>>>,
    next_id: Arc<AtomicU32>,
}

#[tauri::command]
pub fn detect_simulation_tools() -> SimulationToolsResponse {
    SimulationToolsResponse {
        yosys: availability(
            "yosys",
            "Install Yosys or OSS CAD Suite to discover RTL ports.",
        ),
        verilator: availability(
            "verilator",
            "Install Verilator (brew install verilator, apt install verilator, or OSS CAD Suite).",
        ),
    }
}

#[tauri::command]
pub async fn discover_rtl_ports(
    request: DiscoverPortsRequest,
) -> Result<Vec<RtlPort>, ErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || {
        discover_ports_with_project(
            &request.source_files,
            &request.top_module,
            request.project_path.as_deref(),
        )
    })
    .await
    .map_err(|err| error(&format!("Port discovery task failed: {err}")))?
}

#[tauri::command]
pub async fn start_virtual_simulation(
    request: StartSimulationRequest,
    state: tauri::State<'_, VirtualFpgaState>,
) -> Result<StartSimulationResponse, ErrorPayload> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || start_simulation(request, &state))
        .await
        .map_err(|err| error(&format!("Simulation compiler task failed: {err}")))?
}

fn start_simulation(
    request: StartSimulationRequest,
    state: &VirtualFpgaState,
) -> Result<StartSimulationResponse, ErrorPayload> {
    validate_identifier(&request.top_module, "top module")?;
    if request.source_files.is_empty() {
        return Err(error(
            "No Verilog/SystemVerilog source files were provided.",
        ));
    }
    if request
        .source_files
        .iter()
        .any(|file| file.name.ends_with(".vhd") || file.name.ends_with(".vhdl"))
    {
        return Err(error(
            "Virtual FPGA V0.1 supports Verilog and SystemVerilog. VHDL interactive simulation is not available yet.",
        ));
    }

    let ports = discover_ports_with_project(
        &request.source_files,
        &request.top_module,
        request.project_path.as_deref(),
    )?;
    validate_ports(&ports)?;
    if let Some(clock) = request.clock_signal.as_deref() {
        validate_input_mapping(&ports, clock)?;
    }
    let frequency = request.clock_frequency_hz.clamp(1, 1_000_000_000);
    let workspace = simulation_work_dir("virtual_fpga")?;
    let source_paths = write_sources(&workspace, &request.source_files)?;
    if let Some(project_path) = &request.project_path {
        copy_generated_memories(Path::new(project_path), &workspace)?;
    }
    let harness_path = workspace.join("allora_harness.cpp");
    let vcd_path = request.enable_vcd.unwrap_or(true).then(|| {
        request
            .project_path
            .as_ref()
            .map(|root| PathBuf::from(root).join("sim/virtual-fpga.vcd"))
            .unwrap_or_else(|| workspace.join("virtual-fpga.vcd"))
    });
    if let Some(path) = &vcd_path {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| error(&format!("Unable to create waveform directory: {err}")))?;
        }
    }
    fs::write(
        &harness_path,
        generate_harness(
            &request.top_module,
            &ports,
            vcd_path.as_deref(),
            1_000_000_000_000 / frequency,
        ),
    )
    .map_err(|err| error(&format!("Unable to write the Verilator harness: {err}")))?;

    let object_dir = workspace.join("obj_dir");
    let mut args = vec![
        "--cc".to_string(),
        "--exe".to_string(),
        "--build".to_string(),
        "--trace".to_string(),
        "-Wno-fatal".to_string(),
        "--top-module".to_string(),
        request.top_module.clone(),
        "--Mdir".to_string(),
        object_dir.to_string_lossy().to_string(),
        "-CFLAGS".to_string(),
        "-std=c++17".to_string(),
        harness_path.to_string_lossy().to_string(),
    ];
    args.extend(
        source_paths
            .iter()
            .map(|path| path.to_string_lossy().to_string()),
    );
    let output = Command::new(tool_command("verilator"))
        .args(&args)
        .current_dir(&workspace)
        .output()
        .map_err(|err| {
            let _ = fs::remove_dir_all(&workspace);
            error(&format!(
                "Unable to launch Verilator: {err}. Install Verilator or OSS CAD Suite and try again."
            ))
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        let _ = fs::remove_dir_all(&workspace);
        return Err(error(&format!(
            "Verilator compilation failed.\n{}",
            concise_command_output(&stdout, &stderr)
        )));
    }

    let executable = object_dir.join(format!("V{}", request.top_module));
    let mut child = Command::new(&executable)
        .current_dir(&workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|err| {
            let _ = fs::remove_dir_all(&workspace);
            error(&format!("Unable to start the compiled simulation: {err}"))
        })?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| error("Simulator input pipe is unavailable."))?;
    let stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| error("Simulator output pipe is unavailable."))?;
    let input_ports = ports
        .iter()
        .filter(|port| port.direction == "input")
        .map(|port| (port.name.clone(), port.width))
        .collect();
    let waveform_path = vcd_path.map(|path| path.to_string_lossy().to_string());
    let mut session = VirtualFpgaSession {
        child,
        stdin,
        stdout: BufReader::new(stdout_pipe),
        workspace,
        clock_signal: request.clock_signal,
        clock_frequency_hz: frequency,
        sim_time_ps: 0,
        input_ports,
        waveform_path: waveform_path.clone(),
    };
    let snapshot = exchange(&mut session, "STATE")?;
    let session_id = state.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    state
        .sessions
        .lock()
        .map_err(|_| error("Virtual FPGA session state is unavailable."))?
        .insert(session_id, session);

    let mut logs = vec![format!(
        "[verilator] Compiled top module {}",
        request.top_module
    )];
    if !stdout.trim().is_empty() {
        logs.extend(stdout.lines().map(str::to_string));
    }
    Ok(StartSimulationResponse {
        session_id,
        ports,
        state: snapshot,
        logs,
        waveform_path,
    })
}

/// Compile with the same engine as Compile & Start, exercise saved input mappings,
/// and release the child when verification completes. GUI sessions are independent.
pub(crate) fn verify_saved_simulation(
    request: StartSimulationRequest,
    inputs: Vec<(String, u64)>,
    cycles: u32,
) -> Result<Value, ErrorPayload> {
    let state = VirtualFpgaState::default();
    let result = start_simulation(request, &state)?;
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| error("Simulator state unavailable."))?;
    let session = sessions
        .get_mut(&result.session_id)
        .ok_or_else(|| error("Simulator session missing."))?;
    for (signal, value) in inputs {
        set_input_value(session, &signal, &Value::from(value))?;
    }
    let stepped = step_session_with_trace(session, cycles.clamp(1, 1000))?;
    let report = serde_json::json!({"compiled":true,"ports":result.ports,"logs":result.logs,
        "state":stepped.state,"cycles":cycles.clamp(1, 1000),
        "note":"Verified with the interactive Verilator engine. The verification session is closed; Allora starts a fresh session when this saved configuration is opened."});
    sessions.remove(&result.session_id);
    Ok(report)
}

#[tauri::command]
pub fn set_virtual_simulation_input(
    request: SetInputRequest,
    state: tauri::State<'_, VirtualFpgaState>,
) -> Result<SimulationSnapshot, ErrorPayload> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| error("Virtual FPGA session state is unavailable."))?;
    let session = sessions
        .get_mut(&request.session_id)
        .ok_or_else(|| error("The Virtual FPGA simulation is no longer running."))?;
    set_input_value(session, &request.signal, &request.value)
}

fn set_input_value(
    session: &mut VirtualFpgaSession,
    signal: &str,
    raw: &Value,
) -> Result<SimulationSnapshot, ErrorPayload> {
    let width = *session
        .input_ports
        .get(signal)
        .ok_or_else(|| error("The mapped signal is not an input port."))?;
    let value = raw
        .as_u64()
        .or_else(|| raw.as_str().and_then(|s| s.parse::<u64>().ok()))
        .ok_or_else(|| error("Input must be an unsigned 64-bit integer."))?;
    if width < 64 && value >= (1u64 << width) {
        return Err(error("The input value does not fit the signal width."));
    }
    exchange(session, &format!("SET {signal} {value}"))
}

#[tauri::command]
pub fn step_virtual_simulation(
    request: StepSimulationRequest,
    state: tauri::State<'_, VirtualFpgaState>,
) -> Result<SimulationStepResponse, ErrorPayload> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| error("Virtual FPGA session state is unavailable."))?;
    let session = sessions
        .get_mut(&request.session_id)
        .ok_or_else(|| error("The Virtual FPGA simulation is no longer running."))?;
    step_session_with_trace(session, request.cycles.max(1).min(100_000))
}

#[tauri::command]
pub fn reset_virtual_simulation(
    request: ResetSimulationRequest,
    state: tauri::State<'_, VirtualFpgaState>,
) -> Result<SimulationStepResponse, ErrorPayload> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| error("Virtual FPGA session state is unavailable."))?;
    let session = sessions
        .get_mut(&request.session_id)
        .ok_or_else(|| error("The Virtual FPGA simulation is no longer running."))?;
    for signal in session.input_ports.keys().cloned().collect::<Vec<_>>() {
        exchange(session, &format!("SET {signal} 0"))?;
    }
    session.sim_time_ps = 0;
    let mut trace = Vec::new();
    if let Some(reset) = request.reset_signal {
        if session.input_ports.contains_key(&reset) {
            let active = if request.active_high.unwrap_or(true) {
                1
            } else {
                0
            };
            let inactive = 1 - active;
            let mut active_state = exchange(session, &format!("SET {reset} {active}"))?;
            active_state.sim_time_ps = 0;
            trace.push(active_state);
            let reset_cycles = step_session_with_trace(session, 2)?;
            trace.extend(reset_cycles.trace);
            let mut inactive_state = exchange(session, &format!("SET {reset} {inactive}"))?;
            inactive_state.sim_time_ps = session.sim_time_ps;
            trace.push(inactive_state);
        }
    }
    session.sim_time_ps = 0;
    let mut snapshot = exchange(session, "STATE")?;
    snapshot.sim_time_ps = 0;
    if trace.is_empty() {
        trace.push(snapshot.clone());
    }
    Ok(SimulationStepResponse {
        state: snapshot,
        trace,
    })
}

#[tauri::command]
pub fn stop_virtual_simulation(
    request: StopSimulationRequest,
    state: tauri::State<'_, VirtualFpgaState>,
) -> Result<Option<String>, ErrorPayload> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| error("Virtual FPGA session state is unavailable."))?
        .remove(&request.session_id);
    Ok(session.and_then(|session| session.waveform_path.clone()))
}

// Random, atomically-created directories prevent concurrent discovery/compile jobs
// from sharing source files (timestamp-only directory names could collide).
fn simulation_work_dir(label: &str) -> Result<PathBuf, ErrorPayload> {
    tempfile::Builder::new()
        .prefix(&format!("allora-{label}-"))
        .tempdir()
        .map(|dir| dir.keep())
        .map_err(|err| error(&format!("Unable to create simulation workspace: {err}")))
}

fn availability(command: &str, hint: &str) -> ToolAvailability {
    let path = tool_command(command);
    let available = Command::new(&path).arg("--version").output().is_ok();
    ToolAvailability {
        available,
        path: available.then(|| path.to_string_lossy().to_string()),
        install_hint: hint.to_string(),
    }
}

#[cfg(test)]
fn discover_ports(
    files: &[SimulationSourceFile],
    top_module: &str,
) -> Result<Vec<RtlPort>, ErrorPayload> {
    discover_ports_with_project(files, top_module, None)
}

pub(crate) fn discover_ports_with_project(
    files: &[SimulationSourceFile],
    top_module: &str,
    project_path: Option<&str>,
) -> Result<Vec<RtlPort>, ErrorPayload> {
    validate_identifier(top_module, "top module")?;
    if files.is_empty() {
        return Err(error(
            "No HDL source files were provided for port discovery.",
        ));
    }
    let workspace = simulation_work_dir("port_discovery")?;
    let paths = write_sources(&workspace, files)?;
    if let Some(project_path) = project_path {
        copy_generated_memories(Path::new(project_path), &workspace)?;
    }
    let json_path = workspace.join("design.json");
    let read_files = paths
        .iter()
        .map(|path| yosys_quote(path))
        .collect::<Vec<_>>()
        .join(" ");
    let script = format!(
        "read_verilog -sv {read_files}; hierarchy -check -top {top_module}; proc; write_json {}",
        yosys_quote(&json_path)
    );
    let output = Command::new(tool_command("yosys"))
        .args(["-q", "-p", &script])
        .current_dir(&workspace)
        .output()
        .map_err(|err| {
            let _ = fs::remove_dir_all(&workspace);
            error(&format!("Unable to launch Yosys for RTL port discovery: {err}. Install Yosys or OSS CAD Suite."))
        })?;
    if !output.status.success() {
        let details = concise_command_output(
            &String::from_utf8_lossy(&output.stdout),
            &String::from_utf8_lossy(&output.stderr),
        );
        let _ = fs::remove_dir_all(&workspace);
        return Err(error(&format!(
            "RTL port discovery failed for top module {top_module}.\n{details}"
        )));
    }
    let parsed: Value = serde_json::from_slice(
        &fs::read(&json_path)
            .map_err(|err| error(&format!("Unable to read Yosys port data: {err}")))?,
    )
    .map_err(|err| error(&format!("Unable to parse Yosys port data: {err}")))?;
    let module = parsed
        .get("modules")
        .and_then(|value| value.get(top_module))
        .ok_or_else(|| error("The selected top module was not found in the synthesized design."))?;
    let ports_object = module
        .get("ports")
        .and_then(Value::as_object)
        .ok_or_else(|| error("Yosys returned no ports for the selected top module."))?;
    let ports = ports_object
        .iter()
        .map(|(name, port)| RtlPort {
            name: name.clone(),
            direction: port
                .get("direction")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string(),
            offset: port.get("offset").and_then(Value::as_i64).unwrap_or(0),
            upto: port.get("upto").and_then(Value::as_u64).unwrap_or(0) != 0,
            width: port
                .get("bits")
                .and_then(Value::as_array)
                .map_or(1, Vec::len),
        })
        .collect();
    let _ = fs::remove_dir_all(&workspace);
    Ok(ports)
}

fn write_sources(
    workspace: &Path,
    files: &[SimulationSourceFile],
) -> Result<Vec<PathBuf>, ErrorPayload> {
    let source_dir = workspace.join("src");
    fs::create_dir_all(&source_dir)
        .map_err(|err| error(&format!("Unable to create simulation sources: {err}")))?;
    files
        .iter()
        .enumerate()
        .map(|(index, file)| {
            let extension = Path::new(&file.name)
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("sv");
            let path = source_dir.join(format!("source_{index}.{extension}"));
            fs::write(&path, &file.content)
                .map_err(|err| error(&format!("Unable to write {}: {err}", file.name)))?;
            Ok(path)
        })
        .collect()
}

fn validate_identifier(value: &str, label: &str) -> Result<(), ErrorPayload> {
    let mut chars = value.chars();
    let valid = chars
        .next()
        .is_some_and(|character| character.is_ascii_alphabetic() || character == '_')
        && chars.all(|character| character.is_ascii_alphanumeric() || character == '_');
    if valid {
        Ok(())
    } else {
        Err(error(&format!(
            "The {label} must be a simple HDL identifier."
        )))
    }
}

fn validate_ports(ports: &[RtlPort]) -> Result<(), ErrorPayload> {
    for port in ports {
        validate_identifier(&port.name, "port name")?;
        if port.direction != "input" && port.direction != "output" {
            return Err(error(&format!(
                "Port {} uses unsupported direction {}.",
                port.name, port.direction
            )));
        }
        if port.width == 0 || port.width > 64 {
            return Err(error(&format!(
                "Port {} is {} bits wide. Virtual FPGA V0.1 supports ports up to 64 bits.",
                port.name, port.width
            )));
        }
    }
    Ok(())
}

fn validate_input_mapping(ports: &[RtlPort], signal: &str) -> Result<(), ErrorPayload> {
    if ports
        .iter()
        .any(|port| port.name == signal && port.direction == "input" && port.width == 1)
    {
        Ok(())
    } else {
        Err(error("The virtual clock must map to a one-bit input port."))
    }
}

fn step_session_with_trace(
    session: &mut VirtualFpgaSession,
    cycles: u32,
) -> Result<SimulationStepResponse, ErrorPayload> {
    let clock = session.clock_signal.clone().unwrap_or_else(|| "-".into());

    let start_time_ps = session.sim_time_ps;
    let period_ps = 1_000_000_000_000u64 / session.clock_frequency_hz;
    let captured_cycles = cycles;
    let command = format!("TRACE {clock} {cycles} {captured_cycles}");
    let points = exchange_trace(session, &command)?;
    session.sim_time_ps = session
        .sim_time_ps
        .saturating_add(period_ps.saturating_mul(cycles as u64));

    let trace = points
        .into_iter()
        .map(|point| SimulationSnapshot {
            sim_time_ps: start_time_ps.saturating_add(period_ps.saturating_mul(point.tick) / 2),
            values: point.values,
        })
        .collect::<Vec<_>>();
    let state = SimulationSnapshot {
        sim_time_ps: session.sim_time_ps,
        values: trace
            .last()
            .map(|point| point.values.clone())
            .unwrap_or_default(),
    };
    Ok(SimulationStepResponse { state, trace })
}

fn exchange(
    session: &mut VirtualFpgaSession,
    command: &str,
) -> Result<SimulationSnapshot, ErrorPayload> {
    writeln!(session.stdin, "{command}")
        .and_then(|_| session.stdin.flush())
        .map_err(|err| error(&format!("Unable to send a simulator command: {err}")))?;
    let mut line = String::new();
    loop {
        line.clear();
        let count = session
            .stdout
            .read_line(&mut line)
            .map_err(|err| error(&format!("Unable to read simulator output: {err}")))?;
        if count == 0 {
            return Err(error(
                "The Verilator simulation process exited unexpectedly.",
            ));
        }
        if let Some(payload) = line.trim().strip_prefix("ALLORA:") {
            let mut snapshot: SimulationSnapshot = serde_json::from_str(payload)
                .map_err(|err| error(&format!("The simulator returned invalid state: {err}")))?;
            snapshot.sim_time_ps = session.sim_time_ps;
            return Ok(snapshot);
        }
    }
}

fn exchange_trace(
    session: &mut VirtualFpgaSession,
    command: &str,
) -> Result<Vec<HarnessTracePoint>, ErrorPayload> {
    writeln!(session.stdin, "{command}")
        .and_then(|_| session.stdin.flush())
        .map_err(|err| error(&format!("Unable to send a simulator command: {err}")))?;
    let mut line = String::new();
    loop {
        line.clear();
        let count = session
            .stdout
            .read_line(&mut line)
            .map_err(|err| error(&format!("Unable to read simulator output: {err}")))?;
        if count == 0 {
            return Err(error(
                "The Verilator simulation process exited unexpectedly.",
            ));
        }
        if let Some(payload) = line.trim().strip_prefix("ALLORA_TRACE:") {
            return serde_json::from_str(payload).map_err(|err| {
                error(&format!("The simulator returned invalid trace data: {err}"))
            });
        }
    }
}

fn generate_harness(
    top: &str,
    ports: &[RtlPort],
    vcd_path: Option<&Path>,
    period_ps: u64,
) -> String {
    let set_cases = ports
        .iter()
        .filter(|port| port.direction == "input")
        .map(|port| {
            format!(
                "    if (name == \"{}\") top.{} = value;",
                port.name, port.name
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let values = ports
        .iter()
        .map(|port| {
            format!(
                "      emit(\"{}\", static_cast<unsigned long long>(top.{}), first);",
                port.name, port.name
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let vcd_literal = vcd_path
        .map(|path| cpp_string(&path.to_string_lossy()))
        .unwrap_or_default();
    format!(
        r#"#include <verilated.h>
#include <verilated_vcd_c.h>
#include <iostream>
#include <cstdlib>
#include <sstream>
#include <string>
#include "V{top}.h"

int main(int argc, char** argv) {{
  VerilatedContext context;
  context.commandArgs(argc, argv);
  V{top} top{{&context}};
  VerilatedVcdC trace;
  const bool tracing = {tracing};
  if (tracing) {{ context.traceEverOn(true); top.trace(&trace, 99); trace.open("{vcd_literal}"); }}
  auto evaluate = [&]() {{ top.eval(); if (context.gotFinish()) std::exit(0); if (tracing) trace.dump(context.time()); }};
  auto set_input = [&](const std::string& name, unsigned long long value) {{
{set_cases}
  }};
  auto emit_values = [&](std::ostream& output) {{
    bool first = true;
    auto emit = [&](const char* name, unsigned long long value, bool& is_first) {{
      if (!is_first) output << ','; is_first = false;
      output << '\"' << name << "\":\"" << value << '\"';
    }};
{values}
  }};
  auto send_state = [&]() {{
    std::cout << "ALLORA:{{\"simTimePs\":0,\"values\":{{";
    emit_values(std::cout);
    std::cout << "}}}}" << std::endl;
  }};
  evaluate();
  std::string line;
  while (std::getline(std::cin, line)) {{
    std::istringstream input(line);
    std::string command, name; unsigned long long value = 0; unsigned cycles = 1;
    input >> command;
    if (command == "QUIT") break;
    if (command == "SET") {{ input >> name >> value; set_input(name, value); evaluate(); }}
    else if (command == "STEP") {{
      input >> name >> cycles;
      for (unsigned i = 0; i < cycles; ++i) {{ set_input(name, 1); evaluate(); context.timeInc({half_period_ps}); set_input(name, 0); evaluate(); context.timeInc({remaining_period_ps}); }}
    }} else if (command == "TRACE") {{
      unsigned capture_cycles = 1;
      input >> name >> cycles >> capture_cycles;
      const unsigned capture_start = cycles > capture_cycles ? cycles - capture_cycles : 0;
      bool first_sample = true;
      std::ostringstream samples;
      samples << '[';
      auto capture = [&](unsigned long long tick) {{
        if (!first_sample) samples << ','; first_sample = false;
        samples << "{{\"tick\":" << tick << ",\"values\":{{";
        emit_values(samples);
        samples << "}}}}";
      }};
      for (unsigned i = 0; i < cycles; ++i) {{
        set_input(name, 1); evaluate();
        if (i >= capture_start) capture(static_cast<unsigned long long>(i) * 2);
        context.timeInc({half_period_ps});
        set_input(name, 0); evaluate();
        if (i >= capture_start) capture(static_cast<unsigned long long>(i) * 2 + 1);
        context.timeInc({remaining_period_ps});
      }}
      samples << ']';
      std::cout << "ALLORA_TRACE:" << samples.str() << std::endl;
      continue;
    }} else if (command == "EVAL") {{ input >> cycles; for (unsigned i = 0; i < cycles; ++i) {{ evaluate(); context.timeInc({half_period_ps}); }} }}
    send_state();
  }}
  top.final(); if (tracing) trace.close(); return 0;
}}
"#,
        half_period_ps = period_ps / 2,
        remaining_period_ps = period_ps - period_ps / 2,
        tracing = if vcd_path.is_some() { "true" } else { "false" }
    )
}

fn cpp_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
fn yosys_quote(path: &Path) -> String {
    format!("\"{}\"", path.to_string_lossy().replace('"', "\\\""))
}
fn concise_command_output(stdout: &str, stderr: &str) -> String {
    let combined = format!("{stdout}\n{stderr}");
    let lines = combined
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>();
    lines[lines.len().saturating_sub(40)..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workbench_real_rtl_and_host_integration() {
        // Required integration test: missing tools are a failure, never a silent pass.
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_path_buf();
        let source = root.join("../examples/peripheral-workbench/src/workbench_demo.sv");
        let files = vec![SimulationSourceFile {
            name: "workbench_demo.sv".into(),
            content: fs::read_to_string(source).unwrap(),
        }];
        let state = VirtualFpgaState::default();
        let result = start_simulation(
            StartSimulationRequest {
                source_files: files,
                top_module: "workbench_demo".into(),
                clock_signal: Some("clk".into()),
                clock_frequency_hz: 1_843_200,
                enable_vcd: Some(false),
                project_path: None,
            },
            &state,
        )
        .expect("compile real workbench RTL with Yosys and Verilator");
        let mut sessions = state.sessions.lock().unwrap();
        let session = sessions.get_mut(&result.session_id).unwrap();
        let result = step_session_with_trace(session, 256).unwrap();
        assert_eq!(result.trace.len(), 512);
        assert_eq!(
            result.state.sim_time_ps,
            (1_000_000_000_000u64 / 1_843_200) * 256
        );
        let ports_file = session.workspace.join("ports.json");
        fs::write(
            &ports_file,
            serde_json::to_vec(
                &discover_ports(
                    &[SimulationSourceFile {
                        name: "workbench_demo.sv".into(),
                        content: fs::read_to_string(
                            root.join("../examples/peripheral-workbench/src/workbench_demo.sv"),
                        )
                        .unwrap(),
                    }],
                    "workbench_demo",
                )
                .unwrap(),
            )
            .unwrap(),
        )
        .unwrap();
        let status = Command::new("node")
            .arg("tests/workbench-integration.mjs")
            .arg(session.workspace.join("obj_dir/Vworkbench_demo"))
            .arg(ports_file)
            .current_dir(&root)
            .status()
            .expect("run Node host integration tests");
        assert!(status.success(), "Workbench host/RTL integration failed");
    }

    #[test]
    fn workbench_clockless_u64_and_compile_errors() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_path_buf();
        let state = VirtualFpgaState::default();
        let request = |content: String| StartSimulationRequest {
            source_files: vec![SimulationSourceFile {
                name: "vector_polarity.sv".into(),
                content,
            }],
            top_module: "vector_polarity".into(),
            clock_signal: None,
            clock_frequency_hz: 50_000_000,
            enable_vcd: Some(false),
            project_path: None,
        };
        assert!(start_simulation(request("module broken syntax".into()), &state).is_err());
        let started = start_simulation(
            request(
                fs::read_to_string(
                    root.join("../examples/peripheral-vector-polarity/src/vector_polarity.sv"),
                )
                .unwrap(),
            ),
            &state,
        )
        .unwrap();
        let mut sessions = state.sessions.lock().unwrap();
        let session = sessions.get_mut(&started.session_id).unwrap();
        let snapshot = set_input_value(
            session,
            "inputs",
            &Value::String("9223372036854775808".into()),
        )
        .unwrap();
        assert_eq!(snapshot.values["inputs"], "9223372036854775808");
        assert_eq!(snapshot.values["outputs"], "9223372036854775807");
        assert!(set_input_value(session, "outputs", &Value::from(0)).is_err());
        assert!(set_input_value(
            session,
            "inputs",
            &Value::String("18446744073709551616".into())
        )
        .is_err());
        let stepped = step_session_with_trace(session, 256).unwrap();
        assert_eq!(stepped.trace.len(), 512);
        assert_eq!(stepped.state.sim_time_ps, 20_000 * 256);
        assert_eq!(stepped.state.values["outputs"], "9223372036854775807");
        session.child.kill().unwrap();
        session.child.wait().unwrap();
        assert!(
            step_session_with_trace(session, 1).is_err(),
            "terminated RTL must surface an error"
        );
        sessions.remove(&started.session_id); // Drop removes the session and its workspace.
    }

    #[test]
    fn register_builder_runs_in_production_verilator_session() {
        let example = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/register-builder");
        let files = [
            "src/register_demo.sv",
            "Register_Map/demo_registers.sv",
            "Register_Map/demo_registers_top.sv",
        ]
        .iter()
        .map(|name| SimulationSourceFile {
            name: name.strip_prefix("src/").unwrap_or(name).to_string(),
            content: fs::read_to_string(example.join(name)).unwrap(),
        })
        .collect();
        let state = VirtualFpgaState::default();
        let started = start_simulation(
            StartSimulationRequest {
                source_files: files,
                top_module: "demo_registers_top".to_string(),
                clock_signal: Some("clk".to_string()),
                clock_frequency_hz: 50_000_000,
                enable_vcd: Some(false),
                project_path: None,
            },
            &state,
        )
        .unwrap();
        let mut sessions = state.sessions.lock().unwrap();
        let session = sessions.get_mut(&started.session_id).unwrap();
        set_input_value(session, "rst", &Value::from(1)).unwrap();
        step_session_with_trace(session, 1).unwrap();
        set_input_value(session, "rst", &Value::from(0)).unwrap();
        set_input_value(session, "rb_wr_data", &Value::from(1)).unwrap();
        set_input_value(session, "rb_wr_en", &Value::from(1)).unwrap();
        step_session_with_trace(session, 1).unwrap();
        set_input_value(session, "rb_wr_en", &Value::from(0)).unwrap();
        let snapshot = step_session_with_trace(session, 2).unwrap().state;
        assert_eq!(snapshot.values["count"], "2");
        set_input_value(session, "rb_addr", &Value::from(4)).unwrap();
        let snapshot = set_input_value(session, "rb_rd_en", &Value::from(1)).unwrap();
        assert_eq!(snapshot.values["rb_rd_data"], "2");
        sessions.remove(&started.session_id);
    }
    #[test]
    fn harness_maps_vector_and_scalar_ports() {
        let ports = vec![
            RtlPort {
                name: "enable".into(),
                direction: "input".into(),
                width: 1,
                offset: 0,
                upto: false,
            },
            RtlPort {
                name: "leds".into(),
                direction: "output".into(),
                width: 4,
                offset: 0,
                upto: false,
            },
        ];
        let harness = generate_harness("counter", &ports, None, 10_000);
        assert!(harness.contains("top.enable = value"));
        assert!(harness.contains("top.leds"));
    }

    #[test]
    fn rejects_unsupported_wide_ports() {
        let ports = vec![RtlPort {
            name: "wide".into(),
            direction: "output".into(),
            width: 65,
            offset: 0,
            upto: false,
        }];
        assert!(validate_ports(&ports).is_err());
    }

    #[test]
    fn discovers_real_yosys_ports_when_available() {
        if Command::new(tool_command("yosys"))
            .arg("--version")
            .output()
            .is_err()
        {
            return;
        }
        let files = vec![SimulationSourceFile {
            name: "counter.sv".into(),
            content: "module counter(input logic clk, input logic reset, output logic [3:0] leds); always_ff @(posedge clk) if (reset) leds <= 0; else leds <= leds + 1; endmodule".into(),
        }];
        let ports = discover_ports(&files, "counter").expect("discover ports");
        assert_eq!(ports.len(), 3);
        assert!(ports.contains(&RtlPort {
            name: "clk".into(),
            direction: "input".into(),
            width: 1,
            offset: 0,
            upto: false,
        }));
        assert!(ports.contains(&RtlPort {
            name: "reset".into(),
            direction: "input".into(),
            width: 1,
            offset: 0,
            upto: false,
        }));
        assert!(ports.contains(&RtlPort {
            name: "leds".into(),
            direction: "output".into(),
            width: 4,
            offset: 0,
            upto: false,
        }));
    }

    #[test]
    fn generated_verilator_harness_runs_real_rtl() {
        if Command::new(tool_command("verilator"))
            .arg("--version")
            .output()
            .is_err()
        {
            return;
        }
        let workspace = simulation_work_dir("verilator_test").expect("workspace");
        let source = workspace.join("counter.sv");
        fs::write(&source, "module counter(input logic clk, input logic reset, input logic enable, output logic [3:0] leds); always_ff @(posedge clk) if (reset) leds <= 0; else if (enable) leds <= leds + 1; endmodule").expect("source");
        let ports = vec![
            RtlPort {
                name: "clk".into(),
                direction: "input".into(),
                width: 1,
                offset: 0,
                upto: false,
            },
            RtlPort {
                name: "reset".into(),
                direction: "input".into(),
                width: 1,
                offset: 0,
                upto: false,
            },
            RtlPort {
                name: "enable".into(),
                direction: "input".into(),
                width: 1,
                offset: 0,
                upto: false,
            },
            RtlPort {
                name: "leds".into(),
                direction: "output".into(),
                width: 4,
                offset: 0,
                upto: false,
            },
        ];
        let harness = workspace.join("harness.cpp");
        fs::write(&harness, generate_harness("counter", &ports, None, 10_000)).expect("harness");
        let object_dir = workspace.join("obj_dir");
        let status = Command::new(tool_command("verilator"))
            .args([
                "--cc",
                "--exe",
                "--build",
                "--trace",
                "-Wno-fatal",
                "--top-module",
                "counter",
                "--Mdir",
                object_dir.to_str().expect("obj path"),
                "-CFLAGS",
                "-std=c++17",
                harness.to_str().expect("harness path"),
                source.to_str().expect("source path"),
            ])
            .current_dir(&workspace)
            .status()
            .expect("run verilator");
        assert!(status.success());
        let mut child = Command::new(object_dir.join("Vcounter"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("model");
        let mut stdin = child.stdin.take().expect("stdin");
        let mut stdout = BufReader::new(child.stdout.take().expect("stdout"));
        let mut command = |value: &str| {
            writeln!(stdin, "{value}").expect("write command");
            stdin.flush().expect("flush command");
            let mut line = String::new();
            stdout.read_line(&mut line).expect("read state");
            line
        };
        command("SET reset 1");
        command("STEP clk 1");
        command("SET reset 0");
        command("SET enable 1");
        let state = command("STEP clk 1");
        assert!(state.contains("\"leds\":\"1\""), "{state}");
        let trace_line = command("TRACE clk 4 4");
        let trace_payload = trace_line
            .trim()
            .strip_prefix("ALLORA_TRACE:")
            .expect("trace prefix");
        let trace: Vec<HarnessTracePoint> =
            serde_json::from_str(trace_payload).expect("valid trace payload");
        assert_eq!(trace.len(), 8);
        assert_eq!(trace[0].values.get("clk").map(String::as_str), Some("1"));
        assert_eq!(trace[1].values.get("clk").map(String::as_str), Some("0"));
        assert_eq!(trace[6].values.get("clk").map(String::as_str), Some("1"));
        assert_eq!(trace[7].values.get("clk").map(String::as_str), Some("0"));
        assert_eq!(trace[7].values.get("leds").map(String::as_str), Some("5"));
        let _ = child.kill();
        let _ = child.wait();
        let _ = fs::remove_dir_all(workspace);
    }
}
