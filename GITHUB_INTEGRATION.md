# GitHub integration architecture

Allora's GitHub workflow is local-first. Opening, creating, editing, simulating, and building a project never requires a GitHub account. Network access begins only after the user opens **Publish to GitHub** and confirms a GitHub action.

## Authentication and configuration

Allora is a public native client. It uses GitHub's OAuth authorization-code flow with PKCE (`S256`) and a temporary loopback listener on `127.0.0.1`. The browser receives only the OAuth client ID, loopback redirect, random state, and PKCE challenge. No client secret is shipped in the application.

The project owner must register a GitHub OAuth App before sign-in can work:

1. Register an OAuth App in GitHub Developer settings.
2. Set its callback URL to `http://127.0.0.1/oauth/callback`. GitHub's native-app loopback behavior permits Allora to supply the temporary local port at runtime.
3. Build the desktop app with the public client ID:

   ```bash
   ALLORA_GITHUB_CLIENT_ID=your_client_id npm run tauri build
   ```

   The same environment variable can be used with `npm run tauri dev` during development.

Allora requests the OAuth App `repo` scope because V1 can create and push both public and private repositories. OAuth App scopes are coarse-grained; the publish dialog explains the requested repository access before opening the browser. The OAuth app should not be configured with or bundled with a client secret.

The access token is written directly by Rust to the native operating-system credential store through `keyring`: macOS Keychain, Windows Credential Manager, or the Linux Secret Service. It is never returned to React, written to project metadata, `localStorage`, ordinary settings, logs, a URL, or a Git command argument. Sign-out deletes the local credential. Users can separately revoke the OAuth grant in GitHub account settings.

Allora validates a stored token with `GET /user` when the dialog opens or refreshes. A `401` is treated as an expired or revoked grant, the unusable local credential is removed, and the user is asked to sign in again. Offline and credential-vault failures remain distinct so users are not incorrectly signed out during a network outage.

Primary references:

- [GitHub OAuth authorization and PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [GitHub OAuth app security guidance](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app)
- [GitHub repository REST endpoints](https://docs.github.com/en/rest/repos/repos)
- [Tauri command boundary](https://v2.tauri.app/develop/calling-rust/)
- [Tauri opener plugin](https://v2.tauri.app/plugin/opener/)
- [Rust keyring native-store documentation](https://docs.rs/keyring/latest/keyring/)

## Responsibility boundary

| Responsibility | Implementation | Reason |
|---|---|---|
| Account authorization, current-user validation, owned-repository listing, repository creation | Direct GitHub REST API in Rust | Typed responses, explicit permissions/errors, and no dependency on a separately installed CLI |
| Repository initialization, status, staging, commits, local identity, remotes, branch/upstream state, pushes | System `git`, invoked only by Rust | Preserves ordinary Git repositories and interoperates with every editor/terminal |
| GitHub CLI | Detection and diagnostics only in V1 | `gh` is useful to expert users but is not required, silently invoked, or used as an alternate credential store |
| Secret storage and authenticated HTTPS push | Native credential store plus an ephemeral askpass helper | Keeps the token out of the WebView, files, logs, remote URLs, and process arguments |

The frontend uses typed wrappers in `src/lib/github.ts`. It never invokes commands directly or parses raw Git output. Rust returns structured repository state and structured error codes from `src-tauri/src/github.rs`.

## User workflow and safety properties

The dashboard exposes one **Publish to GitHub** action. The dialog progressively reveals four explicit steps:

1. Sign in through the system browser.
2. Initialize local history if necessary, then review changed files and explicitly stage and commit them with an editable message.
3. Create an empty private-by-default repository or select an owned, non-archived repository with push permission; then explicitly connect it as `origin`.
4. Explicitly perform the first push with upstream tracking. Later visits use the same dialog for additional commits and pushes.

Allora does not automatically stage, commit, add or replace a remote, fetch, pull, merge, rebase, push, or force-push. It refuses to replace an existing mismatched `origin`. A rejected/non-fast-forward push is reported for manual review; no destructive recovery is attempted. Ahead/behind counts reflect the currently stored upstream refs and are not presented as a live network fetch.

HTTPS GitHub pushes obtain the token from the native vault and expose it only to a permissions-restricted temporary askpass process through its environment. SSH remotes continue to use the user's existing SSH configuration. The temporary helper is deleted when the push command completes.

## Test boundary

Automated tests cover validation, Git status parsing, ahead/behind parsing, and status inspection of a temporary local repository. Tests do not authenticate to GitHub, create online repositories, or push over the network. Live account testing requires explicit user authorization and a real registered OAuth client ID.
