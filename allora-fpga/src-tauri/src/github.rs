use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use keyring::Entry;
use rand::RngCore;
use reqwest::blocking::{Client, Response};
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tempfile::TempDir;
use url::Url;

const GITHUB_API: &str = "https://api.github.com";
const KEYRING_SERVICE: &str = "com.areendabadghav.allorafpga.github";
const KEYRING_ACCOUNT: &str = "github.com";
const USER_AGENT_VALUE: &str = "Allora-FPGA";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServiceError {
    code: String,
    message: String,
    detail: Option<String>,
}

impl ServiceError {
    pub(crate) fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            detail: None,
        }
    }

    fn with_detail(code: &str, message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            detail: Some(detail.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitHubUser {
    id: u64,
    login: String,
    name: Option<String>,
    avatar_url: String,
    html_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitHubAuthStatus {
    configured: bool,
    authenticated: bool,
    user: Option<GitHubUser>,
    message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolAvailability {
    git_available: bool,
    git_version: Option<String>,
    gh_available: bool,
    gh_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitChange {
    path: String,
    staged: bool,
    unstaged: bool,
    untracked: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitRepositoryStatus {
    is_repository: bool,
    has_commits: bool,
    branch: Option<String>,
    detached: bool,
    upstream: Option<String>,
    origin_url: Option<String>,
    ahead: Option<u32>,
    behind: Option<u32>,
    changes: Vec<GitChange>,
    staged_count: usize,
    unstaged_count: usize,
    untracked_count: usize,
    clean: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitHubRepository {
    id: u64,
    name: String,
    full_name: String,
    description: Option<String>,
    private: bool,
    archived: bool,
    clone_url: String,
    html_url: String,
    default_branch: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateRepositoryRequest {
    name: String,
    description: String,
    private: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectPathRequest {
    project_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommitRequest {
    project_path: String,
    message: String,
    author_name: Option<String>,
    author_email: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetOriginRequest {
    project_path: String,
    remote_url: String,
}

pub(crate) fn tool_availability() -> ToolAvailability {
    let git = command_version("git", &["--version"]);
    let gh = command_version("gh", &["--version"]);
    ToolAvailability {
        git_available: git.is_some(),
        git_version: git,
        gh_available: gh.is_some(),
        gh_version: gh,
    }
}

pub(crate) fn auth_status() -> Result<GitHubAuthStatus, ServiceError> {
    if github_client_id().is_none() {
        return Ok(GitHubAuthStatus {
            configured: false,
            authenticated: false,
            user: None,
            message: Some(
                "GitHub sign-in needs an OAuth client ID configured by the app owner.".to_string(),
            ),
        });
    }

    let token = match read_token() {
        Ok(token) => token,
        Err(error) if error.code == "signed_out" => {
            return Ok(GitHubAuthStatus {
                configured: true,
                authenticated: false,
                user: None,
                message: None,
            });
        }
        Err(error) => return Err(error),
    };

    match fetch_user(&token) {
        Ok(user) => Ok(GitHubAuthStatus {
            configured: true,
            authenticated: true,
            user: Some(user),
            message: None,
        }),
        Err(error)
            if matches!(
                error.code.as_str(),
                "authentication_failed" | "token_expired"
            ) =>
        {
            let _ = delete_token();
            Ok(GitHubAuthStatus {
                configured: true,
                authenticated: false,
                user: None,
                message: Some(
                    "Your GitHub authorization expired or was revoked. Sign in again to continue."
                        .to_string(),
                ),
            })
        }
        Err(error) => Err(error),
    }
}

pub(crate) fn sign_in(app: AppHandle) -> Result<GitHubAuthStatus, ServiceError> {
    let client_id = github_client_id().ok_or_else(|| {
        ServiceError::new(
            "oauth_not_configured",
            "GitHub sign-in is not configured in this build. Set ALLORA_GITHUB_CLIENT_ID when building the desktop app.",
        )
    })?;

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| {
        ServiceError::with_detail(
            "oauth_callback_unavailable",
            "Allora could not start the local sign-in callback.",
            error.to_string(),
        )
    })?;
    listener.set_nonblocking(true).map_err(|error| {
        ServiceError::with_detail(
            "oauth_callback_unavailable",
            "Allora could not prepare the local sign-in callback.",
            error.to_string(),
        )
    })?;
    let port = listener
        .local_addr()
        .map_err(|error| ServiceError::new("oauth_callback_unavailable", error.to_string()))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/oauth/callback");
    let verifier = random_urlsafe(64);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_urlsafe(32);

    let mut authorization_url = Url::parse("https://github.com/login/oauth/authorize")
        .map_err(|error| ServiceError::new("oauth_url_invalid", error.to_string()))?;
    authorization_url
        .query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("scope", "repo")
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");

    app.opener()
        .open_url(authorization_url.as_str(), None::<&str>)
        .map_err(|error| {
            ServiceError::with_detail(
                "browser_open_failed",
                "Allora could not open GitHub in your browser.",
                error.to_string(),
            )
        })?;

    let callback = wait_for_oauth_callback(&listener, &state, Duration::from_secs(180))?;
    let client = github_client()?;
    let response = client
        .post("https://github.com/login/oauth/access_token")
        .header(ACCEPT, "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("code", callback.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .map_err(map_network_error)?;
    let body: Value = response.json().map_err(|error| {
        ServiceError::with_detail(
            "oauth_response_invalid",
            "GitHub returned an unreadable sign-in response.",
            error.to_string(),
        )
    })?;
    if let Some(error_code) = body.get("error").and_then(Value::as_str) {
        return Err(ServiceError::with_detail(
            "authentication_failed",
            "GitHub could not complete sign-in. Try again.",
            format!(
                "{}: {}",
                error_code,
                body.get("error_description")
                    .and_then(Value::as_str)
                    .unwrap_or("authorization was not completed")
            ),
        ));
    }
    let token = body
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ServiceError::new(
                "authentication_failed",
                "GitHub did not return an access token. Try signing in again.",
            )
        })?;
    store_token(token)?;
    let user = match fetch_user(token) {
        Ok(user) => user,
        Err(error) => {
            let _ = delete_token();
            return Err(error);
        }
    };

    Ok(GitHubAuthStatus {
        configured: true,
        authenticated: true,
        user: Some(user),
        message: None,
    })
}

pub(crate) fn sign_out() -> Result<(), ServiceError> {
    delete_token()
}

pub(crate) fn list_repositories() -> Result<Vec<GitHubRepository>, ServiceError> {
    let token = read_token()?;
    let response = github_client()?
        .get(format!(
            "{GITHUB_API}/user/repos?affiliation=owner&sort=updated&per_page=100"
        ))
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .map_err(map_network_error)?;
    let value = checked_json(response)?;
    let repositories: Vec<RepositoryApiRecord> =
        serde_json::from_value(value).map_err(|error| {
            ServiceError::with_detail(
                "api_response_invalid",
                "GitHub returned repository data Allora could not read.",
                error.to_string(),
            )
        })?;
    Ok(repositories
        .into_iter()
        .filter(|repository| repository.permissions.push && !repository.archived)
        .map(Into::into)
        .collect())
}

pub(crate) fn create_repository(
    request: CreateRepositoryRequest,
) -> Result<GitHubRepository, ServiceError> {
    validate_repository_name(&request.name)?;
    if request.description.chars().count() > 350 {
        return Err(ServiceError::new(
            "invalid_description",
            "Repository descriptions must be 350 characters or fewer.",
        ));
    }
    let token = read_token()?;
    let response = github_client()?
        .post(format!("{GITHUB_API}/user/repos"))
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .json(&json!({
            "name": request.name.trim(),
            "description": request.description.trim(),
            "private": request.private,
            "auto_init": false
        }))
        .send()
        .map_err(map_network_error)?;
    let value = checked_json(response)?;
    let repository: RepositoryApiRecord = serde_json::from_value(value).map_err(|error| {
        ServiceError::with_detail(
            "api_response_invalid",
            "GitHub created the repository but returned data Allora could not read.",
            error.to_string(),
        )
    })?;
    Ok(repository.into())
}

pub(crate) fn repository_status(
    request: ProjectPathRequest,
) -> Result<GitRepositoryStatus, ServiceError> {
    let project = validate_project_path(&request.project_path)?;
    repository_status_at(&project)
}

pub(crate) fn initialize_repository(request: ProjectPathRequest) -> Result<(), ServiceError> {
    let project = validate_project_path(&request.project_path)?;
    if is_git_repository(&project) {
        return Ok(());
    }
    ensure_git_available()?;
    let output = Command::new("git")
        .args(["init", "--initial-branch=main"])
        .current_dir(&project)
        .output()
        .map_err(map_git_launch_error)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(git_output_error(
            "git_init_failed",
            "Git could not initialize this project.",
            &output,
        ))
    }
}

pub(crate) fn commit_all(request: CommitRequest) -> Result<GitRepositoryStatus, ServiceError> {
    let project = validate_project_path(&request.project_path)?;
    ensure_repository(&project)?;
    let message = request.message.trim();
    if message.is_empty() {
        return Err(ServiceError::new(
            "empty_commit_message",
            "Enter a short description of this version before committing.",
        ));
    }

    match (&request.author_name, &request.author_email) {
        (Some(name), Some(email)) if !name.trim().is_empty() && valid_email(email) => {
            run_git_checked(
                &project,
                &["config", "--local", "user.name", name.trim()],
                "git_identity_failed",
                "Git could not save the author name for this project.",
            )?;
            run_git_checked(
                &project,
                &["config", "--local", "user.email", email.trim()],
                "git_identity_failed",
                "Git could not save the author email for this project.",
            )?;
        }
        (Some(_), Some(_)) => {
            return Err(ServiceError::new(
                "invalid_identity",
                "Enter both a valid author name and email address.",
            ));
        }
        (Some(_), None) | (None, Some(_)) => {
            return Err(ServiceError::new(
                "invalid_identity",
                "Enter both an author name and email address, or leave both blank to use your Git configuration.",
            ));
        }
        (None, None) => {}
    }

    run_git_checked(
        &project,
        &["add", "--all"],
        "git_stage_failed",
        "Git could not stage the project files.",
    )?;
    let output = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(&project)
        .output()
        .map_err(map_git_launch_error)?;
    if !output.status.success() {
        let detail = command_detail(&output);
        let code = if detail.contains("user.email")
            || detail.contains("Author identity unknown")
            || detail.contains("unable to auto-detect email")
        {
            "git_identity_missing"
        } else if detail.contains("nothing to commit") {
            "nothing_to_commit"
        } else {
            "git_commit_failed"
        };
        let message = match code {
            "git_identity_missing" => {
                "Git needs an author name and email. Open Advanced, enter them for this project, and try again."
            }
            "nothing_to_commit" => "There are no project changes to commit.",
            _ => "Git could not create the commit.",
        };
        return Err(ServiceError::with_detail(code, message, detail));
    }
    repository_status_at(&project)
}

pub(crate) fn set_origin(request: SetOriginRequest) -> Result<GitRepositoryStatus, ServiceError> {
    let project = validate_project_path(&request.project_path)?;
    ensure_repository(&project)?;
    validate_remote_url(&request.remote_url)?;
    let current = git_optional(&project, &["remote", "get-url", "origin"])?;
    if let Some(current) = current {
        if normalize_remote(&current) == normalize_remote(&request.remote_url) {
            return repository_status_at(&project);
        }
        return Err(ServiceError::with_detail(
            "origin_conflict",
            "This project already has an origin remote. Allora will not replace it automatically.",
            format!("Existing origin: {current}"),
        ));
    }
    run_git_checked(
        &project,
        &["remote", "add", "origin", request.remote_url.trim()],
        "origin_add_failed",
        "Git could not connect this project to the selected GitHub repository.",
    )?;
    repository_status_at(&project)
}

pub(crate) fn push(request: ProjectPathRequest) -> Result<GitRepositoryStatus, ServiceError> {
    let project = validate_project_path(&request.project_path)?;
    let status = repository_status_at(&project)?;
    if !status.has_commits {
        return Err(ServiceError::new(
            "no_commits",
            "Create a commit before pushing this project.",
        ));
    }
    if status.detached || status.branch.is_none() {
        return Err(ServiceError::new(
            "detached_head",
            "Choose a local branch before pushing. Allora will not push a detached revision.",
        ));
    }
    let origin = status.origin_url.ok_or_else(|| {
        ServiceError::new(
            "origin_missing",
            "Connect this project to a GitHub repository before pushing.",
        )
    })?;
    let branch = status.branch.unwrap();

    let mut command = Command::new("git");
    command
        .args(["push", "--set-upstream", "origin", branch.as_str()])
        .current_dir(&project)
        .env("GIT_TERMINAL_PROMPT", "0");

    let _askpass;
    if is_github_https_remote(&origin) {
        let token = read_token()?;
        let username = fetch_user(&token)?.login;
        _askpass = Some(AskPass::new()?);
        let askpass = _askpass.as_ref().expect("askpass was created");
        command
            .env("GIT_ASKPASS", &askpass.script)
            .env("ALLORA_GIT_USERNAME", username)
            .env("ALLORA_GIT_TOKEN", token);
    } else {
        _askpass = None;
    }

    let output = command.output().map_err(map_git_launch_error)?;
    if !output.status.success() {
        let detail = command_detail(&output);
        let (code, message) = if detail.contains("non-fast-forward")
            || detail.contains("fetch first")
            || detail.contains("rejected")
        {
            (
                "push_rejected",
                "GitHub has changes that are not in this project. Allora did not overwrite them; review and integrate the remote history before trying again.",
            )
        } else if detail.contains("Authentication failed")
            || detail.contains("could not read Username")
            || detail.contains("403")
        {
            (
                "push_authentication_failed",
                "GitHub did not accept this push. Sign in again and confirm you have write access to the repository.",
            )
        } else if detail.contains("Could not resolve host") || detail.contains("Failed to connect")
        {
            (
                "offline",
                "GitHub could not be reached. Check your connection and try again.",
            )
        } else {
            ("push_failed", "Git could not push this project to GitHub.")
        };
        return Err(ServiceError::with_detail(code, message, detail));
    }
    repository_status_at(&project)
}

#[derive(Debug, Deserialize)]
struct RepositoryApiRecord {
    id: u64,
    name: String,
    full_name: String,
    description: Option<String>,
    private: bool,
    archived: bool,
    clone_url: String,
    html_url: String,
    default_branch: String,
    permissions: RepositoryPermissions,
}

#[derive(Debug, Deserialize)]
struct RepositoryPermissions {
    push: bool,
}

impl From<RepositoryApiRecord> for GitHubRepository {
    fn from(value: RepositoryApiRecord) -> Self {
        Self {
            id: value.id,
            name: value.name,
            full_name: value.full_name,
            description: value.description,
            private: value.private,
            archived: value.archived,
            clone_url: value.clone_url,
            html_url: value.html_url,
            default_branch: value.default_branch,
        }
    }
}

fn github_client_id() -> Option<String> {
    option_env!("ALLORA_GITHUB_CLIENT_ID")
        .map(str::to_string)
        .or_else(|| std::env::var("ALLORA_GITHUB_CLIENT_ID").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn github_client() -> Result<Client, ServiceError> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                USER_AGENT,
                USER_AGENT_VALUE.parse().expect("valid user agent"),
            );
            headers.insert(
                ACCEPT,
                "application/vnd.github+json"
                    .parse()
                    .expect("valid accept header"),
            );
            headers.insert(
                "X-GitHub-Api-Version",
                "2022-11-28".parse().expect("valid API version"),
            );
            headers
        })
        .build()
        .map_err(|error| ServiceError::new("http_client_failed", error.to_string()))
}

fn fetch_user(token: &str) -> Result<GitHubUser, ServiceError> {
    let response = github_client()?
        .get(format!("{GITHUB_API}/user"))
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .map_err(map_network_error)?;
    let value = checked_json(response)?;
    serde_json::from_value(value).map_err(|error| {
        ServiceError::with_detail(
            "api_response_invalid",
            "GitHub returned account data Allora could not read.",
            error.to_string(),
        )
    })
}

fn checked_json(response: Response) -> Result<Value, ServiceError> {
    let status = response.status();
    let value = response.json::<Value>().map_err(|error| {
        ServiceError::with_detail(
            "api_response_invalid",
            "GitHub returned an unreadable response.",
            error.to_string(),
        )
    })?;
    if status.is_success() {
        return Ok(value);
    }
    let github_message = value
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("GitHub rejected the request");
    let (code, message) = match status.as_u16() {
        401 => (
            "authentication_failed",
            "Your GitHub authorization expired or was revoked. Sign in again.",
        ),
        403 => (
            "permission_denied",
            "GitHub denied this action. Check repository access and organization authorization.",
        ),
        404 => (
            "not_found",
            "GitHub could not find that repository or account.",
        ),
        422 => (
            "repository_conflict",
            "That repository name is unavailable or the repository details are invalid.",
        ),
        429 => (
            "rate_limited",
            "GitHub is receiving too many requests. Wait a moment and try again.",
        ),
        _ => ("github_api_error", "GitHub could not complete this action."),
    };
    Err(ServiceError::with_detail(code, message, github_message))
}

fn map_network_error(error: reqwest::Error) -> ServiceError {
    if error.is_timeout() || error.is_connect() {
        ServiceError::with_detail(
            "offline",
            "GitHub could not be reached. Check your connection and try again.",
            error.to_string(),
        )
    } else {
        ServiceError::with_detail(
            "network_error",
            "The GitHub request could not be completed.",
            error.to_string(),
        )
    }
}

fn token_entry() -> Result<Entry, ServiceError> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| {
        ServiceError::with_detail(
            "credential_store_unavailable",
            "The operating system credential vault is unavailable.",
            error.to_string(),
        )
    })
}

fn store_token(token: &str) -> Result<(), ServiceError> {
    token_entry()?.set_password(token).map_err(|error| {
        ServiceError::with_detail(
            "credential_store_unavailable",
            "GitHub signed in, but Allora could not securely save the authorization.",
            error.to_string(),
        )
    })
}

fn read_token() -> Result<String, ServiceError> {
    token_entry()?.get_password().map_err(|error| match error {
        keyring::Error::NoEntry => ServiceError::new("signed_out", "Sign in to GitHub first."),
        _ => ServiceError::with_detail(
            "credential_store_unavailable",
            "Allora could not read the GitHub authorization from the operating system credential vault.",
            error.to_string(),
        ),
    })
}

fn delete_token() -> Result<(), ServiceError> {
    match token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(ServiceError::with_detail(
            "credential_store_unavailable",
            "Allora could not remove the GitHub authorization from the operating system credential vault.",
            error.to_string(),
        )),
    }
}

fn random_urlsafe(byte_count: usize) -> String {
    let mut bytes = vec![0u8; byte_count];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn wait_for_oauth_callback(
    listener: &TcpListener,
    expected_state: &str,
    timeout: Duration,
) -> Result<String, ServiceError> {
    let started = Instant::now();
    while started.elapsed() < timeout {
        match listener.accept() {
            Ok((mut stream, _)) => {
                if let Some(result) = parse_oauth_request(&mut stream, expected_state)? {
                    return Ok(result);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(75));
            }
            Err(error) => {
                return Err(ServiceError::with_detail(
                    "oauth_callback_failed",
                    "Allora could not receive the GitHub sign-in response.",
                    error.to_string(),
                ));
            }
        }
    }
    Err(ServiceError::new(
        "oauth_timeout",
        "GitHub sign-in timed out. Start again when you are ready.",
    ))
}

fn parse_oauth_request(
    stream: &mut TcpStream,
    expected_state: &str,
) -> Result<Option<String>, ServiceError> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| ServiceError::new("oauth_callback_failed", error.to_string()))?;
    let mut buffer = [0u8; 8192];
    let count = stream.read(&mut buffer).map_err(|error| {
        ServiceError::with_detail(
            "oauth_callback_failed",
            "Allora could not read the GitHub sign-in response.",
            error.to_string(),
        )
    })?;
    let request = String::from_utf8_lossy(&buffer[..count]);
    let target = match request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
    {
        Some(target) => target,
        None => return Ok(None),
    };
    let url = Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|error| ServiceError::new("oauth_callback_invalid", error.to_string()))?;
    if url.path() != "/oauth/callback" {
        respond_to_browser(stream, 404, "This callback is not recognized.");
        return Ok(None);
    }
    let parameters = url
        .query_pairs()
        .collect::<std::collections::HashMap<_, _>>();
    if parameters.get("state").map(|value| value.as_ref()) != Some(expected_state) {
        respond_to_browser(
            stream,
            400,
            "The sign-in state did not match. Return to Allora and try again.",
        );
        return Err(ServiceError::new(
            "oauth_state_mismatch",
            "GitHub sign-in could not be verified. Try again.",
        ));
    }
    if let Some(error) = parameters.get("error") {
        respond_to_browser(
            stream,
            400,
            "GitHub sign-in was cancelled. You can close this tab.",
        );
        return Err(ServiceError::with_detail(
            "oauth_cancelled",
            "GitHub sign-in was cancelled.",
            error.to_string(),
        ));
    }
    let code = parameters
        .get("code")
        .map(ToString::to_string)
        .ok_or_else(|| {
            ServiceError::new(
                "oauth_code_missing",
                "GitHub did not return a sign-in code.",
            )
        })?;
    respond_to_browser(
        stream,
        200,
        "GitHub sign-in is complete. You can close this tab and return to Allora FPGA.",
    );
    Ok(Some(code))
}

fn respond_to_browser(stream: &mut TcpStream, status: u16, message: &str) {
    let label = if status == 200 { "OK" } else { "Bad Request" };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Allora FPGA</title></head><body style=\"font-family:system-ui;padding:3rem;max-width:42rem;margin:auto\"><h1>Allora FPGA</h1><p>{message}</p></body></html>"
    );
    let response = format!(
        "HTTP/1.1 {status} {label}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
}

fn command_version(program: &str, arguments: &[&str]) -> Option<String> {
    let output = Command::new(program).args(arguments).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()?
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

fn validate_project_path(value: &str) -> Result<PathBuf, ServiceError> {
    let path = fs::canonicalize(value).map_err(|error| {
        ServiceError::with_detail(
            "project_unavailable",
            "The project folder is unavailable.",
            error.to_string(),
        )
    })?;
    if !path.is_dir() || !path.join("allora-project.json").is_file() {
        return Err(ServiceError::new(
            "invalid_project",
            "Choose an Allora project folder containing allora-project.json.",
        ));
    }
    Ok(path)
}

fn ensure_git_available() -> Result<(), ServiceError> {
    if command_version("git", &["--version"]).is_none() {
        Err(ServiceError::new(
            "git_missing",
            "Git is not installed or is not available in Allora's environment.",
        ))
    } else {
        Ok(())
    }
}

fn is_git_repository(path: &Path) -> bool {
    Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(path)
        .output()
        .is_ok_and(|output| output.status.success())
}

fn ensure_repository(path: &Path) -> Result<(), ServiceError> {
    ensure_git_available()?;
    if is_git_repository(path) {
        Ok(())
    } else {
        Err(ServiceError::new(
            "not_a_repository",
            "Initialize local version history before continuing.",
        ))
    }
}

fn repository_status_at(project: &Path) -> Result<GitRepositoryStatus, ServiceError> {
    ensure_git_available()?;
    if !is_git_repository(project) {
        return Ok(GitRepositoryStatus {
            is_repository: false,
            has_commits: false,
            branch: None,
            detached: false,
            upstream: None,
            origin_url: None,
            ahead: None,
            behind: None,
            changes: Vec::new(),
            staged_count: 0,
            unstaged_count: 0,
            untracked_count: 0,
            clean: true,
        });
    }

    let has_commits = git_success(project, &["rev-parse", "--verify", "HEAD"]);
    let branch = git_optional(project, &["symbolic-ref", "--short", "HEAD"])?;
    let detached = has_commits && branch.is_none();
    let upstream = if has_commits {
        git_optional(project, &["rev-parse", "--abbrev-ref", "@{upstream}"])?
    } else {
        None
    };
    let origin_url = git_optional(project, &["remote", "get-url", "origin"])?;
    let changes_output = run_git(
        project,
        &["status", "--porcelain=v1", "-z", "--untracked-files=normal"],
    )?;
    let changes = parse_porcelain_status(&changes_output.stdout);
    let staged_count = changes.iter().filter(|change| change.staged).count();
    let unstaged_count = changes.iter().filter(|change| change.unstaged).count();
    let untracked_count = changes.iter().filter(|change| change.untracked).count();
    let (ahead, behind) = if upstream.is_some() {
        parse_ahead_behind(&git_optional(
            project,
            &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        )?)
    } else {
        (None, None)
    };

    Ok(GitRepositoryStatus {
        is_repository: true,
        has_commits,
        branch,
        detached,
        upstream,
        origin_url,
        ahead,
        behind,
        clean: changes.is_empty(),
        changes,
        staged_count,
        unstaged_count,
        untracked_count,
    })
}

fn parse_porcelain_status(bytes: &[u8]) -> Vec<GitChange> {
    let mut changes = Vec::new();
    let mut entries = bytes
        .split(|byte| *byte == 0)
        .filter(|entry| !entry.is_empty());
    while let Some(entry) = entries.next() {
        let text = String::from_utf8_lossy(entry);
        if text.len() < 3 {
            continue;
        }
        let status = &text[..2];
        let path = text[3..].to_string();
        if status.starts_with('R') || status.starts_with('C') {
            // Porcelain v1 -z reports the destination first and the original
            // path as the following NUL-delimited field. Display the current
            // destination while consuming the original path.
            let _original_path = entries.next();
        }
        let untracked = status == "??";
        changes.push(GitChange {
            path,
            staged: !untracked && status.as_bytes()[0] != b' ' && status.as_bytes()[0] != b'?',
            unstaged: !untracked && status.as_bytes()[1] != b' ',
            untracked,
        });
    }
    changes
}

fn parse_ahead_behind(value: &Option<String>) -> (Option<u32>, Option<u32>) {
    let Some(value) = value else {
        return (None, None);
    };
    let mut parts = value.split_whitespace();
    let ahead = parts.next().and_then(|part| part.parse().ok());
    let behind = parts.next().and_then(|part| part.parse().ok());
    (ahead, behind)
}

fn git_success(project: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .args(args)
        .current_dir(project)
        .output()
        .is_ok_and(|output| output.status.success())
}

fn git_optional(project: &Path, args: &[&str]) -> Result<Option<String>, ServiceError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(project)
        .output()
        .map_err(map_git_launch_error)?;
    if !output.status.success() {
        return Ok(None);
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!value.is_empty()).then_some(value))
}

