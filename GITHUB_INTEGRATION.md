# GitHub integration architecture

Allora's GitHub workflow is local-first. Opening, creating, editing, simulating, and building a project never requires a GitHub account. Network access begins only after the user opens **Publish to GitHub** and confirms a GitHub action.

## Authentication and configuration

Allora is a public native client. It uses GitHub's OAuth Device Flow, which is designed for applications that cannot keep a client secret. The browser receives a short-lived, one-time user code. No client secret is shipped in the application.

The project owner must register a GitHub OAuth App before sign-in can work:

1. Register an OAuth App in GitHub Developer settings.
2. Enable **Device Flow** in the OAuth App settings. The redirect URI is not used by Allora's sign-in flow.
3. Build the desktop app with the public client ID:

   ```bash
   ALLORA_GITHUB_CLIENT_ID=your_client_id npm run tauri build
   ```

   The same environment variable can be used with `npm run tauri dev` during development.

Allora requests the OAuth App `repo` scope because V1 can create and push both public and private repositories. OAuth App scopes are coarse-grained; the publish dialog explains the requested repository access before opening the browser. The OAuth app should not be configured with or bundled with a client secret. If expiring access tokens are enabled, V1 asks the user to sign in again after expiration rather than retaining a refresh token.

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

| Responsibility                                                                                              | Implementation                                           | Reason                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Account authorization, current-user validation, owned-repository listing, repository creation               | Direct GitHub REST API in Rust                           | Typed responses, explicit permissions/errors, and no dependency on a separately installed CLI                  |
| Repository initialization, status, staging, commits, local identity, remotes, branch/upstream state, pushes | System `git`, invoked only by Rust                       | Preserves ordinary Git repositories and interoperates with every editor/terminal                               |
| GitHub CLI                                                                                                  | Detection and diagnostics only in V1                     | `gh` is useful to expert users but is not required, silently invoked, or used as an alternate credential store |
| Secret storage and authenticated HTTPS push                                                                 | Native credential store plus an ephemeral askpass helper | Keeps the token out of the WebView, files, logs, remote URLs, and process arguments                            |

The frontend uses typed wrappers in `src/lib/github.ts`. It never invokes commands directly or parses raw Git output. Rust returns structured repository state and structured error codes from `src-tauri/src/github.rs`.

## User workflow and safety properties

The dashboard exposes one **Publish to GitHub** action. The dialog progressively reveals four explicit steps:

1. Sign in through the system browser.
2. Initialize local history if necessary, then review changed files and explicitly stage and commit them with an editable message.
3. Create an empty private-by-default repository or select an owned, non-archived repository with push permission; then explicitly connect it as `origin`.
4. Explicitly perform the first push with upstream tracking. Later visits use the same dialog for additional commits and pushes.

The dialog also offers **Git commands** for users who prefer typing. Rust parses one command at a time and invokes the system `git` directly in the active project directory, without a shell. The available commands cover publishing tasks such as `init`, `status`, `add`, `commit`, `remote`, `fetch`, `branch`, and `push`, plus read-only inspection. Commands that rewrite checked-out project files are left to an external terminal because the editor keeps its own in-memory copy of open files. Output and refreshed repository status appear in the dialog. GitHub HTTPS pushes to `origin` use the same native askpass credential path as the guided Push action; a bare first `git push` sets upstream tracking. Other remotes use the user's existing Git credentials. Repository creation remains in the guided controls because Git itself cannot create a GitHub repository.

The guided flow does not automatically stage, commit, add or replace a remote, fetch, pull, merge, rebase, push, or force-push. It refuses to replace an existing mismatched `origin`. A rejected/non-fast-forward push is reported for manual review; no destructive recovery is attempted. The command area runs Git operations explicitly typed by the user, including history-changing commands. Ahead/behind counts reflect the currently stored upstream refs and are not presented as a live network fetch.

HTTPS GitHub pushes obtain the token from the native vault and expose it only to a permissions-restricted temporary askpass process through its environment. SSH remotes continue to use the user's existing SSH configuration. The temporary helper is deleted when the push command completes.

## Test boundary

Automated tests cover validation, Git status parsing, ahead/behind parsing, and status inspection of a temporary local repository. Tests do not authenticate to GitHub, create online repositories, or push over the network. Live account testing requires explicit user authorization and a real registered OAuth client ID.
