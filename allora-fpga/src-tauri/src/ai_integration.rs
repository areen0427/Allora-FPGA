use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Clone, Copy)]
enum Provider {
    Codex,
    Claude,
}

impl Provider {
    fn parse(id: &str) -> Result<Self, String> {
        match id {
            "codex" => Ok(Self::Codex),
            "claude" => Ok(Self::Claude),
            _ => Err("Unknown AI provider.".into()),
        }
    }
    fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
        }
    }
    fn binary(self) -> &'static str {
        self.id()
    }
    fn auth_args(self) -> &'static [&'static str] {
        match self {
            Self::Codex => &["login", "status"],
            Self::Claude => &["auth", "status", "--json"],
        }
    }
    fn login_args(self) -> &'static str {
        match self {
            Self::Codex => "login",
            Self::Claude => "auth login",
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderStatus {
    provider: &'static str,
    installed: bool,
    version: Option<String>,
    executable_path: Option<String>,
    authenticated: bool,
    state: &'static str,
    error: Option<String>,
    warning: Option<String>,
}

static CODEX_RUNTIME_ROOT: OnceLock<PathBuf> = OnceLock::new();
static CODEX_RUNTIME_UPDATE: OnceLock<Result<PathBuf, String>> = OnceLock::new();

pub(crate) fn configure_codex_runtime(path: PathBuf) {
    let _ = CODEX_RUNTIME_ROOT.set(path);
}

fn cached_codex_runtime(root: &Path) -> Option<PathBuf> {
    let path: PathBuf = serde_json::from_slice(&fs::read(root.join("active.json")).ok()?).ok()?;
    let path = path.canonicalize().ok()?;
    // Only an Allora-owned, versioned installation can be selected from cache.
    (path.starts_with(root.canonicalize().ok()?) && path.is_file()).then_some(path)
}

#[cfg(unix)]
fn update_codex_runtime(root: &Path) -> Result<PathBuf, String> {
    use std::io::Write;
    fs::create_dir_all(root).map_err(|_| "Cannot prepare Allora's Codex runtime.".to_string())?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Cannot check Codex updates.".to_string())?;
    let script = client
        .get("https://chatgpt.com/codex/install.sh")
        .send()
        .and_then(|response| response.error_for_status())
        .and_then(|response| response.text())
        .map_err(|_| "Could not check for a Codex update. Using the previous CLI.".to_string())?;
    let mut installer = tempfile::NamedTempFile::new_in(root)
        .map_err(|_| "Cannot prepare the Codex installer.".to_string())?;
    installer
        .write_all(script.as_bytes())
        .map_err(|_| "Cannot save the Codex installer.".to_string())?;
    let temporary = root.join("tmp");
    fs::create_dir_all(&temporary).map_err(|_| "Cannot prepare the Codex download.".to_string())?;
    let mut command = Command::new("/bin/sh");
    command
        .arg(installer.path())
        .env("CODEX_HOME", root)
        .env("CODEX_RELEASE", "latest")
        .env("CODEX_NON_INTERACTIVE", "1")
        // Stage a private package only: no shell profiles, PATH changes,
        // global uninstall, daemon startup, or modifications to account state.
        .env("CODEX_INSTALL_DAEMON_ONLY", "1")
        .env("CODEX_INSTALL_DEFER_SELECTION", "1")
        .env("TMPDIR", &temporary);
    let output = run_command_limited(command, Duration::from_secs(90))?;
    if !output.success {
        return Err("Codex update failed. Using the previous CLI.".into());
    }
    let selected = root.join("packages/app-server-daemon/.migration-current");
    let binary = [selected.join("bin/codex"), selected.join("codex")]
        .into_iter()
        .find(|path| path.is_file())
        .and_then(|path| path.canonicalize().ok())
        .ok_or("The Codex update did not produce a CLI.")?;
    let version = run_limited(&binary, &["--version"], Duration::from_secs(8))?;
    if !version.success || !version.stdout.starts_with("codex-cli ") {
        return Err("The new Codex CLI could not be verified. Using the previous CLI.".into());
    }
    let mut active = tempfile::NamedTempFile::new_in(root).map_err(|error| error.to_string())?;
    serde_json::to_writer(active.as_file_mut(), &binary).map_err(|error| error.to_string())?;
    active
        .persist(root.join("active.json"))
        .map_err(|error| error.to_string())?;
    Ok(binary)
}

#[cfg(not(unix))]
fn update_codex_runtime(_root: &Path) -> Result<PathBuf, String> {
    Err("Automatic Codex updates currently support macOS and Linux. Update the installed CLI manually.".into())
}

fn search_directories() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> =
        env::split_paths(&env::var_os("PATH").unwrap_or_default()).collect();
    #[cfg(target_os = "macos")]
    {
        dirs.extend(
            [
                "/opt/homebrew/bin",
                "/usr/local/bin",
                "/opt/local/bin",
                "/usr/bin",
            ]
            .iter()
            .map(PathBuf::from),
        );
        if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
            for relative in [
                ".local/bin",
                ".npm-global/bin",
                ".volta/bin",
                ".bun/bin",
                ".cargo/bin",
                "Library/pnpm",
                ".local/share/mise/shims",
                ".asdf/shims",
            ] {
                dirs.push(home.join(relative));
            }
            for manager in [".nvm/versions/node", ".fnm/node-versions"] {
                if let Ok(versions) = fs::read_dir(home.join(manager)) {
                    for version in versions.flatten() {
                        dirs.push(version.path().join("bin"));
                        dirs.push(version.path().join("installation/bin"));
                    }
                }
            }
        }
    }
    dirs
}

