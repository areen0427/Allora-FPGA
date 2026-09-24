use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
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
    for dir in search_directories() {
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
    let mut child = Command::new(path)
        .args(args)
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
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout.join();
                let _ = stderr.join();
                return Err("The CLI check timed out.".into());
            }
            Err(_) => {
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
    check_with_path(provider, find_executable(provider))
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
        let (_dir, path) = fake_cli("exec sleep 2");
        assert!(run_limited(&path, &["--version"], Duration::from_millis(60)).is_err());
    }

    #[test]
    fn provider_ids_are_allowlisted() {
        assert!(Provider::parse("codex").is_ok());
        assert!(Provider::parse("claude").is_ok());
        assert!(Provider::parse("other").is_err());
    }
}
