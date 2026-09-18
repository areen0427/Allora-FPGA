use crate::{create_work_dir, error, tool_command, ErrorPayload};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

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
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RtlPort {
    pub name: String,
    pub direction: String,
    pub width: usize,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetInputRequest {
    pub session_id: u32,
    pub signal: String,
    pub value: u64,
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

#[derive(Default)]
pub struct VirtualFpgaState {
    sessions: Mutex<HashMap<u32, VirtualFpgaSession>>,
    next_id: AtomicU32,
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
pub fn discover_rtl_ports(request: DiscoverPortsRequest) -> Result<Vec<RtlPort>, ErrorPayload> {
    discover_ports(&request.source_files, &request.top_module)
}

#[tauri::command]
pub fn start_virtual_simulation(
    request: StartSimulationRequest,
    state: tauri::State<'_, VirtualFpgaState>,
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

    let ports = discover_ports(&request.source_files, &request.top_module)?;
    validate_ports(&ports)?;
    if let Some(clock) = request.clock_signal.as_deref() {
        validate_input_mapping(&ports, clock)?;
    }
    let frequency = request.clock_frequency_hz.max(1);
    let workspace = create_work_dir("virtual_fpga")?;
    let source_paths = write_sources(&workspace, &request.source_files)?;
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
        generate_harness(&request.top_module, &ports, vcd_path.as_deref()),
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
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
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
    let width = *session
        .input_ports
        .get(&request.signal)
        .ok_or_else(|| error("The mapped signal is not an input port."))?;
    if width < 64 && request.value >= (1u64 << width) {
        return Err(error("The input value does not fit the signal width."));
    }
    exchange(
        session,
        &format!("SET {} {}", request.signal, request.value),
    )
}

#[tauri::command]
pub fn step_virtual_simulation(
    request: StepSimulationRequest,
    state: tauri::State<'_, VirtualFpgaState>,
) -> Result<SimulationSnapshot, ErrorPayload> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| error("Virtual FPGA session state is unavailable."))?;
    let session = sessions
        .get_mut(&request.session_id)
        .ok_or_else(|| error("The Virtual FPGA simulation is no longer running."))?;
    step_session(session, request.cycles.max(1).min(100_000))
}

#[tauri::command]
pub fn reset_virtual_simulation(
    request: ResetSimulationRequest,
    state: tauri::State<'_, VirtualFpgaState>,
) -> Result<SimulationSnapshot, ErrorPayload> {
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
    if let Some(reset) = request.reset_signal {
        if session.input_ports.contains_key(&reset) {
            let active = if request.active_high.unwrap_or(true) {
                1
            } else {
                0
            };
            let inactive = 1 - active;
            exchange(session, &format!("SET {reset} {active}"))?;
            step_session(session, 2)?;
            exchange(session, &format!("SET {reset} {inactive}"))?;
        }
    }
    session.sim_time_ps = 0;
    let mut snapshot = exchange(session, "STATE")?;
    snapshot.sim_time_ps = 0;
    Ok(snapshot)
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

fn availability(command: &str, hint: &str) -> ToolAvailability {
    let path = tool_command(command);
    let available = Command::new(&path).arg("--version").output().is_ok();
    ToolAvailability {
        available,
        path: available.then(|| path.to_string_lossy().to_string()),
        install_hint: hint.to_string(),
    }
}

fn discover_ports(
    files: &[SimulationSourceFile],
    top_module: &str,
) -> Result<Vec<RtlPort>, ErrorPayload> {
    validate_identifier(top_module, "top module")?;
    if files.is_empty() {
        return Err(error(
            "No HDL source files were provided for port discovery.",
        ));
    }
    let workspace = create_work_dir("port_discovery")?;
    let paths = write_sources(&workspace, files)?;
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

fn step_session(
    session: &mut VirtualFpgaSession,
    cycles: u32,
) -> Result<SimulationSnapshot, ErrorPayload> {
    let command = if let Some(clock) = &session.clock_signal {
        format!("STEP {clock} {cycles}")
    } else {
        format!("EVAL {cycles}")
    };
    let mut snapshot = exchange(session, &command)?;
    session.sim_time_ps = session.sim_time_ps.saturating_add(
        (1_000_000_000_000u64 / session.clock_frequency_hz).saturating_mul(cycles as u64),
    );
    snapshot.sim_time_ps = session.sim_time_ps;
    Ok(snapshot)
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

fn generate_harness(top: &str, ports: &[RtlPort], vcd_path: Option<&Path>) -> String {
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
                "    emit(\"{}\", static_cast<unsigned long long>(top.{}), first);",
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
  auto evaluate = [&]() {{ top.eval(); if (tracing) trace.dump(context.time()); }};
  auto set_input = [&](const std::string& name, unsigned long long value) {{
{set_cases}
  }};
  auto send_state = [&]() {{
    bool first = true;
    std::cout << "ALLORA:{{\"simTimePs\":0,\"values\":{{";
    auto emit = [&](const char* name, unsigned long long value, bool& is_first) {{
      if (!is_first) std::cout << ','; is_first = false;
      std::cout << '\"' << name << "\":\"" << value << '\"';
    }};
{values}
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
      for (unsigned i = 0; i < cycles; ++i) {{ set_input(name, 0); evaluate(); context.timeInc(1); set_input(name, 1); evaluate(); context.timeInc(1); }}
    }} else if (command == "EVAL") {{ input >> cycles; for (unsigned i = 0; i < cycles; ++i) {{ evaluate(); context.timeInc(1); }} }}
    send_state();
  }}
  top.final(); if (tracing) trace.close(); return 0;
}}
"#,
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
    fn harness_maps_vector_and_scalar_ports() {
        let ports = vec![
            RtlPort {
                name: "enable".into(),
                direction: "input".into(),
                width: 1,
            },
            RtlPort {
                name: "leds".into(),
                direction: "output".into(),
                width: 4,
            },
        ];
        let harness = generate_harness("counter", &ports, None);
        assert!(harness.contains("top.enable = value"));
        assert!(harness.contains("top.leds"));
    }

    #[test]
    fn rejects_unsupported_wide_ports() {
        let ports = vec![RtlPort {
            name: "wide".into(),
            direction: "output".into(),
            width: 65,
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
            width: 1
        }));
        assert!(ports.contains(&RtlPort {
            name: "reset".into(),
            direction: "input".into(),
            width: 1
        }));
        assert!(ports.contains(&RtlPort {
            name: "leds".into(),
            direction: "output".into(),
            width: 4
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
        let workspace = create_work_dir("verilator_test").expect("workspace");
        let source = workspace.join("counter.sv");
        fs::write(&source, "module counter(input logic clk, input logic reset, input logic enable, output logic [3:0] leds); always_ff @(posedge clk) if (reset) leds <= 0; else if (enable) leds <= leds + 1; endmodule").expect("source");
        let ports = vec![
            RtlPort {
                name: "clk".into(),
                direction: "input".into(),
                width: 1,
            },
            RtlPort {
                name: "reset".into(),
                direction: "input".into(),
                width: 1,
            },
            RtlPort {
                name: "enable".into(),
                direction: "input".into(),
                width: 1,
            },
            RtlPort {
                name: "leds".into(),
                direction: "output".into(),
                width: 4,
            },
        ];
        let harness = workspace.join("harness.cpp");
        fs::write(&harness, generate_harness("counter", &ports, None)).expect("harness");
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
        let _ = child.kill();
        let _ = child.wait();
        let _ = fs::remove_dir_all(workspace);
    }
}
