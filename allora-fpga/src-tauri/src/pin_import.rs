//! Bounded, read-only access to user-selected Vivado projects and their text sources.
use serde::Serialize;
use std::{fs::File, io::Read, path::Path};

const FILE_LIMIT: u64 = 2 * 1024 * 1024;
const TOTAL_LIMIT: usize = 16 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    path: String,
    content: String,
}

fn read_files(paths: Vec<String>) -> Result<Vec<ImportFile>, String> {
    if paths.is_empty() || paths.len() > 256 {
        return Err("Select between 1 and 256 import files.".into());
    }
    let mut total = 0;
    let mut result = Vec::new();
    for path in paths {
        let source = Path::new(&path);
        if !source.is_absolute() {
            return Err("Import paths must be absolute.".into());
        }
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(
            extension.as_str(),
            "xpr" | "v" | "sv" | "vhd" | "vhdl" | "vh" | "svh"
        ) {
            return Err(format!("Unsupported import file: {path}"));
        }
        let initial_metadata =
            std::fs::metadata(source).map_err(|err| format!("Unable to inspect {path}: {err}"))?;
        if !initial_metadata.is_file() || initial_metadata.len() > FILE_LIMIT {
            return Err(format!(
                "{path} must be a regular text file no larger than 2 MiB."
            ));
        }
        let file = File::open(source).map_err(|err| format!("Unable to open {path}: {err}"))?;
        let metadata = file.metadata().map_err(|err| err.to_string())?;
        if !metadata.is_file() || metadata.len() > FILE_LIMIT {
            return Err(format!(
                "{path} must be a regular text file no larger than 2 MiB."
            ));
        }
        let mut bytes = Vec::new();
        file.take(FILE_LIMIT + 1)
            .read_to_end(&mut bytes)
            .map_err(|err| err.to_string())?;
        total += bytes.len();
        if bytes.len() as u64 > FILE_LIMIT || total > TOTAL_LIMIT {
            return Err("Import exceeds the 2 MiB file or 16 MiB total limit.".into());
        }
        if bytes.contains(&0) {
            return Err(format!("{path} is not a text file."));
        }
        let content = String::from_utf8(bytes)
            .map_err(|_| format!("{path} must use UTF-8 text encoding."))?;
        result.push(ImportFile { path, content });
    }
    Ok(result)
}

#[tauri::command]
pub async fn read_pin_import_files(paths: Vec<String>) -> Result<Vec<ImportFile>, String> {
    tauri::async_runtime::spawn_blocking(move || read_files(paths))
        .await
        .map_err(|err| err.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_vivado_project_and_referenced_hdl_fixture() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/pin-import");
        let imported = read_files(vec![
            root.join("blink.xpr").to_string_lossy().into_owned(),
            root.join("top.sv").to_string_lossy().into_owned(),
        ])
        .unwrap();
        assert!(imported[0].content.contains("$PPRDIR/top.sv"));
        assert!(imported[1].content.contains("[9:8] status"));
    }
    #[test]
    fn imports_text_and_rejects_invalid_requests() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("top.sv");
        std::fs::write(&file, "module top(output led); endmodule").unwrap();
        let paths = vec![file.to_string_lossy().into_owned()];
        assert!(read_files(paths.clone()).unwrap()[0]
            .content
            .contains("output led"));
        std::fs::write(&file, [0, 1, 2]).unwrap();
        assert!(read_files(paths.clone()).unwrap_err().contains("text file"));
        std::fs::write(&file, vec![b' '; FILE_LIMIT as usize + 1]).unwrap();
        assert!(read_files(paths.clone()).unwrap_err().contains("2 MiB"));
        std::fs::write(&file, vec![b' '; FILE_LIMIT as usize]).unwrap();
        assert!(read_files(vec![paths[0].clone(); 9])
            .unwrap_err()
            .contains("16 MiB"));
        assert!(read_files(vec!["relative.v".into()]).is_err());
        assert!(read_files(vec![dir
            .path()
            .join("secret.txt")
            .to_string_lossy()
            .into_owned()])
        .is_err());
        assert!(read_files(vec![]).is_err());
        assert!(read_files(vec!["/missing.v".into(); 257]).is_err());
    }
}
