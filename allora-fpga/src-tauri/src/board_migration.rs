//! Snapshot-bound board migration copies. The source project is never written.
use crate::virtual_fpga::{discover_ports_with_project, RtlPort, SimulationSourceFile};
use crate::{error, ErrorPayload};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};

const MAX_FILES: usize = 4096;
const MAX_BYTES: u64 = 256 * 1024 * 1024;
const MAX_TEXT: usize = 2 * 1024 * 1024;
const MAX_TEXT_TOTAL: usize = 16 * 1024 * 1024;

/// Both GUI and MCP builds use this gate, including calls made outside frontend preflight.
pub(crate) fn require_completed_review(project_path: Option<&str>) -> Result<(), ErrorPayload> {
    let Some(project_path) = project_path else {
        return Ok(());
    };
    let path = Path::new(project_path).join("allora-project.json");
    if !path.exists() {
        return Ok(());
    }
    let content =
        fs::read(&path).map_err(|e| error(&format!("Cannot read project metadata: {e}")))?;
    let metadata: serde_json::Value = serde_json::from_slice(&content)
        .map_err(|_| error("Repair project metadata before building."))?;
    if let Some(report) = metadata
        .get("boardMigration")
        .filter(|report| !report.is_null())
    {
        if report["schemaVersion"].as_u64() != Some(1)
            || report["requiresReview"].as_bool() != Some(false)
            || report["targetBoardId"].as_str() != metadata["boardId"].as_str()
        {
            return Err(error("Complete the manual review in Board Migration Assistant before generating a bitstream."));
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationFile {
    relative_path: String,
    size: u64,
    sha256: String,
    content: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationSnapshot {
    project_path: String,
    fingerprint: String,
    files: Vec<MigrationFile>,
    directories: Vec<String>,
    top_module: String,
    ports: Vec<RtlPort>,
    port_error: Option<String>,
    excluded: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectRequest {
    project_path: String,
    top_module: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationPatch {
    relative_path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyRequest {
    project_path: String,
    fingerprint: String,
    folder_name: String,
    parent_directory: Option<String>,
    patches: Vec<MigrationPatch>,
    archive_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyResult {
    project_path: String,
    file_count: usize,
    excluded: Vec<String>,
}

fn relative_path(value: &str) -> Result<PathBuf, ErrorPayload> {
    let path = Path::new(value);
    if value.is_empty()
        || value.contains('\\')
        || path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || value
            .split('/')
            .any(|part| matches!(part, ".git" | "." | ".." | ""))
        || matches!(
            value.split('/').next(),
            Some("build" | "node_modules" | "target")
        )
    {
        return Err(error(
            "Migration paths must stay inside the copied project.",
        ));
    }
    Ok(path.to_path_buf())
}

fn project_root(value: &str) -> Result<PathBuf, ErrorPayload> {
    let path = Path::new(value);
    let metadata =
        fs::symlink_metadata(path).map_err(|e| error(&format!("Cannot inspect project: {e}")))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(error(
            "Choose a real project directory, not a symbolic link.",
        ));
    }
    path.canonicalize()
        .map_err(|e| error(&format!("Cannot resolve project: {e}")))
}

fn scan(root: &Path) -> Result<MigrationSnapshot, ErrorPayload> {
    fn walk(
        root: &Path,
        dir: &Path,
        result: &mut MigrationSnapshot,
        total: &mut u64,
        text: &mut usize,
    ) -> Result<(), ErrorPayload> {
        let mut entries = fs::read_dir(dir)
            .map_err(|e| error(&format!("Cannot read project: {e}")))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| error(&format!("Cannot read project entry: {e}")))?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let path = entry.path();
            let relative = path
                .strip_prefix(root)
                .map_err(|_| error("Project path escaped its root."))?
                .to_str()
                .ok_or_else(|| error("Migration needs UTF-8 project paths."))?
                .replace('\\', "/");
            if entry.file_name() == ".git"
                || (dir == root
                    && matches!(
                        entry.file_name().to_str(),
                        Some("build" | "node_modules" | "target")
                    ))
            {
                result.excluded.push(relative);
                continue;
            }
            let meta = fs::symlink_metadata(&path)
                .map_err(|e| error(&format!("Cannot inspect {relative}: {e}")))?;
            if meta.file_type().is_symlink() || (!meta.is_file() && !meta.is_dir()) {
                return Err(error(&format!(
                    "{relative} is a symbolic link or special file. Resolve it before migration."
                )));
            }
            if result.files.len() + result.directories.len() >= MAX_FILES {
                return Err(error(
                    "Project exceeds the migration limit of 4096 files and directories.",
                ));
            }
            if meta.is_dir() {
                result.directories.push(relative);
                walk(root, &path, result, total, text)?;
            } else {
                *total = total.saturating_add(meta.len());
                if *total > MAX_BYTES {
                    return Err(error("Project exceeds the 256 MiB migration limit."));
                }
                let bytes =
                    fs::read(&path).map_err(|e| error(&format!("Cannot read {relative}: {e}")))?;
                if bytes.len() as u64 != meta.len() {
                    return Err(error("Project changed during inspection. Analyze again."));
                }
                let content = if bytes.len() <= MAX_TEXT && !bytes.contains(&0) {
                    String::from_utf8(bytes.clone()).ok().filter(|value| {
                        if *text + value.len() > MAX_TEXT_TOTAL {
                            false
                        } else {
                            *text += value.len();
                            true
                        }
                    })
                } else {
                    None
                };
                result.files.push(MigrationFile {
                    relative_path: relative,
                    size: meta.len(),
                    sha256: format!("{:x}", Sha256::digest(&bytes)),
                    content,
                });
            }
        }
        Ok(())
    }
    let mut snapshot = MigrationSnapshot {
        project_path: root.to_string_lossy().into(),
        fingerprint: String::new(),
        files: vec![],
        directories: vec![],
        top_module: String::new(),
        ports: vec![],
        port_error: None,
        excluded: vec![],
    };
    walk(root, root, &mut snapshot, &mut 0, &mut 0)?;
    snapshot
        .files
        .sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    snapshot.directories.sort();
    let mut hash = Sha256::new();
    for dir in &snapshot.directories {
        hash.update(b"dir\0");
        hash.update(dir.as_bytes());
        hash.update(b"\0");
    }
    for file in &snapshot.files {
        hash.update(b"file\0");
        hash.update(file.relative_path.as_bytes());
        hash.update(b"\0");
        hash.update(file.sha256.as_bytes());
    }
    snapshot.fingerprint = format!("{:x}", hash.finalize());
    let metadata = snapshot
        .files
        .iter()
        .find(|file| file.relative_path == "allora-project.json")
        .and_then(|file| file.content.as_deref())
        .ok_or_else(|| error("Readable allora-project.json is required."))?;
    let metadata: serde_json::Value = serde_json::from_str(metadata)
        .map_err(|_| error("Repair allora-project.json before migrating."))?;
    if !metadata.is_object() {
        return Err(error("Project metadata must be a JSON object."));
    }
    snapshot.top_module = metadata["topModule"].as_str().unwrap_or("").into();
    Ok(snapshot)
}

fn inspect_project(request: InspectRequest) -> Result<MigrationSnapshot, ErrorPayload> {
    let root = project_root(&request.project_path)?;
    let mut snapshot = scan(&root)?;
    if let Some(top) = request.top_module {
        snapshot.top_module = top;
    }
    let sources = snapshot
        .files
        .iter()
        .filter(|file| {
            let lower = file.relative_path.to_lowercase();
            (lower.ends_with(".v") || lower.ends_with(".sv"))
                && !lower.starts_with("sim/")
                && !lower.contains("testbench")
                && !lower.ends_with("_tb.v")
                && !lower.ends_with("_tb.sv")
                && !lower.starts_with(".allora-migration/")
        })
        .map(|file| {
            file.content
                .clone()
                .map(|content| SimulationSourceFile {
                    name: file.relative_path.clone(),
                    content,
                })
                .ok_or_else(|| {
                    error(&format!(
                        "{} is too large or unreadable for port discovery.",
                        file.relative_path
                    ))
                })
        })
        .collect::<Result<Vec<_>, _>>();
    if snapshot.files.iter().any(|file| {
        let path = file.relative_path.to_lowercase();
        path.ends_with(".vhd") || path.ends_with(".vhdl")
    }) {
        snapshot.port_error = Some("VHDL elaboration is outside automatic migration V1. Review ports and constraints manually.".into());
    } else if let Err(failure) = &sources {
        snapshot.port_error = Some(failure.message.clone());
    } else {
        match discover_ports_with_project(
            &sources.unwrap(),
            &snapshot.top_module,
            Some(&snapshot.project_path),
        ) {
            Ok(ports) => snapshot.ports = ports,
            Err(failure) => snapshot.port_error = Some(failure.message),
        }
    }
    // Detection must correspond to the exact inventoried source revision.
    if scan(&root)?.fingerprint != snapshot.fingerprint {
        return Err(error(
            "Project changed during port discovery. Analyze again.",
        ));
    }
    Ok(snapshot)
}

#[tauri::command]
pub async fn inspect_board_migration(
    request: InspectRequest,
) -> Result<MigrationSnapshot, ErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || inspect_project(request))
        .await
        .map_err(|e| error(&format!("Migration inspection failed: {e}")))?
}

fn copy_project(request: CopyRequest) -> Result<CopyResult, ErrorPayload> {
    let root = project_root(&request.project_path)?;
    let snapshot = scan(&root)?;
    if snapshot.fingerprint != request.fingerprint {
        return Err(error(
            "The source project changed after analysis. Analyze again before creating a copy.",
        ));
    }
    if request.patches.len() > 128
        || request
            .patches
            .iter()
            .map(|p| p.content.len())
            .sum::<usize>()
            > MAX_TEXT_TOTAL
    {
        return Err(error("Migration patch limit exceeded."));
    }
    let parent = match request.parent_directory {
        Some(ref path) => PathBuf::from(path)
            .canonicalize()
            .map_err(|e| error(&format!("Cannot open destination parent: {e}")))?,
        None => root
            .parent()
            .ok_or_else(|| error("Select a destination parent folder."))?
            .to_path_buf(),
    };
    if parent.starts_with(&root) {
        return Err(error(
            "The migrated copy must be outside its source project.",
        ));
    }
    let name = request.folder_name.trim();
    if name.is_empty()
        || name.len() > 120
        || name.starts_with('.')
        || name
            .chars()
            .any(|c| !(c.is_alphanumeric() || "_- ".contains(c)))
    {
        return Err(error(
            "Use a project folder name containing letters, numbers, spaces, underscores or dashes.",
        ));
    }
    let stage = tempfile::Builder::new()
        .prefix(".allora-migration-")
        .tempdir_in(&parent)
        .map_err(|e| error(&format!("Cannot stage the migrated copy: {e}")))?;
    for dir in &snapshot.directories {
        fs::create_dir_all(stage.path().join(dir))
            .map_err(|e| error(&format!("Cannot copy project directories: {e}")))?;
    }
    for file in &snapshot.files {
        let source = root.join(&file.relative_path);
        let meta = fs::symlink_metadata(&source)
            .map_err(|e| error(&format!("Cannot read source: {e}")))?;
        if !meta.is_file() || source.canonicalize().map_err(|e| error(&e.to_string()))? != source {
            return Err(error(
                "A source path was replaced during migration. Analyze again.",
            ));
        }
        let bytes = fs::read(&source)
            .map_err(|e| error(&format!("Cannot copy {}: {e}", file.relative_path)))?;
        if format!("{:x}", Sha256::digest(&bytes)) != file.sha256 {
            return Err(error("Source changed during migration. Analyze again."));
        }
        let copied_path = stage.path().join(&file.relative_path);
        fs::write(&copied_path, bytes)
            .map_err(|e| error(&format!("Cannot write migrated project: {e}")))?;
        fs::set_permissions(&copied_path, meta.permissions())
            .map_err(|e| error(&format!("Cannot preserve project file permissions: {e}")))?;
    }
    for original in &request.archive_paths {
        let relative = relative_path(original)?;
        if !snapshot
            .files
            .iter()
            .any(|file| file.relative_path == *original)
        {
            return Err(error("A constraint selected for archival is missing."));
        }
        let backup = stage
            .path()
            .join(".allora-migration")
            .join(&request.fingerprint[..16])
            .join(format!("{original}.txt"));
        if backup.exists() {
            return Err(error(
                "A migration backup already exists at the planned path.",
            ));
        }
        fs::create_dir_all(backup.parent().unwrap()).map_err(|e| error(&e.to_string()))?;
        fs::rename(stage.path().join(relative), backup)
            .map_err(|e| error(&format!("Cannot preserve original constraints: {e}")))?;
    }
    let mut seen = std::collections::BTreeSet::new();
    for patch in &request.patches {
        let relative = relative_path(&patch.relative_path)?;
        if !seen.insert(relative.clone()) {
            return Err(error("Duplicate migration patch."));
        }
        let target = stage.path().join(relative);
        fs::create_dir_all(target.parent().unwrap()).map_err(|e| error(&e.to_string()))?;
        fs::write(target, &patch.content)
            .map_err(|e| error(&format!("Cannot apply migration: {e}")))?;
    }
    let metadata: serde_json::Value = serde_json::from_slice(
        &fs::read(stage.path().join("allora-project.json")).map_err(|e| error(&e.to_string()))?,
    )
    .map_err(|_| error("Migrated metadata must be valid JSON."))?;
    if metadata["boardId"].as_str().unwrap_or("").is_empty()
        || metadata["boardMigration"]["schemaVersion"].as_u64() != Some(1)
        || metadata["boardMigration"]["requiresReview"]
            .as_bool()
            .is_none()
        || metadata["boardMigration"]["targetBoardId"].as_str() != metadata["boardId"].as_str()
    {
        return Err(error(
            "Migrated project must include its target board and migration report.",
        ));
    }
    if scan(&root)?.fingerprint != request.fingerprint {
        return Err(error(
            "Source changed before migration completed. Analyze again.",
        ));
    }
    // Reserve a unique destination. A failed publication removes only this reservation.
    let destination = (1..10_000)
        .find_map(|index| {
            let path = parent.join(if index == 1 {
                name.to_string()
            } else {
                format!("{name}-{index}")
            });
            match fs::create_dir(&path) {
                Ok(()) => Some(Ok(path)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => None,
                Err(e) => Some(Err(error(&format!("Cannot create destination: {e}")))),
            }
        })
        .ok_or_else(|| error("Cannot allocate a unique project folder."))??;
    let publish = (|| {
        for entry in fs::read_dir(stage.path()).map_err(|e| error(&e.to_string()))? {
            let entry = entry.map_err(|e| error(&e.to_string()))?;
            fs::rename(entry.path(), destination.join(entry.file_name()))
                .map_err(|e| error(&format!("Cannot finish migrated copy: {e}")))?;
        }
        Ok(CopyResult {
            project_path: destination.to_string_lossy().into(),
            file_count: snapshot.files.len(),
            excluded: snapshot.excluded,
        })
    })();
    if publish.is_err() {
        let _ = fs::remove_dir_all(&destination);
    }
    publish
}

#[tauri::command]
pub async fn create_board_migration_copy(request: CopyRequest) -> Result<CopyResult, ErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || copy_project(request))
        .await
        .map_err(|e| error(&format!("Migration copy failed: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> tempfile::TempDir {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("original");
        fs::create_dir_all(root.join("assets/sources")).unwrap();
        fs::create_dir_all(root.join("build")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(
            root.join("allora-project.json"),
            r#"{"boardId":"old","topModule":"top"}"#,
        )
        .unwrap();
        fs::write(root.join("top.v"), "module top; endmodule").unwrap();
        fs::write(root.join("pins.pcf"), "set_io led 1").unwrap();
        fs::write(root.join("assets/sources/image.bin"), [0, 255, 10, 128]).unwrap();
        fs::write(root.join("build/old.bit"), "stale").unwrap();
        temp
    }
    fn request(root: &Path) -> CopyRequest {
        CopyRequest {
            project_path: root.to_string_lossy().into(),
            fingerprint: scan(root).unwrap().fingerprint,
            folder_name: "migrated".into(),
            parent_directory: None,
            patches: vec![MigrationPatch {
                relative_path: "allora-project.json".into(),
                content: r#"{"boardId":"new","boardMigration":{"schemaVersion":1,"targetBoardId":"new","requiresReview":false}}"#.into(),
            }],
            archive_paths: vec!["pins.pcf".into()],
        }
    }
    #[test]
    fn migration_copy_preserves_bytes_tree_original_and_avoids_stale_outputs() {
        let temp = fixture();
        let root = temp.path().join("original");
        let fingerprint = scan(&root).unwrap().fingerprint;
        let copy = copy_project(request(&root)).unwrap();
        let target = Path::new(&copy.project_path);
        assert_eq!(
            fs::read(target.join("assets/sources/image.bin")).unwrap(),
            [0, 255, 10, 128]
        );
        assert!(!target.join("build").exists());
        assert!(!target.join(".git").exists());
        assert_eq!(
            fs::read_to_string(target.join(format!(
                ".allora-migration/{}/pins.pcf.txt",
                &fingerprint[..16]
            )))
            .unwrap(),
            "set_io led 1"
        );
        assert!(root.join("pins.pcf").exists());
        assert_eq!(scan(&root).unwrap().fingerprint, fingerprint);
        let second = copy_project(request(&root)).unwrap();
        assert!(second.project_path.ends_with("migrated-2"));
    }
    #[test]
    fn migration_rejects_stale_source_and_nested_destination() {
        let temp = fixture();
        let root = temp.path().join("original");
        let stale = request(&root);
        fs::write(root.join("top.v"), "edited").unwrap();
        assert!(copy_project(stale).unwrap_err().message.contains("changed"));
        let mut nested = request(&root);
        nested.parent_directory = Some(root.to_string_lossy().into());
        assert!(copy_project(nested).is_err());
        assert!(!temp.path().join("migrated").exists());
    }
    #[test]
    fn migration_rolls_back_invalid_patches() {
        let temp = fixture();
        let root = temp.path().join("original");
        let mut bad = request(&root);
        bad.patches.push(MigrationPatch {
            relative_path: "../escaped".into(),
            content: "bad".into(),
        });
        assert!(copy_project(bad).is_err());
        assert!(!temp.path().join("escaped").exists());
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
    }
    #[test]
    fn unfinished_or_stale_migration_review_blocks_native_builds() {
        let temp = fixture();
        let root = temp.path().join("original");
        let path = root.to_str();
        assert!(require_completed_review(path).is_ok());
        fs::write(root.join("allora-project.json"), r#"{"boardId":"new","boardMigration":{"schemaVersion":1,"targetBoardId":"new","requiresReview":true}}"#).unwrap();
        assert!(require_completed_review(path).is_err());
        fs::write(root.join("allora-project.json"), r#"{"boardId":"new","boardMigration":{"schemaVersion":1,"targetBoardId":"old","requiresReview":false}}"#).unwrap();
        assert!(require_completed_review(path).is_err());
        fs::write(root.join("allora-project.json"), r#"{"boardId":"new","boardMigration":{"schemaVersion":1,"targetBoardId":"new","requiresReview":false}}"#).unwrap();
        assert!(require_completed_review(path).is_ok());
    }
    #[test]
    fn migration_inspects_actual_yosys_port_directions_and_ranges() {
        if std::process::Command::new(crate::tool_command("yosys"))
            .arg("-V")
            .output()
            .is_err()
        {
            return;
        }
        let temp = fixture();
        let root = temp.path().join("original");
        fs::write(root.join("top.v"), "module top(input clk, input [8:9] buttons, output [4:4] led); assign led=buttons[8]; endmodule").unwrap();
        let inspected = inspect_project(InspectRequest {
            project_path: root.to_string_lossy().into(),
            top_module: None,
        })
        .unwrap();
        assert!(inspected.port_error.is_none(), "{:?}", inspected.port_error);
        let buttons = inspected
            .ports
            .iter()
            .find(|port| port.name == "buttons")
            .unwrap();
        assert_eq!(buttons.direction, "input");
        assert_eq!(buttons.width, 2);
        assert_eq!(buttons.offset, 8);
        assert!(buttons.upto);
        assert_eq!(
            inspected
                .ports
                .iter()
                .find(|port| port.name == "led")
                .unwrap()
                .offset,
            4
        );
        assert!(inspected
            .files
            .iter()
            .find(|file| file.relative_path.ends_with("image.bin"))
            .unwrap()
            .content
            .is_none());
    }
    #[test]
    fn migrated_copy_runs_real_simulation_synthesis_and_destination_timing() {
        for tool in ["yosys", "iverilog", "vvp", "nextpnr-ice40", "icepack"] {
            if std::process::Command::new(crate::tool_command(tool))
                .arg("--version")
                .output()
                .is_err()
            {
                return;
            }
        }
        let temp = fixture();
        let root = temp.path().join("original");
        let source = "module top(input clk, output led); reg [3:0] count=0; always @(posedge clk) count<=count+1; assign led=count[2]; endmodule";
        fs::write(root.join("top.v"), source).unwrap();
        let before = scan(&root).unwrap().fingerprint;
        let mut migration = request(&root);
        migration.patches.push(MigrationPatch {
            relative_path: "constraints/constraints.pcf".into(),
            content: "set_io clk 35\nset_io led 40\n".into(),
        });
        let copy = copy_project(migration).unwrap();
        let sources = vec![crate::SynthesisInputFile {
            name: "top.v".into(),
            content: source.into(),
        }];
        let sink = crate::LogSink::new(|_| {}, None);
        let sim = crate::simulate_testbench_service(crate::SimulateTestbenchRequest {
            project_name: "migration_check".into(), project_path: Some(copy.project_path.clone()), source_files: sources.clone(), top_module: Some("tb".into()),
            testbench_file: crate::SynthesisInputFile { name: "tb.sv".into(), content: "module tb; reg clk=0; wire led; top dut(clk,led); always #5 clk=~clk; initial begin $dumpfile(\"waveform.vcd\"); $dumpvars(0,tb); repeat(8) @(posedge clk); #1; if(led !== 0) $fatal; $finish; end endmodule".into() },
        }, &sink).unwrap();
        assert!(sim.vcd.contains("led"));
        let synth =
            crate::generate_synthesis_diagram_service(crate::GenerateSynthesisDiagramRequest {
                project_name: "migration_check".into(),
                project_path: Some(copy.project_path.clone()),
                board_name: "iCEBreaker".into(),
                fpga_id: "ice40up5k-sg48".into(),
                synthesis_flow: "yosys-nextpnr".into(),
                top_module: Some("top".into()),
                files: sources.clone(),
            })
            .unwrap();
        assert!(!synth.nodes.is_empty());
        let built = crate::generate_bitstream_service(
            crate::GenerateBitstreamRequest {
                project_name: "migration_check".into(),
                board_name: "iCEBreaker".into(),
                board_family: "iCE40 UltraPlus".into(),
                board_package: "SG48".into(),
                fpga_id: "ice40up5k-sg48".into(),
                synthesis_flow: "yosys-nextpnr".into(),
                top_module: Some("top".into()),
                source_files: sources,
                constraint_file: crate::SynthesisInputFile {
                    name: "constraints.pcf".into(),
                    content: "set_io clk 35\nset_io led 40\n".into(),
                },
                output_extension: "bin".into(),
                project_path: Some(copy.project_path.clone()),
                target_clock_name: Some("clk".into()),
                target_frequency_mhz: Some(12.0),
            },
            &sink,
        )
        .unwrap();
        assert!(!built.bytes.is_empty());
        assert_eq!(built.timing.status, "pass");
        assert_eq!(scan(&root).unwrap().fingerprint, before);
        assert!(Path::new(&copy.project_path)
            .join("assets/sources/image.bin")
            .exists());
    }
    #[cfg(unix)]
    #[test]
    fn migration_rejects_symlinks_instead_of_silently_losing_files() {
        let temp = fixture();
        let root = temp.path().join("original");
        std::os::unix::fs::symlink(root.join("top.v"), root.join("linked.v")).unwrap();
        assert!(scan(&root).unwrap_err().message.contains("symbolic link"));
    }
}