fn is_app_managed_codex(provider: Provider, path: &Path) -> bool {
    let home = env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    is_app_managed_codex_at_home(provider, path, &home)
}

fn is_app_managed_codex_at_home(provider: Provider, path: &Path, home: &Path) -> bool {
    if !matches!(provider, Provider::Codex) {
        return false;
    }
    let resolved = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let resolved_home = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());
    let in_codex_runtime = resolved.starts_with(resolved_home.join(".codex/packages/standalone"));
    let in_app_bundle = resolved
        .components()
        .any(|component| component.as_os_str().to_string_lossy().ends_with(".app"));
    in_codex_runtime || in_app_bundle
}

fn find_executable(provider: Provider) -> Option<PathBuf> {
    let mut codex_path = env::var_os("ALLORA_CODEX_PATH").map(PathBuf::from);
    if matches!(provider, Provider::Codex) && codex_path.is_none() {
        if let Some(root) = CODEX_RUNTIME_ROOT.get() {
            codex_path = CODEX_RUNTIME_UPDATE
                .get_or_init(|| update_codex_runtime(root))
                .as_ref()
                .ok()
                .cloned()
                .or_else(|| cached_codex_runtime(root));
        }
    }
    #[cfg(debug_assertions)]
    let codex_path = codex_path.or_else(|| {
        // Development builds use the tested project dependency, rather than
        // whichever stale global CLI happens to appear first on PATH.
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../node_modules/.bin")
            .join(if cfg!(windows) { "codex.cmd" } else { "codex" });
        path.is_file().then_some(path)
    });
    find_executable_in(provider, search_directories(), codex_path)
}

