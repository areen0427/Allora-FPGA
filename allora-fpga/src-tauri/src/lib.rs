use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

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

#[tauri::command]
fn create_project_workspace(
  app: AppHandle,
  request: CreateProjectWorkspaceRequest,
) -> Result<CreateProjectWorkspaceResponse, ErrorPayload> {
  if request.files.is_empty() {
    return Err(error("No project files were provided."));
  }

  let base_dir = if let Some(parent_directory) = request.parent_directory.as_deref() {
    PathBuf::from(parent_directory)
  } else {
    let documents_dir = app
      .path()
      .document_dir()
      .map_err(|err| error(&format!("Unable to locate the documents directory: {err}")))?;
    documents_dir.join("Allora FPGA Projects")
  };
  fs::create_dir_all(&base_dir)
    .map_err(|err| error(&format!("Unable to create the projects directory: {err}")))?;

  let project_name = sanitize_name(&request.project_name);
  let folder_name = sanitize_name(&request.folder_name);
  let project_id = format!(
    "{}-{}",
    project_name,
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map_err(|err| error(&format!("Unable to read system time: {err}")))?
      .as_millis()
  );

  let project_path = unique_project_dir(&base_dir, &folder_name)?;
  fs::create_dir_all(&project_path)
    .map_err(|err| error(&format!("Unable to create the project directory: {err}")))?;

  let mut files = Vec::with_capacity(request.files.len());
  for file in request.files {
    let relative_path = normalize_relative_path(&file.relative_path)?;
    let absolute_path = project_path.join(&relative_path);

    if let Some(parent) = absolute_path.parent() {
      fs::create_dir_all(parent)
        .map_err(|err| error(&format!("Unable to create file directory: {err}")))?;
    }

    fs::write(&absolute_path, file.content)
      .map_err(|err| error(&format!("Unable to write {}: {err}", relative_path.display())))?;

    files.push(WorkspaceFileRecord {
      relative_path: relative_path.to_string_lossy().to_string(),
      absolute_path: absolute_path.to_string_lossy().to_string(),
    });
  }

  Ok(CreateProjectWorkspaceResponse {
    project_id,
    project_path: project_path.to_string_lossy().to_string(),
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
        "set chosenFolder to choose folder with prompt \"Choose where to create the project folder\"",
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
  message: String,
}

#[tauri::command]
fn generate_synthesis_diagram(
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
fn generate_bitstream(
  request: GenerateBitstreamRequest,
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

  let mut logs = vec![
    format!("[bitstream] Board: {}", request.board_name),
    format!("[bitstream] Device: {}", request.fpga_id),
    format!("[bitstream] Package: {}", request.board_package),
    format!("[bitstream] Input files: {}", request.source_files.len()),
  ];

  let top_module = request
    .top_module
    .clone()
    .unwrap_or_else(|| "top".to_string());
  logs.push(format!("[bitstream] Top module: {top_module}"));

  let yosys_output = Command::new(tool_command("yosys"))
    .arg("-q")
    .arg("-s")
    .arg(script_path.as_os_str())
    .current_dir(&temp_dir)
    .output()
    .map_err(|err| command_launch_error("yosys", &err))?;
  logs.push(String::new());
  logs.push("[yosys] Command".to_string());
  logs.push("yosys -q -s bitstream.ys".to_string());
  append_command_logs(&mut logs, &yosys_output.stdout, &yosys_output.stderr);
  if !yosys_output.status.success() {
    let _ = fs::remove_dir_all(&temp_dir);
    let error_details = format_command_error("Yosys", &yosys_output.stdout, &yosys_output.stderr);
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

  let pnr_output = Command::new(tool_command(&pnr_command))
    .args(&pnr_args)
    .current_dir(&temp_dir)
    .output()
    .map_err(|err| command_launch_error(&pnr_command, &err))?;
  logs.push(String::new());
  logs.push("[place-and-route] Command".to_string());
  logs.push(format!("{pnr_command} {}", pnr_args.join(" ")));
  append_command_logs(&mut logs, &pnr_output.stdout, &pnr_output.stderr);
  if !pnr_output.status.success() {
    let _ = fs::remove_dir_all(&temp_dir);
    let error_details = format_command_error(&pnr_command, &pnr_output.stdout, &pnr_output.stderr);
    return Err(error(&error_details));
  }

  let (pack_command, pack_args) =
    build_pack_command(&request.board_family, &pnr_path, &artifact_path_tmp)?;
  let pack_output = Command::new(tool_command(&pack_command))
    .args(&pack_args)
    .current_dir(&temp_dir)
    .output()
    .map_err(|err| command_launch_error(&pack_command, &err))?;
  logs.push(String::new());
  logs.push("[pack] Command".to_string());
  logs.push(format!("{pack_command} {}", pack_args.join(" ")));
  append_command_logs(&mut logs, &pack_output.stdout, &pack_output.stderr);
  if !pack_output.status.success() {
    let _ = fs::remove_dir_all(&temp_dir);
    let error_details = format_command_error(&pack_command, &pack_output.stdout, &pack_output.stderr);
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

  logs.push(String::new());
  logs.push(format!(
    "[output] Generated {} bytes",
    bytes.len()
  ));
  if let Some(path) = &project_artifact_path {
    logs.push(format!("[output] Saved to {path}"));
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

fn sanitize_constraint_name(name: &str) -> String {
  let path = PathBuf::from(name);
  path
    .file_name()
    .and_then(|value| value.to_str())
    .map(ToOwned::to_owned)
    .unwrap_or_else(|| "constraints.pcf".to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
      generate_bitstream
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
