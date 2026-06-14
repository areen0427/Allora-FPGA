use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::io;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFileSpec {
  relative_path: String,
  content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectWorkspaceRequest {
  project_name: String,
  folder_name: String,
  parent_directory: Option<String>,
  files: Vec<WorkspaceFileSpec>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFileRecord {
  relative_path: String,
  absolute_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFileContentRecord {
  relative_path: String,
  absolute_path: String,
  content: String,
  binary: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectWorkspaceResponse {
  project_id: String,
  project_path: String,
  files: Vec<WorkspaceFileRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadProjectWorkspaceRequest {
  project_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadProjectWorkspaceResponse {
  files: Vec<WorkspaceFileContentRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteProjectFileRequest {
  path: String,
  content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameProjectFileRequest {
  from_path: String,
  to_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteProjectFileRequest {
  path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetectConnectedBoardRequest {
  programmer_command: String,
  #[allow(dead_code)]
  usb_vendor_id: Option<u32>,
  #[allow(dead_code)]
  usb_product_id: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedUsbDevice {
  name: String,
  vendor: String,
  product_id: String,
  possible_boards: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectConnectedBoardResponse {
  connected: bool,
  details: String,
  usb_devices: Vec<DetectedUsbDevice>,
  programmer_detected: bool,
  programmer_details: String,
}

#[tauri::command]
fn detect_connected_board(
  request: DetectConnectedBoardRequest,
) -> Result<DetectConnectedBoardResponse, ErrorPayload> {
  let command = request.programmer_command.trim();
  let mut usb_devices = Vec::new();

  let tool_path = resolve_tool_path(command);
  let (programmer_detected, programmer_details) = if tool_path.exists() {
    (true, format!("{} found at {}", command, tool_path.display()))
  } else {
    (false, format!("{} not found on PATH", command))
  };

  #[cfg(target_os = "macos")]
  {
    let output = Command::new("system_profiler")
      .arg("SPUSBDataType")
      .output()
      .or_else(|_| Command::new("ioreg").arg("-p").arg("IOUSB").output());

    if let Ok(output) = output {
      let text = String::from_utf8_lossy(&output.stdout).to_string();
      let mut current_device = String::new();
      let mut current_vendor = String::new();
      let mut current_product_id = String::new();

      for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.contains("Product ID:") {
          current_product_id = trimmed
            .split(':')
            .nth(1)
            .unwrap_or("")
            .trim()
            .to_string();
        }
        if trimmed.contains("Vendor ID:") {
          current_vendor = trimmed
            .split(':')
            .nth(1)
            .unwrap_or("")
            .trim()
            .to_string();
        }
        if trimmed.contains("Product:") || trimmed.contains("Name:") {
          let name = trimmed
            .split(':')
            .nth(1)
            .unwrap_or("")
            .trim()
            .to_string();
          if !name.is_empty() {
            current_device = name;
          }
        }
        if trimmed.contains("Manufacturer:") {
          let mfr = trimmed
            .split(':')
            .nth(1)
            .unwrap_or("")
            .trim()
            .to_string();
          if !mfr.is_empty() && current_vendor.is_empty() {
            current_vendor = mfr;
          }
        }

        // When we hit a blank line or new device, process the current device
        if trimmed.is_empty() && !current_device.is_empty() {
          let lower = format!("{} {} {}", current_device, current_vendor, current_product_id).to_lowercase();
          if lower.contains("ftdi") || lower.contains("lattice") || lower.contains("digilent")
            || lower.contains("sipeed") || lower.contains("tinyfpga") || lower.contains("fomu")
            || lower.contains("1bit") || lower.contains("1209") || lower.contains("0403")
            || lower.contains("6010") || lower.contains("cmsis") || lower.contains("jtag")
            || lower.contains("ft2232") || lower.contains("ft232") || lower.contains("ftdi")
          {
            let possible_boards = identify_possible_boards(&current_device, &current_vendor, &current_product_id);
            usb_devices.push(DetectedUsbDevice {
              name: current_device.clone(),
              vendor: current_vendor.clone(),
              product_id: current_product_id.clone(),
              possible_boards,
            });
          }
          current_device.clear();
          current_vendor.clear();
          current_product_id.clear();
        }
      }

      // Process any remaining device
      if !current_device.is_empty() {
        let lower = format!("{} {} {}", current_device, current_vendor, current_product_id).to_lowercase();
        if lower.contains("ftdi") || lower.contains("lattice") || lower.contains("digilent")
          || lower.contains("sipeed") || lower.contains("tinyfpga") || lower.contains("fomu")
          || lower.contains("1bit") || lower.contains("1209") || lower.contains("0403")
          || lower.contains("6010") || lower.contains("cmsis") || lower.contains("jtag")
          || lower.contains("ft2232") || lower.contains("ft232") || lower.contains("ftdi")
        {
          let possible_boards = identify_possible_boards(&current_device, &current_vendor, &current_product_id);
          usb_devices.push(DetectedUsbDevice {
            name: current_device,
            vendor: current_vendor,
            product_id: current_product_id,
            possible_boards,
          });
        }
      }
    }
  }

  #[cfg(target_os = "linux")]
  {
    let output = Command::new("lsusb").output();
    if let Ok(output) = output {
      let text = String::from_utf8_lossy(&output.stdout).to_string();
      for line in text.lines() {
        let lower = line.to_lowercase();
        if lower.contains("ftdi") || lower.contains("lattice") || lower.contains("digilent")
          || lower.contains("sipeed") || lower.contains("tinyfpga") || lower.contains("fomu")
          || lower.contains("1bit") || lower.contains("1209") || lower.contains("0403")
          || lower.contains("6010") || lower.contains("cmsis") || lower.contains("jtag")
          || lower.contains("ft2232") || lower.contains("ft232")
        {
          let possible_boards = identify_possible_boards_from_lsusb(line);
          usb_devices.push(DetectedUsbDevice {
            name: line.to_string(),
            vendor: String::new(),
            product_id: String::new(),
            possible_boards,
          });
        }
      }
    }
  }

  #[cfg(target_os = "windows")]
  {
    let output = Command::new("wmic")
      .args(["path", "Win32_USBControllerDevice", "get", "Dependent"])
      .output();
    if let Ok(output) = output {
      let text = String::from_utf8_lossy(&output.stdout).to_string();
      for line in text.lines() {
        let lower = line.to_lowercase();
        if lower.contains("ftdi") || lower.contains("lattice") || lower.contains("digilent")
          || lower.contains("sipeed") || lower.contains("tinyfpga") || lower.contains("fomu")
          || lower.contains("cmsis") || lower.contains("jtag")
          || lower.contains("ft2232") || lower.contains("ft232")
        {
          usb_devices.push(DetectedUsbDevice {
            name: line.to_string(),
            vendor: String::new(),
            product_id: String::new(),
            possible_boards: vec![],
          });
        }
      }
    }
  }

  let connected = !usb_devices.is_empty();
  let details = if connected {
    let device_count = usb_devices.len();
    let board_count: usize = usb_devices.iter().map(|d| d.possible_boards.len()).sum();
    if board_count > 0 {
      format!(
        "Found {} USB device(s) with {} possible board match(es).",
        device_count, board_count
      )
    } else {
      format!(
        "Found {} USB device(s). Board identification may require manual selection.",
        device_count
      )
    }
  } else {
    "No compatible USB devices detected. Connect a board and try again.".to_string()
  };

  Ok(DetectConnectedBoardResponse {
    connected,
    details,
    usb_devices,
    programmer_detected,
    programmer_details,
  })
}

fn identify_possible_boards(device_name: &str, vendor: &str, product_id: &str) -> Vec<String> {
  let combined = format!("{} {} {}", device_name, vendor, product_id).to_lowercase();
  let mut boards = Vec::new();

  if combined.contains("ft2232") || combined.contains("ft232") {
    boards.push("ULX3S".to_string());
    boards.push("ECPIX-5".to_string());
    boards.push("ButterStick".to_string());
    boards.push("Custom ECP5 Board".to_string());
  }

  if combined.contains("ftdi") && !combined.contains("ft2232") && !combined.contains("ft232") {
    boards.push("iCEBreaker".to_string());
    boards.push("iCESugar".to_string());
    boards.push("TinyFPGA".to_string());
    boards.push("Fomu".to_string());
  }

  if combined.contains("digilent") {
    boards.push("Arty A7".to_string());
    boards.push("Basys 3".to_string());
    boards.push("Nexys Video".to_string());
    boards.push("Nexys 4".to_string());
  }

  if combined.contains("sipeed") {
    boards.push("Tang Nano 9K".to_string());
    boards.push("Tang Nano 20K".to_string());
  }

  if combined.contains("lattice") {
    boards.push("iCEBreaker".to_string());
    boards.push("iCESugar".to_string());
    boards.push("OrangeCrab".to_string());
  }

  if combined.contains("1bit") || combined.contains("1209") {
    boards.push("iCEBreaker".to_string());
    boards.push("iCEBreaker Bitsy".to_string());
  }

  if combined.contains("cmsis") || combined.contains("jtag") {
    boards.push("Custom Board (JTAG)".to_string());
  }

  boards
}

#[cfg(target_os = "linux")]
fn identify_possible_boards_from_lsusb(line: &str) -> Vec<String> {
  let lower = line.to_lowercase();
  let mut boards = Vec::new();

  if lower.contains("ft2232") || lower.contains("ft232") {
    boards.push("ULX3S".to_string());
    boards.push("ECPIX-5".to_string());
    boards.push("ButterStick".to_string());
    boards.push("Custom ECP5 Board".to_string());
  }

  if lower.contains("ftdi") && !lower.contains("ft2232") && !lower.contains("ft232") {
    boards.push("iCEBreaker".to_string());
    boards.push("iCESugar".to_string());
    boards.push("TinyFPGA".to_string());
    boards.push("Fomu".to_string());
  }

  if lower.contains("digilent") {
    boards.push("Arty A7".to_string());
    boards.push("Basys 3".to_string());
    boards.push("Nexys Video".to_string());
  }

  if lower.contains("sipeed") {
    boards.push("Tang Nano 9K".to_string());
    boards.push("Tang Nano 20K".to_string());
  }

  if lower.contains("lattice") {
    boards.push("iCEBreaker".to_string());
    boards.push("iCESugar".to_string());
    boards.push("OrangeCrab".to_string());
  }

  if lower.contains("cmsis") || lower.contains("jtag") {
    boards.push("Custom Board (JTAG)".to_string());
  }

  boards
}

#[tauri::command]
fn pick_existing_project_directory() -> Result<Option<String>, ErrorPayload> {
  #[cfg(target_os = "macos")]
  {
    let output = Command::new("osascript")
      .args([
        "-e",
        "set chosenFolder to choose folder with prompt \"Choose an Allora FPGA project folder\"",
        "-e",
        "POSIX path of chosenFolder",
      ])
      .output()
      .map_err(|err| error(&format!("Unable to open the folder picker: {err}")))?;

    if !output.status.success() {
      return Ok(None);
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
      Ok(None)
    } else {
      Ok(Some(path))
    }
  }

  #[cfg(not(target_os = "macos"))]
  {
    Ok(None)
  }
}

#[tauri::command]
fn read_project_workspace(
  request: ReadProjectWorkspaceRequest,
) -> Result<ReadProjectWorkspaceResponse, ErrorPayload> {
  let project_path = PathBuf::from(&request.project_path);
  if !project_path.exists() {
    return Err(error("Project folder no longer exists."));
  }

  let mut files = Vec::new();
  collect_workspace_files(&project_path, &project_path, &mut files)?;
  files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

  Ok(ReadProjectWorkspaceResponse { files })
}

#[tauri::command]
fn write_project_file(request: WriteProjectFileRequest) -> Result<(), ErrorPayload> {
  let path = PathBuf::from(&request.path);
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)
      .map_err(|err| error(&format!("Unable to create the file directory: {err}")))?;
  }
  fs::write(&path, request.content)
    .map_err(|err| error(&format!("Unable to write {}: {err}", path.display())))
}

#[tauri::command]
fn rename_project_file(request: RenameProjectFileRequest) -> Result<(), ErrorPayload> {
  let from_path = PathBuf::from(&request.from_path);
  let to_path = PathBuf::from(&request.to_path);

  if let Some(parent) = to_path.parent() {
    fs::create_dir_all(parent)
      .map_err(|err| error(&format!("Unable to create the destination directory: {err}")))?;
  }

  fs::rename(&from_path, &to_path).map_err(|err| {
    error(&format!(
      "Unable to rename {} to {}: {err}",
      from_path.display(),
      to_path.display()
    ))
  })
}

#[tauri::command]
fn delete_project_file(request: DeleteProjectFileRequest) -> Result<(), ErrorPayload> {
  let path = PathBuf::from(&request.path);
  if path.exists() {
    fs::remove_file(&path)
      .map_err(|err| error(&format!("Unable to delete {}: {err}", path.display())))?;
  }
  Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SynthesisInputFile {
  name: String,
  content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateSynthesisDiagramRequest {
  project_name: String,
  board_name: String,
  board_family: String,
  fpga_id: String,
  synthesis_flow: String,
  top_module: Option<String>,
  files: Vec<SynthesisInputFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SynthesisDiagramNode {
  id: String,
  label: String,
  kind: String,
  detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SynthesisDiagramEdge {
  from: String,
  to: String,
  label: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerateSynthesisDiagramResponse {
  logs: Vec<String>,
  top_module: String,
  output_name: String,
  nodes: Vec<SynthesisDiagramNode>,
  edges: Vec<SynthesisDiagramEdge>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateBitstreamRequest {
  project_name: String,
  board_name: String,
  board_family: String,
  board_package: String,
  fpga_id: String,
  synthesis_flow: String,
  top_module: Option<String>,
  source_files: Vec<SynthesisInputFile>,
  constraint_file: SynthesisInputFile,
  output_extension: String,
  project_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerateBitstreamResponse {
  logs: Vec<String>,
  top_module: String,
  output_name: String,
  artifact_path: Option<String>,
  bytes: Vec<u8>,
}

// ── FPGA Programming ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetectProgrammerRequest {
  programmer_command: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectProgrammerResponse {
  installed: bool,
  version_output: Option<String>,
  tool_path: Option<String>,
  message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProgramFpgaRequest {
  programmer_command: String,
  bitstream_path: String,
  board_name: String,
  extra_args: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgramFpgaResponse {
  success: bool,
  logs: Vec<String>,
  message: String,
}

#[tauri::command]
fn detect_programmer(
  request: DetectProgrammerRequest,
) -> Result<DetectProgrammerResponse, ErrorPayload> {
  let command = request.programmer_command.trim();
  if command.is_empty() {
    return Err(error("No programmer command specified."));
  }

  let tool_path = resolve_tool_path(command);
  let mut logs = vec![
    format!("[programmer] Detecting: {command}"),
    format!("[programmer] Path: {}", tool_path.display()),
  ];

  // Try running the command with --help or -h to detect if it exists
  let output = Command::new(&tool_path)
    .arg("--help")
    .output()
    .or_else(|_| {
      Command::new(&tool_path)
        .arg("-h")
        .output()
    })
    .or_else(|_| {
      Command::new(&tool_path)
        .arg("--version")
        .output()
    });

  match output {
    Ok(result) => {
      let stdout = String::from_utf8_lossy(&result.stdout).to_string();
      let stderr = String::from_utf8_lossy(&result.stderr).to_string();
      let combined = format!("{stdout}\n{stderr}");
      let version_line = combined
        .lines()
        .find(|line| line.to_lowercase().contains("version") || line.to_lowercase().contains(command))
        .map(ToOwned::to_owned);

      if result.status.success() || !stdout.trim().is_empty() {
        logs.push("[programmer] Status: found".to_string());
        Ok(DetectProgrammerResponse {
          installed: true,
          version_output: version_line,
          tool_path: Some(tool_path.to_string_lossy().to_string()),
          message: format!("{command} is installed and available."),
        })
      } else {
        logs.push("[programmer] Status: not found".to_string());
        Ok(DetectProgrammerResponse {
          installed: false,
          version_output: None,
          tool_path: None,
          message: format!("{command} was not found. Install it to enable FPGA programming."),
        })
      }
    }
    Err(err) => {
      if err.kind() == io::ErrorKind::NotFound {
        Ok(DetectProgrammerResponse {
          installed: false,
          version_output: None,
          tool_path: None,
          message: format!(
            "{command} is not installed or is not available on PATH. Install it to enable FPGA programming."
          ),
        })
      } else {
        Err(error(&format!("Unable to probe for {command}: {err}")))
      }
    }
  }
}

#[tauri::command]
async fn program_fpga(
  request: ProgramFpgaRequest,
  on_log: Channel<String>,
) -> Result<ProgramFpgaResponse, ErrorPayload> {
  let command = request.programmer_command.trim();
  if command.is_empty() {
    return Err(error("No programmer command specified."));
  }

  let bitstream_path = PathBuf::from(&request.bitstream_path);
  if !bitstream_path.exists() {
    return Err(error(&format!(
      "Bitstream file not found: {}",
      bitstream_path.display()
    )));
  }

  let tool_path = resolve_tool_path(command);
  let mut args = Vec::new();

  // Build command arguments based on the programmer type
  let cmd_lower = command.to_lowercase();
  if cmd_lower.contains("iceprog") || cmd_lower.contains("icesprog") {
    args.push(bitstream_path.display().to_string());
  } else if cmd_lower.contains("ecpprog") {
    args.push(bitstream_path.display().to_string());
  } else if cmd_lower.contains("openfpgaloader") {
    args.push(bitstream_path.display().to_string());
  } else if cmd_lower.contains("fujprog") {
    args.push(bitstream_path.display().to_string());
  } else if cmd_lower.contains("dfu-util") {
    args.push("-D".to_string());
    args.push(bitstream_path.display().to_string());
  } else if cmd_lower.contains("vivado") {
    // Vivado needs a TCL script
    return Err(error(
      "Vivado hardware programming requires a TCL script. Use Vivado Hardware Manager directly.",
    ));
  } else if cmd_lower.contains("quartus") || cmd_lower.contains("usb-blaster") {
    args.push("--mode".to_string());
    args.push("JTAG".to_string());
    args.push("-o".to_string());
    args.push(format!("P;{}", bitstream_path.display()));
  } else {
    // Generic: pass bitstream as argument
    args.push(bitstream_path.display().to_string());
  }

  // Add extra arguments if provided
  if let Some(extra) = &request.extra_args {
    args.extend(extra.iter().cloned());
  }

  let mut logs = Vec::new();
  send_log(&on_log, &mut logs, format!("[programming] Board: {}", request.board_name));
  send_log(&on_log, &mut logs, format!("[programming] Programmer: {command}"));
  send_log(&on_log, &mut logs, format!("[programming] Bitstream: {}", bitstream_path.display()));
  send_log(&on_log, &mut logs, format!("[programming] Command: {command} {}", args.join(" ")));

  let (status, stdout_bytes, stderr_bytes) =
    run_command_streaming(&tool_path, &args, None, &on_log).map_err(|err| {
      if err.kind() == io::ErrorKind::NotFound {
        error(&format!(
          "{command} is not installed or is not available on PATH. Install it to enable FPGA programming."
        ))
      } else {
        error(&format!("Unable to launch {command}: {err}"))
      }
    })?;

  append_command_logs(&mut logs, &stdout_bytes, &stderr_bytes);

  if status.success() {
    send_log(&on_log, &mut logs, "");
    send_log(&on_log, &mut logs, "[programming] ✓ Programming completed successfully.");
    Ok(ProgramFpgaResponse {
      success: true,
      logs,
      message: format!("Successfully programmed {} with {}.", request.board_name, request.bitstream_path),
    })
  } else {
    let error_details = format_command_error(command, &stdout_bytes, &stderr_bytes);
    send_log(&on_log, &mut logs, "");
    send_log(&on_log, &mut logs, format!("[programming] ✗ {error_details}"));
    Ok(ProgramFpgaResponse {
      success: false,
      logs,
      message: error_details,
    })
  }
}

fn resolve_tool_path(command: &str) -> PathBuf {
  let path = PathBuf::from(command);
  if path.components().count() > 1 {
    return path;
  }

  for tool_dir in ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"] {
    let candidate = Path::new(tool_dir).join(command);
    if candidate.exists() {
      return candidate;
    }
  }

  PathBuf::from(command)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimulateTestbenchRequest {
  project_name: String,
  source_files: Vec<SynthesisInputFile>,
  testbench_file: SynthesisInputFile,
  top_module: Option<String>,
  project_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulateTestbenchResponse {
  logs: Vec<String>,
  top_module: String,
  waveform_name: String,
  waveform_path: Option<String>,
  vcd: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
  message: String,
}

#[tauri::command]
async fn generate_synthesis_diagram(
  request: GenerateSynthesisDiagramRequest,
) -> Result<GenerateSynthesisDiagramResponse, ErrorPayload> {
  if request.files.is_empty() {
    return Err(error("No HDL files were provided."));
  }

  if request.synthesis_flow != "yosys-nextpnr" {
    return Err(error(
      "Real synthesis diagrams are currently available for Yosys-based boards only.",
    ));
  }

  if request
    .files
    .iter()
    .any(|file| is_vhdl_file(&file.name))
  {
    return Err(error(
      "VHDL synthesis diagrams are not wired up yet. Import Verilog or SystemVerilog files for now.",
    ));
  }

  let output_name = sanitize_name(&request.project_name);
  let temp_dir = create_work_dir(&output_name)?;
  let source_dir = temp_dir.join("src");
  fs::create_dir_all(&source_dir).map_err(|err| {
    error(&format!("Unable to create synthesis workspace: {err}"))
  })?;

  for file in &request.files {
    let path = source_dir.join(&file.name);
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent)
        .map_err(|err| error(&format!("Unable to create source folder: {err}")))?;
    }
    fs::write(&path, &file.content)
      .map_err(|err| error(&format!("Unable to write {}: {err}", file.name)))?;
  }

  let json_path = temp_dir.join(format!("{output_name}.json"));
  let script_path = temp_dir.join("synth.ys");
  let script = build_yosys_script(&request, &json_path);

  fs::write(&script_path, &script)
    .map_err(|err| error(&format!("Unable to write synth.ys: {err}")))?;

  let output = Command::new(tool_command("yosys"))
    .arg("-q")
    .arg("-s")
    .arg(script_path.as_os_str())
    .current_dir(&temp_dir)
    .output()
    .map_err(|err| command_launch_error("yosys", &err))?;

  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).to_string();
  let mut logs = vec![
    format!("[synthesis] Board: {}", request.board_name),
    format!("[synthesis] Device: {}", request.fpga_id),
    format!("[synthesis] Input files: {}", request.files.len()),
  ];

  if let Some(top) = &request.top_module {
    logs.push(format!("[synthesis] Requested top: {top}"));
  } else {
    logs.push("[synthesis] Requested top: auto-detect".to_string());
  }

  logs.push(String::new());
  logs.push("[yosys] Command".to_string());
  logs.push("yosys -q -s synth.ys".to_string());

  if !stdout.trim().is_empty() {
    logs.push(String::new());
    logs.push("[yosys] stdout".to_string());
    logs.extend(stdout.lines().map(ToOwned::to_owned));
  }

  if !stderr.trim().is_empty() {
    logs.push(String::new());
    logs.push("[yosys] stderr".to_string());
    logs.extend(stderr.lines().map(ToOwned::to_owned));
  }

  if !output.status.success() {
    let error_details = format_command_error("Yosys", &output.stdout, &output.stderr);
    let _ = fs::remove_dir_all(&temp_dir);
    return Err(error(&error_details));
  }

  let netlist_text = fs::read_to_string(&json_path)
    .map_err(|err| error(&format!("Unable to read generated netlist: {err}")))?;
  let netlist_json: Value = serde_json::from_str(&netlist_text)
    .map_err(|err| error(&format!("Unable to parse generated netlist: {err}")))?;

  let (top_module, nodes, edges) = build_graph(&netlist_json, request.top_module.as_deref())?;
  logs.push(String::new());
  logs.push(format!(
    "[graph] Generated {} nodes and {} edges for {top_module}",
    nodes.len(),
    edges.len()
  ));

  let _ = fs::remove_dir_all(&temp_dir);

  Ok(GenerateSynthesisDiagramResponse {
    logs,
    top_module,
    output_name,
    nodes,
    edges,
  })
}

#[tauri::command]
async fn generate_bitstream(
  request: GenerateBitstreamRequest,
  on_log: Channel<String>,
) -> Result<GenerateBitstreamResponse, ErrorPayload> {
  if request.source_files.is_empty() {
    return Err(error("No HDL files were provided."));
  }

  if request.synthesis_flow != "yosys-nextpnr" {
    return Err(error(
      "Real bitstream generation is currently available for Yosys + NextPNR boards only.",
    ));
  }

  if request
    .source_files
    .iter()
    .any(|file| is_vhdl_file(&file.name))
  {
    return Err(error(
      "VHDL bitstream generation is not wired up yet. Use Verilog or SystemVerilog for now.",
    ));
  }

  let output_name = sanitize_name(&request.project_name);
  let temp_dir = create_work_dir(&output_name)?;
  let source_dir = temp_dir.join("src");
  fs::create_dir_all(&source_dir)
    .map_err(|err| error(&format!("Unable to create bitstream workspace: {err}")))?;

  for file in &request.source_files {
    let path = source_dir.join(&file.name);
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent)
        .map_err(|err| error(&format!("Unable to create source folder: {err}")))?;
    }
    fs::write(&path, &file.content)
      .map_err(|err| error(&format!("Unable to write {}: {err}", file.name)))?;
  }

  let constraint_file_name = sanitize_constraint_name(&request.constraint_file.name);
  let constraint_path = temp_dir.join(&constraint_file_name);
  fs::write(&constraint_path, &request.constraint_file.content).map_err(|err| {
    error(&format!(
      "Unable to write {}: {err}",
      request.constraint_file.name
    ))
  })?;

  let json_path = temp_dir.join(format!("{output_name}.json"));
  let pnr_path = if request.board_family.to_lowercase().contains("ice40") {
    temp_dir.join(format!("{output_name}.asc"))
  } else {
    temp_dir.join(format!("{output_name}.config"))
  };
  let artifact_path_tmp = temp_dir.join(format!("{output_name}.{}", request.output_extension));
  let script_path = temp_dir.join("bitstream.ys");
  let script = build_bitstream_yosys_script(&request, &json_path);
  fs::write(&script_path, &script)
    .map_err(|err| error(&format!("Unable to write bitstream.ys: {err}")))?;

  let mut logs = Vec::new();
  send_log(&on_log, &mut logs, format!("[bitstream] Board: {}", request.board_name));
  send_log(&on_log, &mut logs, format!("[bitstream] Device: {}", request.fpga_id));
  send_log(&on_log, &mut logs, format!("[bitstream] Package: {}", request.board_package));
  send_log(&on_log, &mut logs, format!("[bitstream] Input files: {}", request.source_files.len()));

  let top_module = request
    .top_module
    .clone()
    .unwrap_or_else(|| "top".to_string());
  send_log(&on_log, &mut logs, format!("[bitstream] Top module: {top_module}"));

  send_log(&on_log, &mut logs, "");
  send_log(&on_log, &mut logs, "[yosys] Command");
  send_log(&on_log, &mut logs, "yosys -q -s bitstream.ys");
  let yosys_args = vec![
    "-q".to_string(),
    "-s".to_string(),
    script_path.to_string_lossy().to_string(),
  ];
  let (yosys_status, yosys_stdout, yosys_stderr) =
    run_command_streaming(&tool_command("yosys"), &yosys_args, Some(&temp_dir), &on_log)
      .map_err(|err| command_launch_error("yosys", &err))?;
  append_command_logs(&mut logs, &yosys_stdout, &yosys_stderr);
  if !yosys_status.success() {
    let _ = fs::remove_dir_all(&temp_dir);
    let error_details = format_command_error("Yosys", &yosys_stdout, &yosys_stderr);
    return Err(error(&error_details));
  }

  let (pnr_command, pnr_args) = build_nextpnr_command(
    &request.board_family,
    &request.fpga_id,
    &request.board_package,
    &json_path,
    &constraint_path,
    &pnr_path,
  )?;

  send_log(&on_log, &mut logs, "");
  send_log(&on_log, &mut logs, "[place-and-route] Command");
  send_log(&on_log, &mut logs, format!("{pnr_command} {}", pnr_args.join(" ")));
  let (pnr_status, pnr_stdout, pnr_stderr) =
    run_command_streaming(&tool_command(&pnr_command), &pnr_args, Some(&temp_dir), &on_log)
      .map_err(|err| command_launch_error(&pnr_command, &err))?;
  append_command_logs(&mut logs, &pnr_stdout, &pnr_stderr);
  if !pnr_status.success() {
    let _ = fs::remove_dir_all(&temp_dir);
    let error_details = format_command_error(&pnr_command, &pnr_stdout, &pnr_stderr);
    return Err(error(&error_details));
  }

  let (pack_command, pack_args) =
    build_pack_command(&request.board_family, &pnr_path, &artifact_path_tmp)?;
  send_log(&on_log, &mut logs, "");
  send_log(&on_log, &mut logs, "[pack] Command");
  send_log(&on_log, &mut logs, format!("{pack_command} {}", pack_args.join(" ")));
  let (pack_status, pack_stdout, pack_stderr) =
    run_command_streaming(&tool_command(&pack_command), &pack_args, Some(&temp_dir), &on_log)
      .map_err(|err| command_launch_error(&pack_command, &err))?;
  append_command_logs(&mut logs, &pack_stdout, &pack_stderr);
  if !pack_status.success() {
    let _ = fs::remove_dir_all(&temp_dir);
    let error_details = format_command_error(&pack_command, &pack_stdout, &pack_stderr);
    return Err(error(&error_details));
  }

  let bytes = fs::read(&artifact_path_tmp)
    .map_err(|err| error(&format!("Unable to read generated bitstream: {err}")))?;

  let project_artifact_path = if let Some(project_path) = &request.project_path {
    let build_dir = PathBuf::from(project_path).join("build");
    fs::create_dir_all(&build_dir)
      .map_err(|err| error(&format!("Unable to create build directory: {err}")))?;
    let final_path = build_dir.join(format!("{output_name}.{}", request.output_extension));
    fs::copy(&artifact_path_tmp, &final_path)
      .map_err(|err| error(&format!("Unable to save bitstream into the project: {err}")))?;
    Some(final_path.to_string_lossy().to_string())
  } else {
    None
  };

  send_log(&on_log, &mut logs, "");
  send_log(&on_log, &mut logs, format!("[output] Generated {} bytes", bytes.len()));
  if let Some(path) = &project_artifact_path {
    send_log(&on_log, &mut logs, format!("[output] Saved to {path}"));
  }

  let _ = fs::remove_dir_all(&temp_dir);

  Ok(GenerateBitstreamResponse {
    logs,
    top_module,
    output_name,
    artifact_path: project_artifact_path,
    bytes,
  })
}

#[tauri::command]
async fn simulate_testbench(
  request: SimulateTestbenchRequest,
  on_log: Channel<String>,
) -> Result<SimulateTestbenchResponse, ErrorPayload> {
  if request.source_files.is_empty() {
    return Err(error("No design HDL files were provided."));
  }

  if is_vhdl_file(&request.testbench_file.name)
    || request.source_files.iter().any(|file| is_vhdl_file(&file.name))
  {
    return Err(error(
      "Real testbench simulation is currently wired for Verilog/SystemVerilog through Icarus Verilog. VHDL simulation is not available yet.",
    ));
  }

  let output_name = sanitize_name(&request.project_name);
  let temp_dir = create_work_dir(&format!("{output_name}_sim"))?;
  let source_dir = temp_dir.join("src");
  fs::create_dir_all(&source_dir)
    .map_err(|err| error(&format!("Unable to create simulation workspace: {err}")))?;

  let mut written_files = Vec::new();
  for file in request
    .source_files
    .iter()
    .filter(|file| file.name != request.testbench_file.name)
  {
    let path = source_dir.join(&file.name);
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent)
        .map_err(|err| error(&format!("Unable to create source folder: {err}")))?;
    }
    fs::write(&path, &file.content)
      .map_err(|err| error(&format!("Unable to write {}: {err}", file.name)))?;
    written_files.push(path);
  }

  let testbench_path = source_dir.join(&request.testbench_file.name);
  if let Some(parent) = testbench_path.parent() {
    fs::create_dir_all(parent)
      .map_err(|err| error(&format!("Unable to create testbench folder: {err}")))?;
  }
  fs::write(&testbench_path, &request.testbench_file.content)
    .map_err(|err| error(&format!("Unable to write {}: {err}", request.testbench_file.name)))?;
  written_files.push(testbench_path.clone());

  let executable_path = temp_dir.join("simulation.out");
  let waveform_name = format!("{output_name}.vcd");
  let default_waveform_path = temp_dir.join("waveform.vcd");
  let requested_top = request
    .top_module
    .clone()
    .or_else(|| find_first_verilog_module(&request.testbench_file.content))
    .unwrap_or_else(|| "testbench".to_string());
  let mut logs = Vec::new();
  send_log(&on_log, &mut logs, format!("[simulation] Project: {}", request.project_name));
  send_log(&on_log, &mut logs, format!("[simulation] Testbench: {}", request.testbench_file.name));
  send_log(&on_log, &mut logs, format!("[simulation] Design files: {}", request.source_files.len()));
  send_log(&on_log, &mut logs, format!("[simulation] Top hint: {requested_top}"));

  let mut iverilog_args = vec![
    "-g2012".to_string(),
    "-s".to_string(),
    requested_top.clone(),
    "-o".to_string(),
    executable_path.to_string_lossy().to_string(),
  ];
  iverilog_args.extend(
    written_files
      .iter()
      .map(|path| path.to_string_lossy().to_string()),
  );

  send_log(&on_log, &mut logs, "");
  send_log(&on_log, &mut logs, "[iverilog] Command");
  send_log(&on_log, &mut logs, format!("iverilog {}", iverilog_args.join(" ")));
  let (compile_status, compile_stdout, compile_stderr) =
    run_command_streaming(&tool_command("iverilog"), &iverilog_args, Some(&temp_dir), &on_log)
      .map_err(|err| command_launch_error("iverilog", &err))?;
  append_command_logs(&mut logs, &compile_stdout, &compile_stderr);

  if !compile_status.success() {
    let _ = fs::remove_dir_all(&temp_dir);
    let error_details = format_command_error("Icarus Verilog", &compile_stdout, &compile_stderr);
    return Err(error(&error_details));
  }

  send_log(&on_log, &mut logs, "");
  send_log(&on_log, &mut logs, "[vvp] Command");
  send_log(&on_log, &mut logs, "vvp simulation.out");
  let vvp_args = vec![executable_path.to_string_lossy().to_string()];
  let (run_status, run_stdout, run_stderr) =
    run_command_streaming(&tool_command("vvp"), &vvp_args, Some(&temp_dir), &on_log)
      .map_err(|err| command_launch_error("vvp", &err))?;
  append_command_logs(&mut logs, &run_stdout, &run_stderr);

  if !run_status.success() {
    let _ = fs::remove_dir_all(&temp_dir);
    let error_details = format_command_error("vvp", &run_stdout, &run_stderr);
    return Err(error(&error_details));
  }

  let waveform_path_tmp = find_vcd_file(&temp_dir)?.unwrap_or(default_waveform_path);
  if !waveform_path_tmp.exists() {
    let _ = fs::remove_dir_all(&temp_dir);
    return Err(error(
      "Simulation finished but no VCD waveform was produced. Add $dumpfile(\"waveform.vcd\") and $dumpvars(...) to the testbench.",
    ));
  }

  let vcd = fs::read_to_string(&waveform_path_tmp)
    .map_err(|err| error(&format!("Unable to read generated waveform: {err}")))?;

  let project_waveform_path = if let Some(project_path) = &request.project_path {
    let build_dir = PathBuf::from(project_path).join("sim");
    fs::create_dir_all(&build_dir)
      .map_err(|err| error(&format!("Unable to create simulation output directory: {err}")))?;
    let final_path = build_dir.join(&waveform_name);
    fs::write(&final_path, &vcd)
      .map_err(|err| error(&format!("Unable to save waveform into the project: {err}")))?;
    Some(final_path.to_string_lossy().to_string())
  } else {
    None
  };

  send_log(&on_log, &mut logs, "");
  send_log(&on_log, &mut logs, format!("[output] Waveform bytes: {}", vcd.len()));
  if let Some(path) = &project_waveform_path {
    send_log(&on_log, &mut logs, format!("[output] Saved to {path}"));
  }

  let _ = fs::remove_dir_all(&temp_dir);

  Ok(SimulateTestbenchResponse {
    logs,
    top_module: requested_top,
    waveform_name,
    waveform_path: project_waveform_path,
    vcd,
  })
}

#[derive(Debug, Clone)]
struct DriverRef {
  node_id: String,
}

#[derive(Debug, Clone)]
struct ConsumerRef {
  node_id: String,
}

fn build_graph(
  netlist_json: &Value,
  requested_top: Option<&str>,
) -> Result<(String, Vec<SynthesisDiagramNode>, Vec<SynthesisDiagramEdge>), ErrorPayload> {
  let modules = netlist_json
    .get("modules")
    .and_then(Value::as_object)
    .ok_or_else(|| error("Generated netlist did not include any modules."))?;

  let top_name = if let Some(name) = requested_top {
    if modules.contains_key(name) {
      name.to_string()
    } else {
      modules
        .keys()
        .next()
        .cloned()
        .ok_or_else(|| error("Generated netlist modules were empty."))?
    }
  } else {
    modules
      .iter()
      .find(|(_, module)| module.get("attributes").and_then(|attrs| attrs.get("top")).is_some())
      .map(|(name, _)| name.clone())
      .or_else(|| modules.keys().next().cloned())
      .ok_or_else(|| error("Generated netlist modules were empty."))?
  };

  let module = modules
    .get(&top_name)
    .and_then(Value::as_object)
    .ok_or_else(|| error("Unable to read the synthesized top module."))?;

  let mut nodes = Vec::<SynthesisDiagramNode>::new();
  let mut drivers = HashMap::<String, Vec<DriverRef>>::new();
  let mut consumers = HashMap::<String, Vec<ConsumerRef>>::new();
  let mut bit_labels = BTreeMap::<String, String>::new();
  let mut constant_nodes = BTreeSet::<String>::new();

  if let Some(netnames) = module.get("netnames").and_then(Value::as_object) {
    for (name, net_value) in netnames {
      if let Some(bits) = net_value.get("bits").and_then(Value::as_array) {
        for bit in bits {
          if let Some(key) = bit_key(bit) {
            bit_labels.entry(key).or_insert_with(|| name.clone());
          }
        }
      }
    }
  }

  if let Some(ports) = module.get("ports").and_then(Value::as_object) {
    for (name, port_value) in ports {
      let direction = port_value
        .get("direction")
        .and_then(Value::as_str)
        .unwrap_or("input");
      let node_id = format!("port:{name}");
      let bits = bit_keys(port_value.get("bits"));
      let detail = format!("{direction} port");

      nodes.push(SynthesisDiagramNode {
        id: node_id.clone(),
        label: name.clone(),
        kind: if direction == "input" {
          "input".to_string()
        } else {
          "output".to_string()
        },
        detail,
      });

      for bit in bits {
        if direction == "input" || direction == "inout" {
          drivers
            .entry(bit.clone())
            .or_default()
            .push(DriverRef { node_id: node_id.clone() });
        }
        if direction == "output" || direction == "inout" {
          consumers
            .entry(bit.clone())
            .or_default()
            .push(ConsumerRef { node_id: node_id.clone() });
        }
      }
    }
  }

  if let Some(cells) = module.get("cells").and_then(Value::as_object) {
    for (name, cell_value) in cells {
      let node_id = format!("cell:{name}");
      let cell_type = cell_value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("cell")
        .to_string();

      nodes.push(SynthesisDiagramNode {
        id: node_id.clone(),
        label: compact_cell_label(&cell_type),
        kind: "cell".to_string(),
        detail: cell_type.clone(),
      });

      let port_directions = cell_value
        .get("port_directions")
        .and_then(Value::as_object);
      let connections = cell_value
        .get("connections")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

      for (port_name, bits_value) in connections {
        let direction = port_directions
          .and_then(|dirs| dirs.get(&port_name))
          .and_then(Value::as_str)
          .unwrap_or("input");

        for bit in bit_keys(Some(&bits_value)) {
          if is_constant_key(&bit) {
            if constant_nodes.insert(bit.clone()) {
              nodes.push(SynthesisDiagramNode {
                id: format!("const:{bit}"),
                label: bit.replace("const:", ""),
                kind: "constant".to_string(),
                detail: "constant".to_string(),
              });
            }
          }

          if direction == "output" || direction == "inout" {
            drivers
              .entry(bit.clone())
              .or_default()
              .push(DriverRef { node_id: node_id.clone() });
          }
          if direction == "input" || direction == "inout" {
            consumers
              .entry(bit.clone())
              .or_default()
              .push(ConsumerRef { node_id: node_id.clone() });
          }
        }
      }
    }
  }

  for constant in constant_nodes {
    drivers
      .entry(constant.clone())
      .or_default()
      .push(DriverRef {
        node_id: format!("const:{constant}"),
      });
  }

  let mut edge_set = BTreeSet::<(String, String, String)>::new();

  for (bit, bit_drivers) in &drivers {
    if let Some(bit_consumers) = consumers.get(bit) {
      let label = bit_labels
        .get(bit)
        .cloned()
        .unwrap_or_else(|| display_bit_label(bit));

      for driver in bit_drivers {
        for consumer in bit_consumers {
          if driver.node_id != consumer.node_id {
            edge_set.insert((
              driver.node_id.clone(),
              consumer.node_id.clone(),
              label.clone(),
            ));
          }
        }
      }
    }
  }

  let edges = edge_set
    .into_iter()
    .map(|(from, to, label)| SynthesisDiagramEdge { from, to, label })
    .collect();

  Ok((top_name, nodes, edges))
}

fn compact_cell_label(cell_type: &str) -> String {
  cell_type
    .trim_start_matches('$')
    .trim_start_matches('\\')
    .replace("_TECHMAP_REPLACE_", "")
}

fn bit_keys(bits: Option<&Value>) -> Vec<String> {
  bits
    .and_then(Value::as_array)
    .map(|items| items.iter().filter_map(bit_key).collect())
    .unwrap_or_default()
}

fn bit_key(bit: &Value) -> Option<String> {
  if let Some(number) = bit.as_i64() {
    return Some(format!("bit:{number}"));
  }
  if let Some(text) = bit.as_str() {
    return Some(format!("const:{text}"));
  }
  None
}

fn display_bit_label(bit: &str) -> String {
  bit
    .strip_prefix("bit:")
    .map(|value| format!("net {value}"))
    .or_else(|| bit.strip_prefix("const:").map(|value| format!("const {value}")))
    .unwrap_or_else(|| bit.to_string())
}

fn is_constant_key(bit: &str) -> bool {
  bit.starts_with("const:")
}

fn create_work_dir(output_name: &str) -> Result<PathBuf, ErrorPayload> {
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|err| error(&format!("Unable to read system time: {err}")))?
    .as_millis();
  let work_dir = std::env::temp_dir().join(format!(
    "allora-synth-{}-{timestamp}-{}",
    output_name,
    std::process::id()
  ));
  fs::create_dir_all(&work_dir)
    .map_err(|err| error(&format!("Unable to create temporary work directory: {err}")))?;
  Ok(work_dir)
}

fn collect_workspace_files(
  root: &Path,
  current: &Path,
  files: &mut Vec<WorkspaceFileContentRecord>,
) -> Result<(), ErrorPayload> {
  let entries = fs::read_dir(current)
    .map_err(|err| error(&format!("Unable to read {}: {err}", current.display())))?;

  for entry in entries {
    let entry = entry.map_err(|err| error(&format!("Unable to read workspace entry: {err}")))?;
    let path = entry.path();
    let file_type = entry
      .file_type()
      .map_err(|err| error(&format!("Unable to inspect {}: {err}", path.display())))?;

    if file_type.is_dir() {
      collect_workspace_files(root, &path, files)?;
      continue;
    }

    if !file_type.is_file() {
      continue;
    }

    let content = fs::read_to_string(&path)
      .unwrap_or_else(|_| String::from("[binary or unreadable file omitted]"));
    let binary = content == "[binary or unreadable file omitted]";
    let relative_path = path
      .strip_prefix(root)
      .map_err(|err| error(&format!("Unable to compute relative path: {err}")))?
      .to_string_lossy()
      .replace('\\', "/");

    files.push(WorkspaceFileContentRecord {
      relative_path,
      absolute_path: path.to_string_lossy().to_string(),
      content,
      binary,
    });
  }

  Ok(())
}

fn unique_project_dir(base_dir: &Path, project_name: &str) -> Result<PathBuf, ErrorPayload> {
  let mut candidate = base_dir.join(project_name);
  let mut index = 2;

  while candidate.exists() {
    candidate = base_dir.join(format!("{project_name}-{index}"));
    index += 1;
  }

  Ok(candidate)
}

fn normalize_relative_path(relative_path: &str) -> Result<PathBuf, ErrorPayload> {
  let path = PathBuf::from(relative_path);

  if path.is_absolute() {
    return Err(error("Project file paths must be relative."));
  }

  if path
    .components()
    .any(|component| matches!(component, std::path::Component::ParentDir))
  {
    return Err(error("Project file paths cannot escape the workspace."));
  }

  Ok(path)
}

fn build_yosys_script(
  request: &GenerateSynthesisDiagramRequest,
  json_path: &Path,
) -> String {
  let mut lines = Vec::<String>::new();

  for file in &request.files {
    let escaped = format!("src/{}", file.name);
    if file.name.ends_with(".sv") {
      lines.push(format!("read_verilog -sv {escaped}"));
    } else {
      lines.push(format!("read_verilog {escaped}"));
    }
  }

  if let Some(top) = &request.top_module {
    lines.push(format!("hierarchy -check -top {top}"));
  } else {
    lines.push("hierarchy -check -auto-top".to_string());
  }

  lines.push("proc".to_string());
  lines.push("opt".to_string());
  lines.push("fsm".to_string());
  lines.push("opt".to_string());
  lines.push("memory".to_string());
  lines.push("opt".to_string());

  let top_arg = request
    .top_module
    .as_deref()
    .map(|top| format!("-top {top} "))
    .unwrap_or_default();

  if request.board_family.to_lowercase().contains("ice40") {
    lines.push(format!("synth_ice40 {top_arg}-json {}", json_path.display()));
  } else if request.board_family.to_lowercase().contains("ecp5") {
    lines.push(format!("synth_ecp5 {top_arg}-json {}", json_path.display()));
  } else {
    lines.push(format!("synth {top_arg}"));
    lines.push(format!("write_json {}", json_path.display()));
  }

  lines.join("\n")
}

fn build_bitstream_yosys_script(
  request: &GenerateBitstreamRequest,
  json_path: &Path,
) -> String {
  let mut lines = Vec::<String>::new();

  for file in &request.source_files {
    let escaped = format!("src/{}", file.name);
    if file.name.ends_with(".sv") {
      lines.push(format!("read_verilog -sv {escaped}"));
    } else {
      lines.push(format!("read_verilog {escaped}"));
    }
  }

  if let Some(top) = &request.top_module {
    lines.push(format!("hierarchy -check -top {top}"));
  } else {
    lines.push("hierarchy -check -auto-top".to_string());
  }

  lines.push("proc".to_string());
  lines.push("opt".to_string());
  lines.push("fsm".to_string());
  lines.push("opt".to_string());
  lines.push("memory".to_string());
  lines.push("opt".to_string());

  let top_arg = request
    .top_module
    .as_deref()
    .map(|top| format!("-top {top} "))
    .unwrap_or_default();

  if request.board_family.to_lowercase().contains("ice40") {
    lines.push(format!("synth_ice40 {top_arg}-json {}", json_path.display()));
  } else if request.board_family.to_lowercase().contains("ecp5") {
    lines.push(format!("synth_ecp5 {top_arg}-json {}", json_path.display()));
  } else {
    lines.push(format!("synth {top_arg}"));
    lines.push(format!("write_json {}", json_path.display()));
  }

  lines.join("\n")
}

fn build_nextpnr_command(
  board_family: &str,
  fpga_id: &str,
  board_package: &str,
  json_path: &Path,
  constraint_path: &Path,
  output_path: &Path,
) -> Result<(String, Vec<String>), ErrorPayload> {
  let family = board_family.to_lowercase();
  let fpga = fpga_id.to_lowercase();

  if family.contains("ice40") {
    let device_flag = if fpga.contains("up5k") {
      "--up5k"
    } else if fpga.contains("lp8k") {
      "--lp8k"
    } else if fpga.contains("hx8k") {
      "--hx8k"
    } else if fpga.contains("lp1k") {
      "--lp1k"
    } else if fpga.contains("hx1k") {
      "--hx1k"
    } else {
      return Err(error("Unsupported iCE40 device for nextpnr-ice40."));
    };

    let package = fpga
      .rsplit('-')
      .next()
      .map(str::to_string)
      .unwrap_or_else(|| board_package.to_lowercase());

    return Ok((
      "nextpnr-ice40".to_string(),
      vec![
        device_flag.to_string(),
        "--package".to_string(),
        package,
        "--json".to_string(),
        json_path.display().to_string(),
        "--pcf".to_string(),
        constraint_path.display().to_string(),
        "--asc".to_string(),
        output_path.display().to_string(),
      ],
    ));
  }

  if family.contains("ecp5") {
    let size_flag = if fpga.contains("12f") {
      "--12k"
    } else if fpga.contains("25f") {
      "--25k"
    } else if fpga.contains("45f") {
      "--45k"
    } else if fpga.contains("85f") {
      "--85k"
    } else {
      return Err(error("Unsupported ECP5 device for nextpnr-ecp5."));
    };

    let package = fpga
      .rsplit('-')
      .next()
      .map(|value| value.to_uppercase())
      .unwrap_or_else(|| board_package.to_uppercase());
    let package = normalize_ecp5_package(&package);

    return Ok((
      "nextpnr-ecp5".to_string(),
      vec![
        size_flag.to_string(),
        "--package".to_string(),
        package,
        "--json".to_string(),
        json_path.display().to_string(),
        "--lpf".to_string(),
        constraint_path.display().to_string(),
        "--lpf-allow-unconstrained".to_string(),
        "--textcfg".to_string(),
        output_path.display().to_string(),
      ],
    ));
  }

  Err(error(
    "Real bitstream generation is currently only wired up for iCE40 and ECP5 boards.",
  ))
}

fn normalize_ecp5_package(package: &str) -> String {
  match package.to_uppercase().as_str() {
    "BG256" | "BG256C" => "CABGA256".to_string(),
    "BG381" | "BG381C" => "CABGA381".to_string(),
    "BG554" | "BG554I" => "CABGA554".to_string(),
    "BG756" | "BG756C" => "CABGA756".to_string(),
    value => value.to_string(),
  }
}

fn build_pack_command(
  board_family: &str,
  pnr_path: &Path,
  artifact_path: &Path,
) -> Result<(String, Vec<String>), ErrorPayload> {
  let family = board_family.to_lowercase();

  if family.contains("ice40") {
    return Ok((
      "icepack".to_string(),
      vec![
        pnr_path.display().to_string(),
        artifact_path.display().to_string(),
      ],
    ));
  }

  if family.contains("ecp5") {
    return Ok((
      "ecppack".to_string(),
      vec![
        pnr_path.display().to_string(),
        artifact_path.display().to_string(),
      ],
    ));
  }

  Err(error("No pack tool is configured for this board family."))
}

fn format_command_error(command: &str, stdout: &[u8], stderr: &[u8]) -> String {
  let stderr_text = String::from_utf8_lossy(stderr).to_string();
  let stdout_text = String::from_utf8_lossy(stdout).to_string();

  let error_output = if !stderr_text.trim().is_empty() {
    &stderr_text
  } else {
    &stdout_text
  };

  let first_error_line = error_output
    .lines()
    .find(|line| {
      let lower = line.to_lowercase();
      lower.contains("error") || lower.contains("fatal") || lower.contains("syntax")
    })
    .unwrap_or_else(|| error_output.lines().next().unwrap_or("Unknown error"));

  format!("{} failed: {}", command, first_error_line)
}

fn command_launch_error(command: &str, err: &io::Error) -> ErrorPayload {
  if err.kind() == io::ErrorKind::NotFound {
    return error(&format!(
      "{command} is not installed or is not available on PATH. This board has an app-supported flow, but synthesis and bitstream generation still require the local FPGA toolchain: yosys, nextpnr, and the board packer."
    ));
  }

  error(&format!("Unable to launch {command}: {err}"))
}

fn tool_command(command: &str) -> PathBuf {
  let path = PathBuf::from(command);
  if path.components().count() > 1 {
    return path;
  }

  for tool_dir in ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"] {
    let candidate = Path::new(tool_dir).join(command);
    if candidate.exists() {
      return candidate;
    }
  }

  PathBuf::from(command)
}

fn append_command_logs(logs: &mut Vec<String>, stdout: &[u8], stderr: &[u8]) {
  let stdout = String::from_utf8_lossy(stdout).to_string();
  let stderr = String::from_utf8_lossy(stderr).to_string();

  if !stdout.trim().is_empty() {
    logs.push(String::new());
    logs.push("[stdout]".to_string());
    logs.extend(stdout.lines().map(ToOwned::to_owned));
  }

  if !stderr.trim().is_empty() {
    logs.push(String::new());
    logs.push("[stderr]".to_string());
    logs.extend(stderr.lines().map(ToOwned::to_owned));
  }
}

/// Push a log line into the response log buffer and stream it to the frontend.
fn send_log(on_log: &Channel<String>, logs: &mut Vec<String>, line: impl Into<String>) {
  let line = line.into();
  let _ = on_log.send(line.clone());
  logs.push(line);
}

/// Run a command with stdout/stderr streamed line-by-line over the channel
/// while also collecting the full output for the final response.
fn run_command_streaming(
  program: &Path,
  args: &[String],
  cwd: Option<&Path>,
  on_log: &Channel<String>,
) -> io::Result<(std::process::ExitStatus, Vec<u8>, Vec<u8>)> {
  let mut command = Command::new(program);
  command.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
  if let Some(cwd) = cwd {
    command.current_dir(cwd);
  }

  let mut child = command.spawn()?;
  let stdout = child.stdout.take();
  let stderr = child.stderr.take();

  let stdout_channel = on_log.clone();
  let stdout_thread = thread::spawn(move || {
    let mut collected = Vec::new();
    if let Some(stream) = stdout {
      for line in BufReader::new(stream).lines().map_while(Result::ok) {
        let _ = stdout_channel.send(line.clone());
        collected.extend_from_slice(line.as_bytes());
        collected.push(b'\n');
      }
    }
    collected
  });

  let stderr_channel = on_log.clone();
  let stderr_thread = thread::spawn(move || {
    let mut collected = Vec::new();
    if let Some(stream) = stderr {
      for line in BufReader::new(stream).lines().map_while(Result::ok) {
        let _ = stderr_channel.send(line.clone());
        collected.extend_from_slice(line.as_bytes());
        collected.push(b'\n');
      }
    }
    collected
  });

  let status = child.wait()?;
  let stdout_bytes = stdout_thread.join().unwrap_or_default();
  let stderr_bytes = stderr_thread.join().unwrap_or_default();

  Ok((status, stdout_bytes, stderr_bytes))
}

fn sanitize_constraint_name(name: &str) -> String {
  let path = PathBuf::from(name);
  path
    .file_name()
    .and_then(|value| value.to_str())
    .map(ToOwned::to_owned)
    .unwrap_or_else(|| "constraints.pcf".to_string())
}

fn find_vcd_file(root: &Path) -> Result<Option<PathBuf>, ErrorPayload> {
  let mut stack = vec![root.to_path_buf()];

  while let Some(path) = stack.pop() {
    let entries = fs::read_dir(&path)
      .map_err(|err| error(&format!("Unable to inspect simulation output: {err}")))?;

    for entry in entries {
      let entry = entry
        .map_err(|err| error(&format!("Unable to inspect simulation output: {err}")))?;
      let entry_path = entry.path();

      if entry_path.is_dir() {
        stack.push(entry_path);
        continue;
      }

      if entry_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("vcd"))
      {
        return Ok(Some(entry_path));
      }
    }
  }

  Ok(None)
}

fn find_first_verilog_module(content: &str) -> Option<String> {
  let mut tokens = content
    .split(|character: char| !(character.is_ascii_alphanumeric() || character == '_' || character == '$'));

  while let Some(token) = tokens.next() {
    if token == "module" {
      return tokens
        .find(|candidate| !candidate.is_empty())
        .map(ToOwned::to_owned);
    }
  }

  None
}

fn is_vhdl_file(name: &str) -> bool {
  name.ends_with(".vhd") || name.ends_with(".vhdl")
}

fn sanitize_name(name: &str) -> String {
  let trimmed = name.trim();
  let sanitized = trimmed
    .chars()
    .map(|character| {
      if character.is_ascii_alphanumeric() || character == '_' {
        character
      } else {
        '_'
      }
    })
    .collect::<String>()
    .trim_matches('_')
    .to_string();

  if sanitized.is_empty() {
    "allora_project".to_string()
  } else {
    sanitized
  }
}

fn error(message: &str) -> ErrorPayload {
  ErrorPayload {
    message: message.to_string(),
  }
}

#[tauri::command]
fn create_project_workspace(
  request: CreateProjectWorkspaceRequest,
) -> Result<CreateProjectWorkspaceResponse, ErrorPayload> {
  let parent = request
    .parent_directory
    .as_deref()
    .map(PathBuf::from)
    .unwrap_or_else(|| {
      std::env::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("AlloraProjects")
    });

  fs::create_dir_all(&parent)
    .map_err(|err| error(&format!("Unable to create parent directory: {err}")))?;

  let project_dir = unique_project_dir(&parent, &request.folder_name)?;

  fs::create_dir_all(&project_dir)
    .map_err(|err| error(&format!("Unable to create project directory: {err}")))?;

  let mut files = Vec::new();

  for file_spec in &request.files {
    let relative = normalize_relative_path(&file_spec.relative_path)?;
    let absolute = project_dir.join(&relative);

    if let Some(parent_dir) = absolute.parent() {
      fs::create_dir_all(parent_dir)
        .map_err(|err| error(&format!("Unable to create file directory: {err}")))?;
    }

    fs::write(&absolute, &file_spec.content)
      .map_err(|err| error(&format!("Unable to write {}: {err}", file_spec.relative_path)))?;

    files.push(WorkspaceFileRecord {
      relative_path: file_spec.relative_path.clone(),
      absolute_path: absolute.to_string_lossy().to_string(),
    });
  }

  let project_id = sanitize_name(&request.project_name);

  Ok(CreateProjectWorkspaceResponse {
    project_id,
    project_path: project_dir.to_string_lossy().to_string(),
    files,
  })
}

#[tauri::command]
fn pick_project_parent_directory() -> Result<Option<String>, ErrorPayload> {
  #[cfg(target_os = "macos")]
  {
    let output = Command::new("osascript")
      .args([
        "-e",
        "set chosenFolder to choose folder with prompt \"Choose a parent directory for your project\"",
        "-e",
        "POSIX path of chosenFolder",
      ])
      .output()
      .map_err(|err| error(&format!("Unable to open the folder picker: {err}")))?;

    if !output.status.success() {
      return Ok(None);
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
      Ok(None)
    } else {
      Ok(Some(path))
    }
  }

  #[cfg(not(target_os = "macos"))]
  {
    Ok(None)
  }
}

// ── HDL Linting ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LintHdlRequest {
  files: Vec<SynthesisInputFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LintDiagnostic {
  file_name: String,
  line: u32,
  severity: String,
  message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LintHdlResponse {
  available: bool,
  diagnostics: Vec<LintDiagnostic>,
}

#[tauri::command]
async fn lint_hdl(request: LintHdlRequest) -> Result<LintHdlResponse, ErrorPayload> {
  if request.files.is_empty() {
    return Ok(LintHdlResponse {
      available: true,
      diagnostics: Vec::new(),
    });
  }

  let temp_dir = create_work_dir("lint")?;
  let source_dir = temp_dir.join("src");
  fs::create_dir_all(&source_dir)
    .map_err(|err| error(&format!("Unable to create lint workspace: {err}")))?;

  let mut file_args = Vec::new();
  for file in &request.files {
    let relative = normalize_relative_path(&file.name)?;
    let path = source_dir.join(&relative);
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent)
        .map_err(|err| error(&format!("Unable to create lint folder: {err}")))?;
    }
    fs::write(&path, &file.content)
      .map_err(|err| error(&format!("Unable to write {}: {err}", file.name)))?;
    file_args.push(format!("src/{}", file.name));
  }

  let mut args = vec!["-t".to_string(), "null".to_string(), "-g2012".to_string()];
  args.extend(file_args);

  let output = Command::new(tool_command("iverilog"))
    .args(&args)
    .current_dir(&temp_dir)
    .output();

  let _ = fs::remove_dir_all(&temp_dir);

  match output {
    Ok(result) => {
      let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
      );
      Ok(LintHdlResponse {
        available: true,
        diagnostics: parse_iverilog_diagnostics(&combined),
      })
    }
    Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(LintHdlResponse {
      available: false,
      diagnostics: Vec::new(),
    }),
    Err(err) => Err(error(&format!("Unable to run iverilog: {err}"))),
  }
}

fn parse_iverilog_diagnostics(output: &str) -> Vec<LintDiagnostic> {
  let mut diagnostics = Vec::new();
  let mut seen = BTreeSet::new();

  for line in output.lines() {
    // Expected shape: "src/counter.v:12: error: message" or "src/counter.v:3: syntax error"
    let mut parts = line.splitn(3, ':');
    let Some(raw_path) = parts.next() else { continue };
    let Some(raw_line) = parts.next() else { continue };
    let Some(raw_message) = parts.next() else { continue };

    let Ok(line_number) = raw_line.trim().parse::<u32>() else {
      continue;
    };

    let file_name = raw_path
      .trim()
      .trim_start_matches("src/")
      .to_string();
    let message = raw_message.trim().to_string();
    if message.is_empty() {
      continue;
    }

    let lower = message.to_lowercase();
    let severity = if lower.starts_with("warning") || lower.contains("sorry") {
      "warning"
    } else {
      "error"
    };
    let message = message
      .trim_start_matches("error:")
      .trim_start_matches("warning:")
      .trim()
      .to_string();

    let key = (file_name.clone(), line_number, message.clone());
    if seen.insert(key) {
      diagnostics.push(LintDiagnostic {
        file_name,
        line: line_number,
        severity: severity.to_string(),
        message,
      });
    }
  }

  diagnostics
}

// ── Serial Monitor ───────────────────────────────────────────────────────

struct SerialSession {
  port: Box<dyn serialport::SerialPort>,
  stop: Arc<AtomicBool>,
}

#[derive(Default)]
struct SerialState {
  sessions: Mutex<HashMap<u32, SerialSession>>,
  next_id: AtomicU32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerialPortRecord {
  port_name: String,
  description: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenSerialMonitorRequest {
  port_name: String,
  baud_rate: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteSerialMonitorRequest {
  session_id: u32,
  data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloseSerialMonitorRequest {
  session_id: u32,
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<SerialPortRecord>, ErrorPayload> {
  let ports = serialport::available_ports()
    .map_err(|err| error(&format!("Unable to list serial ports: {err}")))?;

  Ok(
    ports
      .into_iter()
      .map(|port| {
        let description = match &port.port_type {
          serialport::SerialPortType::UsbPort(info) => {
            let manufacturer = info.manufacturer.clone().unwrap_or_default();
            let product = info.product.clone().unwrap_or_default();
            let text = format!("{manufacturer} {product}").trim().to_string();
            if text.is_empty() {
              "USB serial device".to_string()
            } else {
              text
            }
          }
          serialport::SerialPortType::BluetoothPort => "Bluetooth".to_string(),
          serialport::SerialPortType::PciPort => "PCI".to_string(),
          serialport::SerialPortType::Unknown => String::new(),
        };

        SerialPortRecord {
          port_name: port.port_name,
          description,
        }
      })
      .collect(),
  )
}

#[tauri::command]
fn open_serial_monitor(
  request: OpenSerialMonitorRequest,
  on_data: Channel<String>,
  state: State<'_, SerialState>,
) -> Result<u32, ErrorPayload> {
  let port = serialport::new(&request.port_name, request.baud_rate)
    .timeout(Duration::from_millis(100))
    .open()
    .map_err(|err| error(&format!("Unable to open {}: {err}", request.port_name)))?;

  let mut reader = port
    .try_clone()
    .map_err(|err| error(&format!("Unable to read from {}: {err}", request.port_name)))?;

  let stop = Arc::new(AtomicBool::new(false));
  let session_id = state.next_id.fetch_add(1, Ordering::SeqCst) + 1;

  state
    .sessions
    .lock()
    .map_err(|_| error("Serial session state is unavailable."))?
    .insert(
      session_id,
      SerialSession {
        port,
        stop: stop.clone(),
      },
    );

  thread::spawn(move || {
    let mut buffer = [0u8; 1024];
    loop {
      if stop.load(Ordering::SeqCst) {
        break;
      }

      match reader.read(&mut buffer) {
        Ok(0) => {}
        Ok(count) => {
          let _ = on_data.send(String::from_utf8_lossy(&buffer[..count]).to_string());
        }
        Err(err) if err.kind() == io::ErrorKind::TimedOut => {}
        Err(err) if err.kind() == io::ErrorKind::Interrupted => {}
        Err(_) => {
          if !stop.load(Ordering::SeqCst) {
            let _ = on_data.send("\n[serial] Connection lost.\n".to_string());
          }
          break;
        }
      }
    }
  });

  Ok(session_id)
}

#[tauri::command]
fn write_serial_monitor(
  request: WriteSerialMonitorRequest,
  state: State<'_, SerialState>,
) -> Result<(), ErrorPayload> {
  let mut sessions = state
    .sessions
    .lock()
    .map_err(|_| error("Serial session state is unavailable."))?;
  let session = sessions
    .get_mut(&request.session_id)
    .ok_or_else(|| error("The serial connection is no longer open."))?;

  session
    .port
    .write_all(request.data.as_bytes())
    .map_err(|err| error(&format!("Unable to write to the serial port: {err}")))?;
  Ok(())
}

#[tauri::command]
fn close_serial_monitor(
  request: CloseSerialMonitorRequest,
  state: State<'_, SerialState>,
) -> Result<(), ErrorPayload> {
  let session = state
    .sessions
    .lock()
    .map_err(|_| error("Serial session state is unavailable."))?
    .remove(&request.session_id);

  if let Some(session) = session {
    session.stop.store(true, Ordering::SeqCst);
  }

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(SerialState::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      create_project_workspace,
      pick_project_parent_directory,
      pick_existing_project_directory,
      read_project_workspace,
      write_project_file,
      rename_project_file,
      delete_project_file,
      generate_synthesis_diagram,
      generate_bitstream,
      simulate_testbench,
      detect_programmer,
      detect_connected_board,
      program_fpga,
      lint_hdl,
      list_serial_ports,
      open_serial_monitor,
      write_serial_monitor,
      close_serial_monitor
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
