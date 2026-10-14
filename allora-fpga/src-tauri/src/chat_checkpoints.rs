//! Bounded, process-local snapshots of editable project sources. These are independent
//! of Git, so a turn's restore preserves uncommitted edits that preceded that turn.
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

const MAX_FILE: usize = 512 * 1024;
const MAX_SNAPSHOT: usize = 4 * 1024 * 1024;
const MAX_FILES: usize = 512;
const MAX_ENTRIES: usize = 4096;
const MAX_CHECKPOINTS: usize = 8;
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub(crate) struct ChatCheckpointState(Mutex<VecDeque<Checkpoint>>);

#[derive(Clone)]
struct FileVersion {
    bytes: Vec<u8>,
    permissions: fs::Permissions,
}

#[derive(Default)]
struct Snapshot {
    files: BTreeMap<String, FileVersion>,
    // A file skipped before a turn must never be mistaken for a newly added file.
    skipped_paths: BTreeSet<String>,
    skipped: usize,
}

#[derive(Clone)]
struct Change {
    path: String,
    before: Option<FileVersion>,
    after: Option<FileVersion>,
}

struct Checkpoint {
    id: String,
    root: PathBuf,
    root_metadata: fs::Metadata,
    before: Snapshot,
    reviewed: Option<Vec<Change>>,
    skipped: usize,
    restored: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CheckpointCreated {
    id: String,
    project_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CheckpointReview {
    id: String,
    project_path: String,
    files: Vec<ReviewedFile>,
    skipped: usize,
    can_restore: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct ReviewedFile {
    path: String,
    before: Option<String>,
    after: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct CheckpointRestored {
    restored: usize,
}

#[tauri::command]
pub(crate) fn ai_chat_checkpoint_create(
    state: State<'_, ChatCheckpointState>,
    project_path: String,
) -> Result<CheckpointCreated, String> {
    create(&state, &project_path)
}

#[tauri::command]
pub(crate) fn ai_chat_checkpoint_review(
    state: State<'_, ChatCheckpointState>,
    id: String,
) -> Result<CheckpointReview, String> {
    review(&state, &id)
}

#[tauri::command]
pub(crate) fn ai_chat_checkpoint_created_review(
    project_path: String,
) -> Result<CheckpointReview, String> {
    created_review(&project_path)
}

#[tauri::command]
pub(crate) fn ai_chat_checkpoint_restore(
    state: State<'_, ChatCheckpointState>,
    id: String,
) -> Result<CheckpointRestored, String> {
    restore(&state, &id, |_| Ok(()))
}

fn create(state: &ChatCheckpointState, project_path: &str) -> Result<CheckpointCreated, String> {
    let root = project_root(project_path)?;
    let before = snapshot(&root)?;
    let root_metadata = fs::metadata(&root).map_err(|e| e.to_string())?;
    let id = next_id("checkpoint-")?;
    let result = CheckpointCreated {
        id: id.clone(),
        project_path: root.to_string_lossy().into_owned(),
    };
    let checkpoint = Checkpoint {
        id,
        root,
        root_metadata,
        skipped: before.skipped,
        before,
        reviewed: None,
        restored: false,
    };
    let mut checkpoints = state
        .0
        .lock()
        .map_err(|_| "Change checkpoints are unavailable.")?;
    while checkpoints.len() >= MAX_CHECKPOINTS {
        checkpoints.pop_front();
    }
    checkpoints.push_back(checkpoint);
    Ok(result)
}

fn next_id(prefix: &str) -> Result<String, String> {
    Ok(format!(
        "{prefix}{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "System clock is unavailable.")?
            .as_nanos(),
        NEXT_ID.fetch_add(1, Ordering::Relaxed)
    ))
}

/// A newly created project's initial source review has no pre-turn baseline.
/// Show its real files, but never register a restore that could delete the folder.
fn created_review(project_path: &str) -> Result<CheckpointReview, String> {
    let root = project_root(project_path)?;
    let current = snapshot(&root)?;
    Ok(CheckpointReview {
        id: next_id("created:")?,
        project_path: root.to_string_lossy().into_owned(),
        files: current
            .files
            .into_iter()
            .map(|(path, version)| ReviewedFile {
                path,
                before: None,
                after: Some(String::from_utf8(version.bytes).expect("snapshot text")),
            })
            .collect(),
        skipped: current.skipped,
        can_restore: false,
    })
}

fn unavailable() -> String {
    "This change checkpoint is unavailable. Checkpoints expire after an app restart or when newer turns replace them.".into()
}

fn review(state: &ChatCheckpointState, id: &str) -> Result<CheckpointReview, String> {
    let mut checkpoints = state
        .0
        .lock()
        .map_err(|_| "Change checkpoints are unavailable.")?;
    let checkpoint = checkpoints
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(unavailable)?;
    validate_root(checkpoint)?;
    if checkpoint.reviewed.is_none() {
        let after = snapshot(&checkpoint.root)?;
        // Never interpret a file that became binary/large as a deletion.
        for path in checkpoint.before.files.keys() {
            if after.skipped_paths.contains(path) {
                return Err(format!("Cannot review {path}: it is no longer a supported text file. No files were changed."));
            }
        }
        let paths: BTreeSet<_> = checkpoint
            .before
            .files
            .keys()
            .chain(after.files.keys())
            .cloned()
            .collect();
        let mut changes = Vec::new();
        for path in paths {
            if checkpoint.before.skipped_paths.contains(&path) {
                continue;
            }
            let before = checkpoint.before.files.get(&path);
            let current = after.files.get(&path);
            if !same_version(before, current) {
                changes.push(Change {
                    path,
                    before: before.cloned(),
                    after: current.cloned(),
                });
            }
        }
        checkpoint.skipped = checkpoint
            .before
            .skipped_paths
            .union(&after.skipped_paths)
            .count()
            + checkpoint
                .before
                .skipped
                .saturating_sub(checkpoint.before.skipped_paths.len())
                .max(after.skipped.saturating_sub(after.skipped_paths.len()));
        // Freeze the first completed review. Reopening a review must not authorize
        // overwriting edits made after the original turn completed.
        checkpoint.reviewed = Some(changes);
    }
    Ok(CheckpointReview {
        id: checkpoint.id.clone(),
        project_path: checkpoint.root.to_string_lossy().into_owned(),
        files: checkpoint
            .reviewed
            .as_ref()
            .unwrap()
            .iter()
            .map(|change| ReviewedFile {
                path: change.path.clone(),
                before: change
                    .before
                    .as_ref()
                    .map(|v| String::from_utf8(v.bytes.clone()).expect("snapshot text")),
                after: change
                    .after
                    .as_ref()
                    .map(|v| String::from_utf8(v.bytes.clone()).expect("snapshot text")),
            })
            .collect(),
        skipped: checkpoint.skipped,
        can_restore: !checkpoint.restored,
    })
}

fn same_version(left: Option<&FileVersion>, right: Option<&FileVersion>) -> bool {
    match (left, right) {
        (Some(left), Some(right)) => {
            left.bytes == right.bytes && same_permissions(&left.permissions, &right.permissions)
        }
        (None, None) => true,
        _ => false,
    }
}

fn same_permissions(left: &fs::Permissions, right: &fs::Permissions) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        left.mode() == right.mode()
    }
    #[cfg(not(unix))]
    {
        left.readonly() == right.readonly()
    }
}

fn project_root(value: &str) -> Result<PathBuf, String> {
    let given = Path::new(value);
    if !given.is_absolute() {
        return Err("Choose an absolute Allora project path.".into());
    }
    let metadata =
        fs::symlink_metadata(given).map_err(|e| format!("Project is unavailable: {e}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Checkpoints require a regular project directory, not a symbolic link.".into());
    }
    let root = fs::canonicalize(given).map_err(|e| format!("Cannot resolve project: {e}"))?;
    let metadata_path = checked_path(&root, "allora-project.json")?;
    let metadata =
        read_version(&metadata_path)?.ok_or("Choose a project containing allora-project.json.")?;
    let value: serde_json::Value =
        serde_json::from_slice(&metadata.bytes).map_err(|_| "Invalid allora-project.json.")?;
    if !value.is_object() {
        return Err("Project metadata must be an object.".into());
    }
    Ok(root)
}

fn validate_root(checkpoint: &Checkpoint) -> Result<(), String> {
    let root = project_root(
        checkpoint
            .root
            .to_str()
            .ok_or("Unsupported project path.")?,
    )?;
    let metadata = fs::metadata(&root).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.dev() != checkpoint.root_metadata.dev()
            || metadata.ino() != checkpoint.root_metadata.ino()
        {
            return Err(
                "The project directory was replaced. This checkpoint cannot be restored.".into(),
            );
        }
    }
    #[cfg(not(unix))]
    let _ = (&metadata, &checkpoint.root_metadata);
    if root != checkpoint.root {
        return Err("The project location changed.".into());
    }
    Ok(())
}

fn protected(relative: &Path) -> bool {
    relative.components().any(|part| {
        let name = part.as_os_str().to_string_lossy().to_ascii_lowercase();
        matches!(
            name.as_str(),
            ".git"
                | ".codex"
                | ".agents"
                | ".ade"
                | "node_modules"
                | "target"
                | "build"
                | "dist"
                | "coverage"
                | "generated"
                | "assets"
                | "register_map"
                | "__pycache__"
        )
    })
}

fn supported(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if matches!(
        name,
        "Makefile" | "makefile" | "CMakeLists.txt" | ".gitignore" | ".gitattributes"
    ) {
        return true;
    }
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some(
            "v" | "sv"
                | "vh"
                | "svh"
                | "vhd"
                | "vhdl"
                | "xdc"
                | "pcf"
                | "lpf"
                | "sdc"
                | "cst"
                | "ucf"
                | "qsf"
                | "qpf"
                | "tcl"
                | "json"
                | "toml"
                | "yaml"
                | "yml"
                | "md"
                | "txt"
                | "py"
                | "c"
                | "cpp"
                | "h"
                | "hpp"
                | "rs"
                | "sh"
                | "mk"
                | "ini"
                | "cfg"
        )
    )
}