fn run_git(project: &Path, args: &[&str]) -> Result<Output, ServiceError> {
    Command::new("git")
        .args(args)
        .current_dir(project)
        .output()
        .map_err(map_git_launch_error)
}

fn run_git_checked(
    project: &Path,
    args: &[&str],
    code: &str,
    message: &str,
) -> Result<(), ServiceError> {
    let output = run_git(project, args)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(git_output_error(code, message, &output))
    }
}

fn map_git_launch_error(error: std::io::Error) -> ServiceError {
    if error.kind() == std::io::ErrorKind::NotFound {
        ServiceError::new(
            "git_missing",
            "Git is not installed or is not available in Allora's environment.",
        )
    } else {
        ServiceError::with_detail("git_failed", "Git could not be started.", error.to_string())
    }
}

fn git_output_error(code: &str, message: &str, output: &Output) -> ServiceError {
    ServiceError::with_detail(code, message, command_detail(output))
}

fn command_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        stderr
    }
}

fn validate_repository_name(name: &str) -> Result<(), ServiceError> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 100
        || name.starts_with('.')
        || name.ends_with('.')
        || !name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.".contains(character))
    {
        return Err(ServiceError::new(
            "invalid_repository_name",
            "Use 1–100 letters, numbers, hyphens, underscores, or periods, and do not start or end with a period.",
        ));
    }
    Ok(())
}