fn find_executable_in(
    provider: Provider,
    directories: Vec<PathBuf>,
    codex_path: Option<PathBuf>,
) -> Option<PathBuf> {
    // An explicit runtime override applies to status, login, and chat alike.
    // Never silently fall back to an older installation when it is invalid.
    if matches!(provider, Provider::Codex) {
        if let Some(path) = codex_path {
            return path.canonicalize().ok().filter(|path| path.is_file());
        }
    }
    for dir in directories {
        let candidate = dir.join(provider.binary());
        if candidate.is_file() && !is_app_managed_codex(provider, &candidate) {
            return Some(candidate);
        }
        #[cfg(windows)]
        for suffix in [".exe", ".cmd"] {
            let candidate = dir.join(format!("{}{}", provider.binary(), suffix));
            if candidate.is_file() && !is_app_managed_codex(provider, &candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

/// Use the same user-installed CLI and account checks as AI settings.
pub(crate) fn authenticated_codex() -> Result<PathBuf, String> {
    let path = find_executable(Provider::Codex)
        .ok_or_else(|| "Install the Codex CLI in AI settings before starting chat.".to_string())?;
    let status = check_with_path(Provider::Codex, Some(path.clone()));
    if !status.authenticated {
        return Err(status.error.unwrap_or_else(|| {
            "Connect your Codex account in AI settings before starting chat.".to_string()
        }));
    }
    Ok(path)
}

struct RunOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

fn read_capped<R: std::io::Read>(mut reader: R) -> String {
    use std::io::Read;
    let mut bytes = Vec::new();
    let _ = reader.by_ref().take(4096).read_to_end(&mut bytes);
    let _ = std::io::copy(&mut reader, &mut std::io::sink());
    String::from_utf8_lossy(&bytes).trim().to_string()
}

fn run_limited(path: &Path, args: &[&str], timeout: Duration) -> Result<RunOutput, String> {
    let mut command = Command::new(path);
    command.args(args);
    run_command_limited(command, timeout)
}

fn run_command_limited(mut command: Command, timeout: Duration) -> Result<RunOutput, String> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "The CLI could not be started.".to_string())?;
    let child_stdout = child.stdout.take().expect("piped stdout");
    let child_stderr = child.stderr.take().expect("piped stderr");
    let stdout = thread::spawn(move || read_capped(child_stdout));
    let stderr = thread::spawn(move || read_capped(child_stderr));
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Ok(RunOutput {
                    success: status.success(),
                    stdout: stdout.join().unwrap_or_default(),
                    stderr: stderr.join().unwrap_or_default(),
                });
            }
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                #[cfg(unix)]
                unsafe {
                    libc::kill(-(child.id() as i32), libc::SIGKILL);
                }
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout.join();
                let _ = stderr.join();
                return Err("The CLI check timed out.".into());
            }
            Err(_) => {
                #[cfg(unix)]
                unsafe {
                    libc::kill(-(child.id() as i32), libc::SIGKILL);
                }
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout.join();
                let _ = stderr.join();
                return Err("The CLI check failed.".into());
            }
        }
    }
}

fn check(provider: Provider) -> AiProviderStatus {
    let mut status = check_with_path(provider, find_executable(provider));
    if matches!(provider, Provider::Codex) && env::var_os("ALLORA_CODEX_PATH").is_none() {
        status.warning = CODEX_RUNTIME_UPDATE
            .get()
            .and_then(|result| result.as_ref().err())
            .cloned();
    }
    status
}

fn check_with_path(provider: Provider, found: Option<PathBuf>) -> AiProviderStatus {
    let mut result = AiProviderStatus {
        provider: provider.id(),
        installed: false,
        version: None,
        executable_path: None,
        authenticated: false,
        state: "not_installed",
        error: None,
        warning: None,
    };
    let Some(path) = found else {
        return result;
    };
    result.executable_path = Some(path.to_string_lossy().into_owned());
    match run_limited(&path, &["--version"], Duration::from_secs(8)) {
        Ok(output) if output.success && !output.stdout.is_empty() => {
            result.installed = true;
            result.version = Some(
                output
                    .stdout
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .chars()
                    .take(100)
                    .collect(),
            );
        }
        Ok(_) => {
            result.state = "error";
            result.error = Some("The CLI did not return a valid version.".into());
            return result;
        }
        Err(error) => {
            result.state = "error";
            result.error = Some(error);
            return result;
        }
    }
    match run_limited(&path, provider.auth_args(), Duration::from_secs(10)) {
        Ok(output) => {
            let status_text = format!("{}\n{}", output.stdout, output.stderr);
            match provider {
                Provider::Codex if status_text.to_ascii_lowercase().contains("not logged in") => {
                    result.state = "installed_not_authenticated";
                }
                Provider::Codex
                    if output.success && status_text.to_ascii_lowercase().contains("logged in") =>
                {
                    result.authenticated = true;
                    result.state = "ready";
                }
                Provider::Claude => {
                    match serde_json::from_str::<serde_json::Value>(&output.stdout)
                        .ok()
                        .and_then(|value| value.get("loggedIn").and_then(|value| value.as_bool()))
                    {
                        Some(true) if output.success => {
                            result.authenticated = true;
                            result.state = "ready";
                        }
                        Some(false) => result.state = "installed_not_authenticated",
                        _ => {
                            result.state = "error";
                            result.error =
                                Some("The CLI returned an unexpected account status.".into());
                        }
                    }
                }
                _ => {
                    result.state = "error";
                    result.error = Some("The CLI returned an unexpected account status.".into());
                }
            }
        }
        Err(error) => {
            result.state = "error";
            result.error = Some(error);
        }
    }
    result
}

