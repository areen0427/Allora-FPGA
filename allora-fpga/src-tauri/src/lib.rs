use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

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

  let output = Command::new("yosys")
    .arg("-q")
    .arg("-s")
    .arg(script_path.as_os_str())
    .current_dir(&temp_dir)
    .output()
    .map_err(|err| error(&format!("Unable to launch yosys: {err}")))?;

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
    return Err(error(&format!(
      "Yosys exited with status {}.",
      output.status
    )));
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
    .invoke_handler(tauri::generate_handler![generate_synthesis_diagram])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
