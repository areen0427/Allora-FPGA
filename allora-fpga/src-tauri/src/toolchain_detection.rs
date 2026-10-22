//! Read-only executable discovery for the project setup wizard.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const TOOL_COMMANDS: &[&str] = &[
    "yosys",
    "nextpnr-ice40",
    "nextpnr-ecp5",
    "icepack",
    "ecppack",
    "vivado",
    "quartus_sh",
    "quartus_pgm",
    "openFPGALoader",
    "iceprog",
    "dfu-util",
    "ujprog",
    "fujprog",
    "openocd",
    "gowin_sh",
    "gw_sh",
    "diamondc",
    "efx_run",
    "radiantc",
    "libero",
    "pnr_gowin",
    "ldprog",
    "icesprog",
    "ecpprog",
    "ecpdap",
    "tinyfpgab",
    "tinyprog",
    "gowin_programmer",
    "programmer",
    "quickprogrammer",
    "LiberoProgrammer",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetectToolchainToolsRequest {
    commands: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolchainToolStatus {
    command: String,
    available: bool,
    path: Option<String>,
}

#[tauri::command]
pub(crate) async fn detect_toolchain_tools(
    request: DetectToolchainToolsRequest,
) -> Result<Vec<ToolchainToolStatus>, super::ErrorPayload> {
    validate_commands(&request.commands)?;
    tauri::async_runtime::spawn_blocking(move || {
        request
            .commands
            .into_iter()
            .map(|command| {
                let resolved = super::resolve_tool_path(&command);
                let path =
                    discover_executable(&command, &resolved, std::env::var_os("PATH").as_deref());
                ToolchainToolStatus {
                    command,
                    available: path.is_some(),
                    path: path.map(|path| path.to_string_lossy().into_owned()),
                }
            })
            .collect()
    })
    .await
    .map_err(|err| super::error(&format!("Toolchain detection failed: {err}")))
}

fn validate_commands(commands: &[String]) -> Result<(), super::ErrorPayload> {
    if commands.len() > TOOL_COMMANDS.len() {
        return Err(super::error("Too many toolchain commands requested."));
    }
    if commands
        .iter()
        .any(|command| !TOOL_COMMANDS.contains(&command.as_str()))
    {
        return Err(super::error("Unsupported toolchain command requested."));
    }
    Ok(())
}

fn discover_executable(
    command: &str,
    resolved: &Path,
    search_path: Option<&std::ffi::OsStr>,
) -> Option<PathBuf> {
    // A bare command returned by the shared resolver still needs PATH lookup.
    if resolved.components().count() > 1 && is_executable(resolved) {
        return Some(resolved.to_path_buf());
    }
    search_path.and_then(|search_path| {
        std::env::split_paths(search_path).find_map(|directory| {
            let candidate = directory.join(command);
            if is_executable(&candidate) {
                return Some(candidate);
            }
            #[cfg(windows)]
            for extension in ["exe", "cmd", "bat", "com"] {
                let candidate = directory.join(format!("{command}.{extension}"));
                if is_executable(&candidate) {
                    return Some(candidate);
                }
            }
            None
        })
    })
}

fn is_executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_bounded_known_commands_are_accepted() {
        assert!(validate_commands(&["yosys".into(), "openFPGALoader".into()]).is_ok());
        for command in ["../yosys", "/bin/sh", "yosys --version", "", "sh"] {
            assert!(validate_commands(&[command.into()]).is_err());
        }
        assert!(validate_commands(&vec!["yosys".into(); TOOL_COMMANDS.len() + 1]).is_err());
    }

    #[test]
    fn missing_files_and_directories_are_unavailable() {
        let directory = tempfile::tempdir_in(env!("CARGO_MANIFEST_DIR")).unwrap();
        assert!(!is_executable(directory.path()));
        assert!(discover_executable("yosys", Path::new("yosys"), None).is_none());
        let search_path = std::env::join_paths([directory.path()]).unwrap();
        assert!(discover_executable("yosys", Path::new("yosys"), Some(&search_path)).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn discovers_executable_without_running_it_and_skips_non_executable_files() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir_in(env!("CARGO_MANIFEST_DIR")).unwrap();
        let tool = directory.path().join("yosys");
        // Deliberately invalid executable contents: discovery must never launch it.
        std::fs::write(&tool, "this is not a program").unwrap();
        let search_path = std::env::join_paths([directory.path()]).unwrap();
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(discover_executable("yosys", &tool, Some(&search_path)).is_none());
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(
            discover_executable("yosys", Path::new("yosys"), Some(&search_path)),
            Some(tool.clone())
        );
        assert_eq!(discover_executable("yosys", &tool, None), Some(tool));
    }
}