#[tauri::command]
pub async fn ai_provider_status(provider: String) -> Result<AiProviderStatus, String> {
    let provider = Provider::parse(&provider)?;
    tauri::async_runtime::spawn_blocking(move || check(provider))
        .await
        .map_err(|_| "CLI check failed.".to_string())
}

#[tauri::command]
pub async fn ai_provider_start_login(provider: String) -> Result<(), String> {
    let provider = Provider::parse(&provider)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = find_executable(provider)
            .ok_or_else(|| "Install the CLI before connecting.".to_string())?;
        #[cfg(target_os = "macos")]
        {
            // Terminal owns the interactive CLI flow. Only the executable path and fixed login subcommand are passed.
            let quoted_path = format!("'{}'", path.to_string_lossy().replace("'", "'\"'\"'"));
            let script = format!(
                "tell application \"Terminal\"\nactivate\ndo script \"{} {}\"\nend tell",
                quoted_path.replace('\\', "\\\\").replace('"', "\\\""),
                provider.login_args()
            );
            let output = run_limited(
                Path::new("/usr/bin/osascript"),
                &["-e", &script],
                Duration::from_secs(10),
            )
            .map_err(|_| "Terminal could not be opened.".to_string())?;
            if output.success {
                Ok(())
            } else {
                Err("Terminal did not start the provider login.".to_string())
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = path;
            Err(
                "Open a terminal and run the provider login command, then choose Check Again."
                    .to_string(),
            )
        }
    })
    .await
    .map_err(|_| "Could not start provider login.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn runtime_cache_rejects_external_paths_and_keeps_valid_previous_cli() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        let active = root.path().join("active.json");
        fs::write(&active, serde_json::to_vec(outside.path()).unwrap()).unwrap();
        assert!(cached_codex_runtime(root.path()).is_none());
        let binary = root.path().join("previous-codex");
        fs::write(&binary, "binary").unwrap();
        fs::write(&active, serde_json::to_vec(&binary).unwrap()).unwrap();
        assert_eq!(
            cached_codex_runtime(root.path()),
            Some(binary.canonicalize().unwrap())
        );
        fs::write(&active, "invalid").unwrap();
        assert!(cached_codex_runtime(root.path()).is_none());
    }

    #[test]
    #[ignore = "downloads the official CLI into ALLORA_RUNTIME_SMOKE_ROOT"]
    fn live_managed_runtime_update() {
        let root = PathBuf::from(
            env::var("ALLORA_RUNTIME_SMOKE_ROOT").expect("set a scoped runtime directory"),
        );
        configure_codex_runtime(root.clone());
        let status = check(Provider::Codex);
        assert!(
            status.warning.is_none(),
            "update failed: {:?}",
            status.warning
        );
        assert_eq!(status.state, "ready");
        let executable = authenticated_codex().expect("managed CLI authentication");
        assert_eq!(Some(executable.clone()), cached_codex_runtime(&root));
        assert_eq!(Some(executable), find_executable(Provider::Codex));
        println!(
            "Managed Codex update and existing login verified: {:?}",
            status.version
        );
        let models = tauri::async_runtime::block_on(crate::ai_chat::ai_chat_models())
            .expect("managed model catalog");
        let models = serde_json::to_value(models).unwrap();
        assert!(models
            .as_array()
            .unwrap()
            .iter()
            .any(|model| model["model"] == "gpt-6.1-sol"));
        fs::write(
            root.join("models.json"),
            serde_json::to_vec(&models).unwrap(),
        )
        .unwrap();
    }
    #[test]
    fn explicit_codex_runtime_takes_precedence_without_affecting_claude() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("codex");
        let current = dir.path().join("current-codex");
        let claude = dir.path().join("claude");
        for path in [&old, &current, &claude] {
            fs::write(path, "binary").unwrap();
        }
        let directories = vec![dir.path().to_path_buf()];
        assert_eq!(
            find_executable_in(Provider::Codex, directories.clone(), Some(current.clone())),
            Some(current.canonicalize().unwrap())
        );
        assert_eq!(
            find_executable_in(Provider::Claude, directories.clone(), Some(old)),
            Some(claude)
        );
        assert_eq!(
            find_executable_in(
                Provider::Codex,
                directories,
                Some(dir.path().join("missing"))
            ),
            None
        );
    }
    #[cfg(unix)]
    fn fake_cli(script: &str) -> (tempfile::TempDir, PathBuf) {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fake-cli");
        fs::write(&path, format!("#!/bin/sh\n{script}\n")).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        (dir, path)
    }

    #[cfg(unix)]
    #[test]
    fn app_managed_codex_is_not_a_user_cli_installation() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let runtime = home.join(".codex/packages/standalone/releases/1/bin/codex");
        fs::create_dir_all(runtime.parent().unwrap()).unwrap();
        fs::write(&runtime, "binary").unwrap();
        let link = home.join("bin/codex");
        fs::create_dir_all(link.parent().unwrap()).unwrap();
        symlink(&runtime, &link).unwrap();
        assert!(is_app_managed_codex_at_home(Provider::Codex, &link, home));
        assert!(!is_app_managed_codex_at_home(Provider::Claude, &link, home));
        let user_cli = home.join("bin/user-codex");
        fs::write(&user_cli, "binary").unwrap();
        assert!(!is_app_managed_codex_at_home(
            Provider::Codex,
            &user_cli,
            home
        ));
    }

    #[cfg(unix)]
    #[test]
    fn codex_states_follow_actual_cli_results() {
        let missing = check_with_path(Provider::Codex, None);
        assert_eq!(missing.state, "not_installed");
        let (_dir, path) = fake_cli(
            r#"if [ "$1" = --version ]; then echo 'codex-cli 1.0'; else echo 'Not logged in'; exit 1; fi"#,
        );
        let disconnected = check_with_path(Provider::Codex, Some(path.clone()));
        assert_eq!(disconnected.state, "installed_not_authenticated");
        assert_eq!(disconnected.version.as_deref(), Some("codex-cli 1.0"));
        fs::write(&path, "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 'codex-cli 1.0'; else echo 'Not logged in'; fi\n").unwrap();
        assert_eq!(
            check_with_path(Provider::Codex, Some(path.clone())).state,
            "installed_not_authenticated"
        );
        fs::write(&path, "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 'codex-cli 1.0'; else echo 'Logged in using ChatGPT' >&2; fi\n").unwrap();
        assert_eq!(check_with_path(Provider::Codex, Some(path)).state, "ready");
    }

    #[cfg(unix)]
    #[test]
    fn claude_rejects_malformed_auth_status_and_accepts_valid_json() {
        let (_dir, path) =
            fake_cli(r#"if [ "$1" = --version ]; then echo '2.0'; else echo 'broken'; fi"#);
        assert_eq!(
            check_with_path(Provider::Claude, Some(path.clone())).state,
            "error"
        );
        fs::write(&path, "#!/bin/sh\nif [ \"$1\" = --version ]; then echo '2.0'; else echo '{\"loggedIn\":false}'; fi\n").unwrap();
        assert_eq!(
            check_with_path(Provider::Claude, Some(path.clone())).state,
            "installed_not_authenticated"
        );
        fs::write(&path, "#!/bin/sh\nif [ \"$1\" = --version ]; then echo '2.0'; else echo '{\"loggedIn\":true}'; fi\n").unwrap();
        assert_eq!(check_with_path(Provider::Claude, Some(path)).state, "ready");
    }

    #[cfg(unix)]
    #[test]
    fn cli_timeout_terminates_child() {
        let (_dir, path) = fake_cli("sleep 3 & wait");
        let started = Instant::now();
        assert!(run_limited(&path, &["--version"], Duration::from_millis(60)).is_err());
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "descendants must not keep the output pipes open after timeout"
        );
    }

    #[test]
    fn provider_ids_are_allowlisted() {
        assert!(Provider::parse("codex").is_ok());
        assert!(Provider::parse("claude").is_ok());
        assert!(Provider::parse("other").is_err());
    }
}