fn checked_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.contains('\\') {
        return Err("Checkpoint paths cannot contain backslashes.".into());
    }
    let relative = Path::new(relative);
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || protected(relative)
    {
        return Err("Checkpoint path is outside editable project sources.".into());
    }
    let root_metadata =
        fs::symlink_metadata(root).map_err(|e| format!("Project is unavailable: {e}"))?;
    if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
        return Err("Project directory cannot be a symbolic link.".into());
    }
    let mut path = root.to_path_buf();
    for part in relative.components() {
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(format!(
                    "Checkpoints cannot follow symbolic links: {}",
                    path.display()
                ))
            }
            Ok(_) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("Cannot inspect checkpoint path: {e}")),
        }
    }
    Ok(path)
}

fn read_version(path: &Path) -> Result<Option<FileVersion>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Cannot inspect {}: {e}", path.display())),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(format!(
            "Expected a regular project file: {}",
            path.display()
        ));
    }
    if metadata.len() > MAX_FILE as u64 {
        return Err("File exceeds the checkpoint text limit.".into());
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options
        .open(path)
        .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
    let mut bytes = Vec::new();
    file.take((MAX_FILE + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Cannot read file: {e}"))?;
    if bytes.len() > MAX_FILE || bytes.contains(&0) || std::str::from_utf8(&bytes).is_err() {
        return Err("File is too large or is not UTF-8 text.".into());
    }
    Ok(Some(FileVersion {
        bytes,
        permissions: metadata.permissions(),
    }))
}

fn snapshot(root: &Path) -> Result<Snapshot, String> {
    fn collect(
        root: &Path,
        directory: &Path,
        output: &mut Snapshot,
        total: &mut usize,
        entries: &mut usize,
        depth: usize,
    ) -> Result<(), String> {
        if depth > 32 {
            return Err("Project directories exceed the checkpoint depth limit.".into());
        }
        let mut children = Vec::new();
        for entry in fs::read_dir(directory).map_err(|e| format!("Cannot list project: {e}"))? {
            if children.len() + *entries >= MAX_ENTRIES {
                return Err("Project exceeds the checkpoint entry limit.".into());
            }
            children.push(entry.map_err(|e| e.to_string())?);
        }
        children.sort_by_key(|entry| entry.file_name());
        for entry in children {
            *entries += 1;
            if *entries > MAX_ENTRIES {
                return Err("Project exceeds the checkpoint entry limit.".into());
            }
            let path = entry.path();
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "Invalid project path.")?;
            let relative_text = relative
                .components()
                .map(|component| {
                    component
                        .as_os_str()
                        .to_str()
                        .ok_or("Project contains a non-UTF-8 path.")
                })
                .collect::<Result<Vec<_>, _>>()?
                .join("/");
            if protected(relative) {
                output.skipped += 1;
                continue;
            }
            checked_path(root, &relative_text)?;
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_dir() {
                collect(root, &path, output, total, entries, depth + 1)?;
            } else if kind.is_file() {
                if !supported(relative) {
                    output.skipped_paths.insert(relative_text);
                    output.skipped += 1;
                    continue;
                }
                match read_version(&path) {
                    Ok(Some(version)) => {
                        *total += version.bytes.len();
                        if *total > MAX_SNAPSHOT || output.files.len() >= MAX_FILES {
                            return Err(
                                "Project exceeds the checkpoint source limit (512 files / 4 MiB)."
                                    .into(),
                            );
                        }
                        output.files.insert(relative_text, version);
                    }
                    Ok(None) => {
                        return Err(
                            "Project changed while the checkpoint was captured. Retry the turn."
                                .into(),
                        )
                    }
                    Err(message)
                        if message == "File exceeds the checkpoint text limit."
                            || message == "File is too large or is not UTF-8 text." =>
                    {
                        output.skipped_paths.insert(relative_text);
                        output.skipped += 1;
                    }
                    Err(message) => return Err(message),
                }
            } else {
                return Err(format!(
                    "Checkpoints require regular project files: {relative_text}"
                ));
            }
        }
        Ok(())
    }
    let mut output = Snapshot::default();
    collect(root, root, &mut output, &mut 0, &mut 0, 0)?;
    Ok(output)
}

fn verify_changes(root: &Path, changes: &[Change]) -> Result<(), String> {
    for change in changes {
        let path = checked_path(root, &change.path)?;
        let current = read_version(&path)?;
        if !same_version(current.as_ref(), change.after.as_ref()) {
            return Err(format!("{} changed after this turn was reviewed. No files were restored; your newer edits are preserved.", change.path));
        }
    }
    Ok(())
}

fn atomic_write(root: &Path, relative: &str, version: &FileVersion) -> Result<(), String> {
    let path = checked_path(root, relative)?;
    let parent = path.parent().ok_or("Invalid project file path.")?;
    fs::create_dir_all(parent).map_err(|e| format!("Cannot create source directory: {e}"))?;
    checked_path(root, relative)?;
    let mut file = tempfile::NamedTempFile::new_in(parent)
        .map_err(|e| format!("Cannot stage restore: {e}"))?;
    file.write_all(&version.bytes)
        .map_err(|e| format!("Cannot stage restore: {e}"))?;
    file.as_file()
        .set_permissions(version.permissions.clone())
        .map_err(|e| format!("Cannot preserve source permissions: {e}"))?;
    checked_path(root, relative)?;
    file.persist(&path)
        .map_err(|e| format!("Cannot restore {}: {}", relative, e.error))?;
    Ok(())
}

fn apply(root: &Path, relative: &str, version: Option<&FileVersion>) -> Result<(), String> {
    if let Some(version) = version {
        atomic_write(root, relative, version)
    } else {
        let path = checked_path(root, relative)?;
        fs::remove_file(path).map_err(|e| format!("Cannot remove turn-created source: {e}"))
    }
}

fn restore(
    state: &ChatCheckpointState,
    id: &str,
    mut before_commit: impl FnMut(usize) -> Result<(), String>,
) -> Result<CheckpointRestored, String> {
    if id.starts_with("created:") {
        return Err("Initial project creation is review-only. The project folder is preserved; later turns support checkpoint restore.".into());
    }
    let mut checkpoints = state
        .0
        .lock()
        .map_err(|_| "Change checkpoints are unavailable.")?;
    let checkpoint = checkpoints
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(unavailable)?;
    if checkpoint.restored {
        return Err("This checkpoint has already been restored.".into());
    }
    validate_root(checkpoint)?;
    let changes = checkpoint
        .reviewed
        .as_ref()
        .ok_or("Review this turn's changes before restoring them.")?;
    verify_changes(&checkpoint.root, changes)?;
    let mut committed = 0;
    for (index, change) in changes.iter().enumerate() {
        let result = (|| {
            before_commit(index)?;
            validate_root(checkpoint)?;
            // Recheck every path immediately before each write, including files
            // that remain pending. Unrelated, newly created files are untouched.
            verify_changes(&checkpoint.root, &changes[index..])?;
            apply(&checkpoint.root, &change.path, change.before.as_ref())
        })();
        if let Err(message) = result {
            let mut failures = Vec::new();
            for previous in changes[..committed].iter().rev() {
                let recovery = (|| {
                    validate_root(checkpoint)?;
                    let path = checked_path(&checkpoint.root, &previous.path)?;
                    let current = read_version(&path)?;
                    if !same_version(current.as_ref(), previous.before.as_ref()) {
                        return Err("File changed during recovery; preserved newer content.".into());
                    }
                    apply(&checkpoint.root, &previous.path, previous.after.as_ref())
                })();
                if let Err(error) = recovery {
                    failures.push(format!("{}: {error}", previous.path));
                }
            }
            return Err(if failures.is_empty() {
                format!("{message} Previous files were rolled back.")
            } else {
                format!("{message} Recovery required: {}", failures.join("; "))
            });
        }
        committed += 1;
    }
    checkpoint.restored = true;
    Ok(CheckpointRestored {
        restored: committed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> tempfile::TempDir {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("allora-project.json"), "{}").unwrap();
        fs::create_dir(directory.path().join("src")).unwrap();
        fs::write(
            directory.path().join("src/top.sv"),
            "// existing user edits\n",
        )
        .unwrap();
        directory
    }
    #[test]
    fn initial_project_review_shows_real_sources_without_registering_a_restore() {
        let project = project();
        fs::create_dir_all(project.path().join("src/generated")).unwrap();
        fs::write(
            project.path().join("src/generated/managed.v"),
            "// owned generated HDL\n",
        )
        .unwrap();
        let review = created_review(project.path().to_str().unwrap()).unwrap();
        assert!(review.id.starts_with("created:"));
        assert!(!review.can_restore);
        assert_eq!(review.files.len(), 2);
        assert!(review.files.iter().all(|file| file.before.is_none()));
        assert_eq!(
            review
                .files
                .iter()
                .find(|file| file.path == "src/top.sv")
                .unwrap()
                .after
                .as_deref(),
            Some("// existing user edits\n")
        );
        assert!(review.skipped > 0);
        let state = ChatCheckpointState::default();
        assert!(restore(&state, &review.id, |_| Ok(()))
            .unwrap_err()
            .contains("review-only"));
        assert!(state.0.lock().unwrap().is_empty());
        assert!(project.path().join("src/top.sv").exists());
        assert!(project.path().join("allora-project.json").exists());
    }
    #[test]
    fn restores_preexisting_work_additions_and_deletions_without_touching_new_files() {
        let project = project();
        let state = ChatCheckpointState::default();
        let id = create(&state, project.path().to_str().unwrap()).unwrap().id;
        fs::remove_file(project.path().join("src/top.sv")).unwrap();
        fs::write(project.path().join("src/new.sv"), "module new; endmodule\n").unwrap();
        let reviewed = review(&state, &id).unwrap();
        assert_eq!(reviewed.files.len(), 2);
        fs::write(project.path().join("src/later.sv"), "// later user file\n").unwrap();
        assert_eq!(restore(&state, &id, |_| Ok(())).unwrap().restored, 2);
        assert_eq!(
            fs::read_to_string(project.path().join("src/top.sv")).unwrap(),
            "// existing user edits\n"
        );
        assert!(!project.path().join("src/new.sv").exists());
        assert!(project.path().join("src/later.sv").exists());
    }
    #[test]
    fn newer_user_edits_refuse_entire_restore_and_review_does_not_reauthorize_them() {
        let project = project();
        let state = ChatCheckpointState::default();
        let id = create(&state, project.path().to_str().unwrap()).unwrap().id;
        fs::write(project.path().join("src/top.sv"), "// AI edit\n").unwrap();
        fs::write(project.path().join("src/a.sv"), "// addition\n").unwrap();
        review(&state, &id).unwrap();
        fs::write(project.path().join("src/top.sv"), "// newer user edit\n").unwrap();
        assert_eq!(
            review(&state, &id)
                .unwrap()
                .files
                .iter()
                .find(|f| f.path == "src/top.sv")
                .unwrap()
                .after
                .as_deref(),
            Some("// AI edit\n")
        );
        assert!(restore(&state, &id, |_| Ok(()))
            .unwrap_err()
            .contains("changed after"));
        assert!(project.path().join("src/a.sv").exists());
        assert_eq!(
            fs::read_to_string(project.path().join("src/top.sv")).unwrap(),
            "// newer user edit\n"
        );
    }
    #[test]
    fn failure_rolls_back_all_committed_files() {
        let project = project();
        fs::write(project.path().join("src/a.sv"), "// before\n").unwrap();
        let state = ChatCheckpointState::default();
        let id = create(&state, project.path().to_str().unwrap()).unwrap().id;
        fs::write(project.path().join("src/a.sv"), "// after\n").unwrap();
        fs::write(project.path().join("src/top.sv"), "// after\n").unwrap();
        review(&state, &id).unwrap();
        let result = restore(&state, &id, |index| {
            if index == 1 {
                Err("injected failure".into())
            } else {
                Ok(())
            }
        });
        assert!(result.unwrap_err().contains("rolled back"));
        for name in ["src/a.sv", "src/top.sv"] {
            assert_eq!(
                fs::read_to_string(project.path().join(name)).unwrap(),
                "// after\n"
            );
        }
    }
    #[cfg(unix)]
    #[test]
    fn replacing_project_root_after_preflight_cannot_restore_into_the_replacement() {
        let project = project();
        let original = tempfile::tempdir().unwrap();
        let state = ChatCheckpointState::default();
        let id = create(&state, project.path().to_str().unwrap()).unwrap().id;
        fs::write(project.path().join("src/top.sv"), "// after\n").unwrap();
        review(&state, &id).unwrap();
        let result = restore(&state, &id, |_| {
            fs::rename(project.path(), original.path().join("moved-project")).unwrap();
            fs::create_dir_all(project.path().join("src")).unwrap();
            fs::write(project.path().join("allora-project.json"), "{}").unwrap();
            fs::write(project.path().join("src/top.sv"), "// after\n").unwrap();
            Ok(())
        });
        assert!(result.unwrap_err().contains("directory was replaced"));
        assert_eq!(
            fs::read_to_string(project.path().join("src/top.sv")).unwrap(),
            "// after\n"
        );
    }
    #[test]
    fn a_concurrent_pending_edit_rolls_back_earlier_restores_and_preserves_the_edit() {
        let project = project();
        fs::write(project.path().join("src/a.sv"), "// before\n").unwrap();
        let state = ChatCheckpointState::default();
        let id = create(&state, project.path().to_str().unwrap()).unwrap().id;
        fs::write(project.path().join("src/a.sv"), "// AI after\n").unwrap();
        fs::write(project.path().join("src/top.sv"), "// AI after\n").unwrap();
        review(&state, &id).unwrap();
        let result = restore(&state, &id, |index| {
            if index == 1 {
                fs::write(
                    project.path().join("src/top.sv"),
                    "// concurrent user edit\n",
                )
                .unwrap();
            }
            Ok(())
        });
        assert!(result.unwrap_err().contains("rolled back"));
        assert_eq!(
            fs::read_to_string(project.path().join("src/a.sv")).unwrap(),
            "// AI after\n"
        );
        assert_eq!(
            fs::read_to_string(project.path().join("src/top.sv")).unwrap(),
            "// concurrent user edit\n"
        );
    }
    #[test]
    fn generated_owned_files_and_binary_outputs_are_excluded() {
        let project = project();
        for folder in ["assets", "src/generated", "Register_Map", "build", ".git"] {
            fs::create_dir_all(project.path().join(folder)).unwrap();
            fs::write(project.path().join(folder).join("managed.json"), "{}").unwrap();
        }
        fs::write(project.path().join("src/binary.sv"), [0, 1, 2]).unwrap();
        let state = ChatCheckpointState::default();
        let id = create(&state, project.path().to_str().unwrap()).unwrap().id;
        fs::write(
            project.path().join("src/generated/managed.json"),
            "{\"owned\":true}",
        )
        .unwrap();
        fs::write(project.path().join("src/binary.sv"), "now text").unwrap();
        let review = review(&state, &id).unwrap();
        assert!(review.files.is_empty());
        assert!(review.skipped >= 6);
    }
    #[cfg(unix)]
    #[test]
    fn refuses_symlinked_sources_and_symlink_substitution_during_restore() {
        let project = project();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("top.sv"), "// outside\n").unwrap();
        let state = ChatCheckpointState::default();
        let id = create(&state, project.path().to_str().unwrap()).unwrap().id;
        fs::write(project.path().join("src/top.sv"), "// changed\n").unwrap();
        review(&state, &id).unwrap();
        fs::rename(
            project.path().join("src"),
            project.path().join("original-src"),
        )
        .unwrap();
        std::os::unix::fs::symlink(outside.path(), project.path().join("src")).unwrap();
        assert!(restore(&state, &id, |_| Ok(()))
            .unwrap_err()
            .contains("symbolic"));
        assert_eq!(
            fs::read_to_string(outside.path().join("top.sv")).unwrap(),
            "// outside\n"
        );
        assert!(create(&state, project.path().to_str().unwrap()).is_err());
    }
    #[test]
    fn text_that_becomes_binary_cannot_be_mistaken_for_a_deleted_source() {
        let project = project();
        let state = ChatCheckpointState::default();
        let id = create(&state, project.path().to_str().unwrap()).unwrap().id;
        fs::write(project.path().join("src/top.sv"), [0, 1, 2]).unwrap();
        assert!(review(&state, &id)
            .unwrap_err()
            .contains("no longer a supported"));
        assert!(restore(&state, &id, |_| Ok(())).is_err());
        assert_eq!(
            fs::read(project.path().join("src/top.sv")).unwrap(),
            vec![0, 1, 2]
        );
    }
    #[test]
    fn path_validation_rejects_traversal_and_generated_ownership_directories() {
        let project = project();
        for path in [
            "../top.sv",
            "/top.sv",
            "src/../top.sv",
            "src/generated/rom.v",
            "Register_Map/top.sv",
            "assets/sources/input.txt",
            "src\\other.sv",
        ] {
            assert!(checked_path(project.path(), path).is_err(), "{path}");
        }
    }
    #[test]
    fn metadata_must_be_regular_valid_project_metadata_and_review_is_required() {
        let project = project();
        let state = ChatCheckpointState::default();
        let id = create(&state, project.path().to_str().unwrap()).unwrap().id;
        assert!(restore(&state, &id, |_| Ok(()))
            .unwrap_err()
            .contains("Review"));
        fs::write(project.path().join("allora-project.json"), "[]").unwrap();
        assert!(create(&state, project.path().to_str().unwrap()).is_err());
        assert!(review(&state, "expired").unwrap_err().contains("restart"));
    }
}