fn valid_email(email: &str) -> bool {
    let email = email.trim();
    let mut parts = email.split('@');
    matches!((parts.next(), parts.next(), parts.next()), (Some(left), Some(right), None) if !left.is_empty() && right.contains('.'))
}

fn validate_remote_url(remote: &str) -> Result<(), ServiceError> {
    let remote = remote.trim();
    let https = remote.starts_with("https://github.com/") && remote.ends_with(".git");
    let ssh = remote.starts_with("git@github.com:") && remote.ends_with(".git");
    if https || ssh {
        Ok(())
    } else {
        Err(ServiceError::new(
            "invalid_remote",
            "Allora can only connect this workflow to a standard GitHub HTTPS or SSH repository URL.",
        ))
    }
}

fn normalize_remote(remote: &str) -> String {
    remote.trim().trim_end_matches('/').to_ascii_lowercase()
}

fn is_github_https_remote(remote: &str) -> bool {
    remote.trim().starts_with("https://github.com/")
}

struct AskPass {
    _directory: TempDir,
    script: PathBuf,
}

impl AskPass {
    fn new() -> Result<Self, ServiceError> {
        let directory = tempfile::tempdir().map_err(|error| {
            ServiceError::with_detail(
                "credential_helper_failed",
                "Allora could not prepare secure Git authentication.",
                error.to_string(),
            )
        })?;
        #[cfg(windows)]
        let script = directory.path().join("askpass.cmd");
        #[cfg(not(windows))]
        let script = directory.path().join("askpass.sh");

        #[cfg(windows)]
        let contents = "@echo off\r\necho %1 | findstr /I Username >nul\r\nif %errorlevel%==0 (echo %ALLORA_GIT_USERNAME%) else (echo %ALLORA_GIT_TOKEN%)\r\n";
        #[cfg(not(windows))]
        let contents = "#!/bin/sh\ncase \"$1\" in *Username*) printf '%s\\n' \"$ALLORA_GIT_USERNAME\" ;; *) printf '%s\\n' \"$ALLORA_GIT_TOKEN\" ;; esac\n";
        fs::write(&script, contents).map_err(|error| {
            ServiceError::with_detail(
                "credential_helper_failed",
                "Allora could not prepare secure Git authentication.",
                error.to_string(),
            )
        })?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&script, fs::Permissions::from_mode(0o700)).map_err(|error| {
                ServiceError::with_detail(
                    "credential_helper_failed",
                    "Allora could not secure the temporary Git authentication helper.",
                    error.to_string(),
                )
            })?;
        }
        Ok(Self {
            _directory: directory,
            script,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_porcelain_status_without_losing_spaces() {
        let changes =
            parse_porcelain_status(b" M src/top module.v\0?? notes.txt\0A  constraints/pins.lpf\0");
        assert_eq!(changes.len(), 3);
        assert_eq!(changes[0].path, "src/top module.v");
        assert!(changes[0].unstaged);
        assert!(changes[1].untracked);
        assert!(changes[2].staged);
    }

    #[test]
    fn parses_porcelain_rename_destination() {
        let changes = parse_porcelain_status(b"R  src/new_name.sv\0src/old_name.sv\0");
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].path, "src/new_name.sv");
        assert!(changes[0].staged);
    }

    #[test]
    fn validates_repository_names_and_remote_urls() {
        assert!(validate_repository_name("ice-counter_v1").is_ok());
        assert!(validate_repository_name("../bad").is_err());
        assert!(validate_remote_url("https://github.com/octo/repo.git").is_ok());
        assert!(validate_remote_url("https://example.com/octo/repo.git").is_err());
    }

    #[test]
    fn reads_ahead_and_behind_counts() {
        assert_eq!(
            parse_ahead_behind(&Some("3\t2".to_string())),
            (Some(3), Some(2))
        );
        assert_eq!(parse_ahead_behind(&None), (None, None));
    }

    #[test]
    fn inspects_a_temporary_git_repository() {
        if command_version("git", &["--version"]).is_none() {
            return;
        }
        let directory = tempfile::tempdir().expect("temporary directory");
        fs::write(directory.path().join("allora-project.json"), "{}").expect("metadata");
        let init = Command::new("git")
            .args(["init", "--initial-branch=main"])
            .current_dir(directory.path())
            .output()
            .expect("git init");
        assert!(init.status.success());
        let status = repository_status_at(directory.path()).expect("repository status");
        assert!(status.is_repository);
        assert!(!status.has_commits);
        assert_eq!(status.branch.as_deref(), Some("main"));
        assert_eq!(status.untracked_count, 1);
    }

    #[test]
    fn initializes_commits_and_connects_a_temporary_repository() {
        if command_version("git", &["--version"]).is_none() {
            return;
        }
        let directory = tempfile::tempdir().expect("temporary directory");
        let project_path = directory.path().to_string_lossy().to_string();
        fs::write(directory.path().join("allora-project.json"), "{}").expect("metadata");
        fs::write(directory.path().join("top.sv"), "module top; endmodule\n").expect("source");

        initialize_repository(ProjectPathRequest {
            project_path: project_path.clone(),
        })
        .expect("repository initialization");
        let status = commit_all(CommitRequest {
            project_path: project_path.clone(),
            message: "Initial project".to_string(),
            author_name: Some("Allora Test".to_string()),
            author_email: Some("allora@example.test".to_string()),
        })
        .expect("initial commit");
        assert!(status.has_commits);
        assert!(status.clean);

        let status = set_origin(SetOriginRequest {
            project_path,
            remote_url: "https://github.com/example/allora-test.git".to_string(),
        })
        .expect("origin setup");
        assert_eq!(
            status.origin_url.as_deref(),
            Some("https://github.com/example/allora-test.git")
        );
    }
}
