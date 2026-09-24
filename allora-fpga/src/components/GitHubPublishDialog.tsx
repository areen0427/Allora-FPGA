import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CloudOff,
  GitBranch,
  GitFork,
  LoaderCircle,
  Lock,
  RefreshCw,
  TerminalSquare,
  UploadCloud,
  X,
} from "lucide-react";
import {
  beginGitHubDeviceSignIn,
  cancelGitHubDeviceSignIn,
  commitAllProjectFiles,
  createGitHubRepository,
  getGitHubAuthStatus,
  getGitRepositoryStatus,
  getGitToolAvailability,
  initializeGitRepository,
  listGitHubRepositories,
  pollGitHubDeviceSignIn,
  pushGitProject,
  repositoryNameFromProject,
  runProjectGitCommand,
  setGitOrigin,
  signOutOfGitHub,
  toGitHubServiceError,
  type GitHubAuthStatus,
  type GitHubDeviceAuthorization,
  type GitHubRepository,
  type GitRepositoryStatus,
  type GitToolAvailability,
} from "../lib/github";
import { hasTauriInvoke } from "../lib/tauri";

type Props = {
  projectName: string;
  projectPath?: string;
  workspaceDirty: boolean;
  onClose: () => void;
};

const EMPTY_AUTH: GitHubAuthStatus = {
  configured: true,
  authenticated: false,
  user: null,
  message: null,
};

export function GitHubPublishDialog({
  projectName,
  projectPath,
  workspaceDirty,
  onClose,
}: Props) {
  const [tools, setTools] = useState<GitToolAvailability | null>(null);
  const [auth, setAuth] = useState<GitHubAuthStatus>(EMPTY_AUTH);
  const [git, setGit] = useState<GitRepositoryStatus | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState("");
  const [repositoryMode, setRepositoryMode] = useState<"new" | "existing">(
    "new",
  );
  const [repositoryName, setRepositoryName] = useState(() =>
    repositoryNameFromProject(projectName),
  );
  const [description, setDescription] = useState(
    `FPGA project created with Allora FPGA`,
  );
  const [isPrivate, setIsPrivate] = useState(true);
  const [commitMessage, setCommitMessage] = useState("Initial project files");
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<"guided" | "commands">(
    "guided",
  );
  const [gitCommand, setGitCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<
    { command: string; output: string; success: boolean }[]
  >([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [busy, setBusy] = useState<string | null>("loading");
  const [error, setError] = useState<{
    message: string;
    detail?: string | null;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [deviceAuthorization, setDeviceAuthorization] =
    useState<GitHubDeviceAuthorization | null>(null);

  const selectedRepository = useMemo(
    () =>
      repositories.find(
        (repository) => repository.id.toString() === selectedRepositoryId,
      ) ?? null,
    [repositories, selectedRepositoryId],
  );
  const expectedRemote = selectedRepository?.cloneUrl ?? null;
  const originMatchesSelection = Boolean(
    expectedRemote &&
    git?.originUrl &&
    normalizeRemote(expectedRemote) === normalizeRemote(git.originUrl),
  );

  const refresh = useCallback(async () => {
    if (!hasTauriInvoke() || !projectPath) {
      setBusy(null);
      return;
    }
    setError(null);
    try {
      const nextTools = await getGitToolAvailability();
      setTools(nextTools);
      const nextAuth = await getGitHubAuthStatus();
      setAuth(nextAuth);
      const nextGit = nextTools.gitAvailable
        ? await getGitRepositoryStatus(projectPath)
        : null;
      setGit(nextGit);
      if (nextAuth.authenticated) {
        const nextRepositories = await listGitHubRepositories();
        setRepositories(nextRepositories);
        const matchingOrigin = nextRepositories.find(
          (repository) =>
            nextGit?.originUrl &&
            normalizeRemote(repository.cloneUrl) ===
              normalizeRemote(nextGit.originUrl),
        );
        if (matchingOrigin) {
          setSelectedRepositoryId(matchingOrigin.id.toString());
          setRepositoryMode("existing");
        }
      }
    } catch (cause) {
      const serviceError = toGitHubServiceError(cause);
      setError(serviceError);
    } finally {
      setBusy(null);
    }
  }, [projectPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (!deviceAuthorization) return;

    let active = true;
    let timeoutId: number | undefined;

    const schedulePoll = (interval: number) => {
      timeoutId = window.setTimeout(
        async () => {
          try {
            const result = await pollGitHubDeviceSignIn();
            if (!active) return;
            if (result.pending) {
              schedulePoll(result.interval);
              return;
            }
            if (!result.auth) {
              throw new Error(
                "GitHub completed sign-in without account details.",
              );
            }
            setAuth(result.auth);
            setDeviceAuthorization(null);
            await loadRepositories();
            if (active) setNotice("GitHub account connected securely.");
          } catch (cause) {
            if (!active) return;
            setDeviceAuthorization(null);
            setError(toGitHubServiceError(cause));
          }
        },
        Math.max(1, interval) * 1000,
      );
    };

    schedulePoll(deviceAuthorization.interval);
    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      void cancelGitHubDeviceSignIn();
    };
  }, [deviceAuthorization]);

  async function runAction(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError(null);
    setNotice("");
    try {
      await action();
    } catch (cause) {
      const serviceError = toGitHubServiceError(cause);
      setError(serviceError);
      if (serviceError.code === "git_identity_missing") {
        setShowAdvanced(true);
      }
      if (
        serviceError.code === "authentication_failed" ||
        serviceError.code === "token_expired"
      ) {
        setAuth({
          configured: true,
          authenticated: false,
          user: null,
          message: serviceError.message,
        });
      }
    } finally {
      setBusy(null);
    }
  }

  async function loadRepositories() {
    const nextRepositories = await listGitHubRepositories();
    setRepositories(nextRepositories);
    return nextRepositories;
  }

  const readyForGit = Boolean(tools?.gitAvailable && projectPath);
  const statusTone = !tools?.gitAvailable
    ? "danger"
    : git?.behind
      ? "warning"
      : git?.clean
        ? "success"
        : "info";

  async function submitGitCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = gitCommand.trim();
    if (!command || !projectPath || busy) return;
    setBusy("git-command");
    setError(null);
    setGitCommand("");
    setHistoryIndex(-1);
    try {
      const result = await runProjectGitCommand(projectPath, command);
      setGit(result.status);
      setCommandHistory((history) => [
        ...history.slice(-19),
        { command, output: result.output, success: result.success },
      ]);
      if (!result.success) setGitCommand(command);
      if (result.status.originUrl && auth.authenticated) {
        const match = repositories.find(
          (repository) =>
            normalizeRemote(repository.cloneUrl) ===
            normalizeRemote(result.status.originUrl!),
        );
        if (match) setSelectedRepositoryId(match.id.toString());
      }
    } catch (cause) {
      const serviceError = toGitHubServiceError(cause);
      setCommandHistory((history) => [
        ...history.slice(-19),
        {
          command,
          output: [serviceError.message, serviceError.detail]
            .filter(Boolean)
            .join("\n"),
          success: false,
        },
      ]);
      setGitCommand(command);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="github-dialog-backdrop" role="presentation">
      <section
        className="github-dialog dashboard-glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-dialog-title"
      >
        <header className="github-dialog-header">
          <div className="github-dialog-title-row">
            <span className="github-dialog-mark" aria-hidden="true">
              <GitFork size={22} />
            </span>
            <div>
              <span className="github-eyebrow">Project sharing</span>
              <h2 id="github-dialog-title">Publish to GitHub</h2>
              <p>
                Review each step before Allora changes local history or sends
                anything online.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="github-icon-button"
            aria-label="Close GitHub publishing"
            autoFocus
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="github-dialog-statusbar">
          <StatusPill
            tone={tools?.gitAvailable ? "success" : "danger"}
            label={tools?.gitAvailable ? "Git ready" : "Git missing"}
          />
          <StatusPill
            tone={auth.authenticated ? "success" : "neutral"}
            label={auth.authenticated ? `@${auth.user?.login}` : "Signed out"}
          />
          <StatusPill tone={statusTone} label={repositorySummary(git)} />
          <button
            type="button"
            className="github-refresh-button"
            onClick={() => void refresh()}
            disabled={Boolean(busy)}
          >
            <RefreshCw size={13} className={busy === "loading" ? "spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="github-dialog-body">
          <div className="github-workflow-switch" aria-label="Git workflow">
            <button
              type="button"
              className={workflowMode === "guided" ? "active" : ""}
              onClick={() => setWorkflowMode("guided")}
            >
              Guided steps
            </button>
            <button
              type="button"
              className={workflowMode === "commands" ? "active" : ""}
              onClick={() => setWorkflowMode("commands")}
            >
              <TerminalSquare size={15} /> Git commands
            </button>
          </div>
          {!hasTauriInvoke() ? (
            <Message tone="info" icon={<CloudOff size={17} />}>
              GitHub publishing is available in the Allora desktop app. Browser
              preview keeps this workflow read-only.
            </Message>
          ) : !projectPath ? (
            <Message tone="danger" icon={<CircleAlert size={17} />}>
              Reconnect this project folder before publishing. Allora needs its
              disk-backed workspace to run Git safely.
            </Message>
          ) : null}

          {error ? (
            <Message tone="danger" icon={<CircleAlert size={17} />}>
              <strong>{error.message}</strong>
              {error.detail ? <small>{error.detail}</small> : null}
            </Message>
          ) : null}
          {notice ? (
            <Message tone="success" icon={<Check size={17} />}>
              {notice}
            </Message>
          ) : null}

          <Step
            number="1"
            title="Connect your GitHub account"
            complete={auth.authenticated}
          >
            {!auth.configured ? (
              <Message tone="warning" icon={<CircleAlert size={17} />}>
                <strong>OAuth registration is required.</strong>
                <span>
                  The app owner must register the desktop OAuth app and build
                  with <code>ALLORA_GITHUB_CLIENT_ID</code>. No placeholder
                  credential is embedded.
                </span>
              </Message>
            ) : auth.authenticated && auth.user ? (
              <div className="github-account-row">
                <img src={auth.user.avatarUrl} alt="" />
                <div>
                  <strong>{auth.user.name || auth.user.login}</strong>
                  <span>@{auth.user.login}</span>
                </div>
                <button
                  type="button"
                  className="github-secondary-button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void runAction("signout", async () => {
                      await signOutOfGitHub();
                      setAuth({ ...EMPTY_AUTH, configured: true });
                      setRepositories([]);
                      setSelectedRepositoryId("");
                      setNotice(
                        "Signed out on this computer. You can also revoke Allora from GitHub account settings.",
                      );
                    })
                  }
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="github-action-block">
                <p>
                  GitHub will open in your browser and ask for the one-time code
                  shown here. The resulting token is kept in your operating
                  system credential vault and never sent to the interface.
                </p>
                {auth.message ? (
                  <span className="github-inline-note">{auth.message}</span>
                ) : null}
                {deviceAuthorization ? (
                  <div className="github-device-authorization">
                    <span>Enter this code at GitHub</span>
                    <button
                      type="button"
                      className="github-device-code"
                      title="Copy verification code"
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          deviceAuthorization.userCode,
                        )
                      }
                    >
                      {deviceAuthorization.userCode}
                    </button>
                    <small>
                      Browser opened to {deviceAuthorization.verificationUri}.
                      Waiting for authorization…
                    </small>
                    <button
                      type="button"
                      className="github-secondary-button"
                      onClick={() => {
                        void cancelGitHubDeviceSignIn();
                        setDeviceAuthorization(null);
                        setNotice("GitHub sign-in cancelled locally.");
                      }}
                    >
                      Cancel sign-in
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="github-primary-button"
                    disabled={!readyForGit || Boolean(busy)}
                    onClick={() =>
                      void runAction("signin", async () => {
                        setDeviceAuthorization(await beginGitHubDeviceSignIn());
                      })
                    }
                  >
                    {busy === "signin" ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <GitFork size={16} />
                    )}
                    {busy === "signin"
                      ? "Requesting code…"
                      : "Sign in with GitHub"}
                  </button>
                )}
              </div>
            )}
          </Step>

          {workflowMode === "commands" ? (
            <section className="github-command-panel" aria-label="Git commands">
              <div className="github-command-heading">
                <strong>Git in this project</strong>
                <span>
                  {git?.branch ?? "No branch yet"} · {git?.changes.length ?? 0}{" "}
                  changed files
                </span>
              </div>
              <p>
                Type a Git publishing command and press Enter. Commands run in
                this project folder. Use quotes around messages or paths with
                spaces.
              </p>
              {workspaceDirty ? (
                <Message tone="warning" icon={<CircleAlert size={17} />}>
                  Save editor changes before using Git so the disk version is
                  current.
                </Message>
              ) : null}
              <div
                className="github-command-output"
                role="log"
                aria-live="polite"
              >
                {commandHistory.length === 0 ? (
                  <span className="github-command-placeholder">
                    Try git status, git add ., git commit -m "Update project",
                    or git push
                  </span>
                ) : (
                  commandHistory.map((entry, index) => (
                    <div
                      key={index}
                      className={entry.success ? "success" : "failure"}
                    >
                      <strong>$ {entry.command}</strong>
                      <pre>{entry.output}</pre>
                    </div>
                  ))
                )}
              </div>
              <form
                className="github-command-form"
                onSubmit={(event) => void submitGitCommand(event)}
              >
                <span aria-hidden="true">$</span>
                <input
                  aria-label="Git command"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="git status"
                  value={gitCommand}
                  onChange={(event) => setGitCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown")
                      return;
                    const commands = commandHistory.map(
                      (entry) => entry.command,
                    );
                    if (!commands.length) return;
                    event.preventDefault();
                    const next =
                      event.key === "ArrowUp"
                        ? Math.min(historyIndex + 1, commands.length - 1)
                        : Math.max(historyIndex - 1, -1);
                    setHistoryIndex(next);
                    setGitCommand(
                      next < 0 ? "" : commands[commands.length - 1 - next],
                    );
                  }}
                  disabled={!readyForGit || Boolean(busy)}
                />
                <button
                  type="submit"
                  disabled={!readyForGit || !gitCommand.trim() || Boolean(busy)}
                >
                  {busy === "git-command" ? "Running…" : "Run"}
                </button>
              </form>
              <small>
                GitHub sign-in above supplies credentials for pushes to a GitHub
                HTTPS origin. SSH remotes use your existing SSH configuration.
              </small>
            </section>
          ) : (
            <>
              <Step
                number="2"
                title="Prepare local version"
                complete={Boolean(git?.hasCommits)}
              >
                {!tools?.gitAvailable ? (
                  <Message tone="danger" icon={<CircleAlert size={17} />}>
                    Install Git, then restart or refresh this panel. The GitHub
                    CLI does not replace Git for local project history.
                  </Message>
                ) : !git?.isRepository ? (
                  <div className="github-action-block">
                    <p>
                      This creates local version history inside the project
                      folder. It does not stage files, create a commit, contact
                      GitHub, or add a remote.
                    </p>
                    <button
                      type="button"
                      className="github-primary-button"
                      disabled={!readyForGit || Boolean(busy)}
                      onClick={() =>
                        void runAction("init", async () => {
                          await initializeGitRepository(projectPath!);
                          setGit(await getGitRepositoryStatus(projectPath!));
                          setNotice(
                            "Local version history initialized on main.",
                          );
                        })
                      }
                    >
                      Initialize local version history
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="github-git-summary">
                      <span>
                        <GitBranch size={14} />{" "}
                        {git.branch ?? "Detached revision"}
                      </span>
                      <span>
                        {git.changes.length} changed file
                        {git.changes.length === 1 ? "" : "s"}
                      </span>
                      <span>
                        {git.ahead ?? 0} ahead · {git.behind ?? 0} behind
                      </span>
                    </div>
                    {workspaceDirty ? (
                      <Message tone="warning" icon={<CircleAlert size={17} />}>
                        Save the project before committing so the disk version
                        and editor agree. Use Cmd+S or Ctrl+S, then refresh this
                        panel.
                      </Message>
                    ) : null}
                    {git.changes.length > 0 ? (
                      <div
                        className="github-change-list"
                        aria-label="Files to include"
                      >
                        {git.changes.slice(0, 8).map((change) => (
                          <div key={change.path}>
                            <span>
                              {change.untracked
                                ? "New"
                                : change.staged
                                  ? "Staged"
                                  : "Changed"}
                            </span>
                            <code>{change.path}</code>
                          </div>
                        ))}
                        {git.changes.length > 8 ? (
                          <small>+ {git.changes.length - 8} more files</small>
                        ) : null}
                      </div>
                    ) : (
                      <p className="github-muted-copy">
                        No uncommitted project files.
                      </p>
                    )}
                    {git.changes.length > 0 ? (
                      <div className="github-form-stack">
                        <label>
                          <span>Commit message</span>
                          <input
                            value={commitMessage}
                            maxLength={120}
                            onChange={(event) =>
                              setCommitMessage(event.target.value)
                            }
                          />
                        </label>
                        <p className="github-action-explanation">
                          Clicking below stages every current project change and
                          creates one local commit with this message. Nothing is
                          sent online.
                        </p>
                        <button
                          type="button"
                          className="github-primary-button"
                          disabled={
                            workspaceDirty ||
                            !commitMessage.trim() ||
                            Boolean(busy)
                          }
                          onClick={() =>
                            void runAction("commit", async () => {
                              const nextGit = await commitAllProjectFiles({
                                projectPath: projectPath!,
                                message: commitMessage,
                                authorName: authorName || undefined,
                                authorEmail: authorEmail || undefined,
                              });
                              setGit(nextGit);
                              setCommitMessage("Update project");
                              setNotice(
                                "Local commit created. Nothing has been pushed yet.",
                              );
                            })
                          }
                        >
                          {busy === "commit" ? (
                            <LoaderCircle className="spin" size={16} />
                          ) : null}
                          Stage files and create commit
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </Step>

              <Step
                number="3"
                title="Choose the GitHub repository"
                complete={Boolean(git?.originUrl)}
              >
                {!auth.authenticated ? (
                  <p className="github-muted-copy">
                    Sign in to choose or create a repository.
                  </p>
                ) : (
                  <>
                    <div
                      className="github-mode-switch"
                      aria-label="Repository choice"
                    >
                      <button
                        type="button"
                        className={repositoryMode === "new" ? "active" : ""}
                        onClick={() => setRepositoryMode("new")}
                      >
                        Create new
                      </button>
                      <button
                        type="button"
                        className={
                          repositoryMode === "existing" ? "active" : ""
                        }
                        onClick={() => setRepositoryMode("existing")}
                      >
                        Use existing
                      </button>
                    </div>
                    {repositoryMode === "new" ? (
                      <div className="github-form-stack">
                        <label>
                          <span>Repository name</span>
                          <input
                            value={repositoryName}
                            maxLength={100}
                            onChange={(event) =>
                              setRepositoryName(event.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>Description</span>
                          <input
                            value={description}
                            maxLength={350}
                            onChange={(event) =>
                              setDescription(event.target.value)
                            }
                          />
                        </label>
                        <label className="github-privacy-row">
                          <input
                            type="checkbox"
                            checked={isPrivate}
                            onChange={(event) =>
                              setIsPrivate(event.target.checked)
                            }
                          />
                          <Lock size={15} />
                          <span>
                            <strong>Private repository</strong>
                            <small>
                              Recommended until you are ready to share.
                            </small>
                          </span>
                        </label>
                        <p className="github-action-explanation">
                          This creates an empty{" "}
                          {isPrivate ? "private" : "public"} repository on
                          GitHub. It does not connect or push this project yet.
                        </p>
                        <button
                          type="button"
                          className="github-primary-button"
                          disabled={!repositoryName.trim() || Boolean(busy)}
                          onClick={() =>
                            void runAction("create-repository", async () => {
                              const repository = await createGitHubRepository({
                                name: repositoryName,
                                description,
                                private: isPrivate,
                              });
                              const nextRepositories = await loadRepositories();
                              const created =
                                nextRepositories.find(
                                  (item) => item.id === repository.id,
                                ) ?? repository;
                              setSelectedRepositoryId(created.id.toString());
                              setRepositoryMode("existing");
                              setNotice(
                                `${created.fullName} was created. Review the connection step next.`,
                              );
                            })
                          }
                        >
                          {busy === "create-repository" ? (
                            <LoaderCircle className="spin" size={16} />
                          ) : null}
                          Create repository
                        </button>
                      </div>
                    ) : (
                      <div className="github-form-stack">
                        <label>
                          <span>Repository</span>
                          <select
                            value={selectedRepositoryId}
                            onChange={(event) =>
                              setSelectedRepositoryId(event.target.value)
                            }
                          >
                            <option value="">Select a repository</option>
                            {repositories.map((repository) => (
                              <option key={repository.id} value={repository.id}>
                                {repository.fullName} ·{" "}
                                {repository.private ? "Private" : "Public"}
                              </option>
                            ))}
                          </select>
                        </label>
                        {repositories.length === 0 ? (
                          <p className="github-muted-copy">
                            No owned repositories with push access were found.
                            Create one instead.
                          </p>
                        ) : null}
                      </div>
                    )}

                    {selectedRepository ? (
                      <div className="github-connect-block">
                        <div>
                          <strong>{selectedRepository.fullName}</strong>
                          <span>
                            {selectedRepository.private ? "Private" : "Public"}
                          </span>
                        </div>
                        {originMatchesSelection ? (
                          <StatusPill
                            tone="success"
                            label="Connected as origin"
                          />
                        ) : git?.originUrl ? (
                          <Message
                            tone="warning"
                            icon={<CircleAlert size={17} />}
                          >
                            This project already uses{" "}
                            <code>{git.originUrl}</code> as origin. Allora will
                            not replace it. Choose the matching repository or
                            change the remote outside Allora after review.
                          </Message>
                        ) : (
                          <>
                            <p>
                              The next action adds this repository as the local
                              <code> origin </code> remote. It does not push
                              files.
                            </p>
                            <button
                              type="button"
                              className="github-primary-button"
                              disabled={!git?.hasCommits || Boolean(busy)}
                              onClick={() =>
                                void runAction("connect", async () => {
                                  setGit(
                                    await setGitOrigin(
                                      projectPath!,
                                      selectedRepository.cloneUrl,
                                    ),
                                  );
                                  setNotice(
                                    "The GitHub repository is now connected as origin.",
                                  );
                                })
                              }
                            >
                              Connect as origin
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </Step>

              <Step
                number="4"
                title={
                  git?.upstream
                    ? "Commit and push updates"
                    : "Publish the first version"
                }
                complete={Boolean(
                  git?.upstream && git.ahead === 0 && git.clean,
                )}
              >
                {!git?.originUrl ? (
                  <p className="github-muted-copy">
                    Connect a repository before pushing.
                  </p>
                ) : (
                  <div className="github-action-block">
                    <p>
                      This sends committed history from{" "}
                      <strong>{git.branch ?? "the current branch"}</strong> to
                      <strong> origin</strong> and records upstream tracking. It
                      will never force-push or overwrite divergent history.
                    </p>
                    {git.behind ? (
                      <Message tone="warning" icon={<CircleAlert size={17} />}>
                        The tracked GitHub branch is {git.behind} commit
                        {git.behind === 1 ? "" : "s"} ahead. Allora will not
                        pull or merge automatically.
                      </Message>
                    ) : null}
                    <button
                      type="button"
                      className="github-primary-button"
                      disabled={
                        !git.hasCommits || git.detached || Boolean(busy)
                      }
                      onClick={() =>
                        void runAction("push", async () => {
                          setGit(await pushGitProject(projectPath!));
                          setNotice(
                            "Project pushed successfully with upstream tracking.",
                          );
                        })
                      }
                    >
                      {busy === "push" ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <UploadCloud size={16} />
                      )}
                      {git.upstream
                        ? "Push committed changes"
                        : "Publish first version"}
                    </button>
                  </div>
                )}
              </Step>

              <div className="github-advanced">
                <button
                  type="button"
                  aria-expanded={showAdvanced}
                  onClick={() => setShowAdvanced((current) => !current)}
                >
                  <ChevronDown
                    size={15}
                    className={showAdvanced ? "open" : ""}
                  />
                  Advanced Git details
                </button>
                {showAdvanced ? (
                  <div className="github-advanced-content">
                    <div className="github-identity-grid">
                      <label>
                        <span>Commit author name</span>
                        <input
                          value={authorName}
                          onChange={(event) =>
                            setAuthorName(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Commit author email</span>
                        <input
                          type="email"
                          value={authorEmail}
                          onChange={(event) =>
                            setAuthorEmail(event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <p>
                      If supplied, these are saved only in this repository’s
                      local Git configuration. Leave both blank to use your
                      existing Git identity.
                    </p>
                    <dl>
                      <div>
                        <dt>Branch</dt>
                        <dd>{git?.branch ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Upstream</dt>
                        <dd>{git?.upstream ?? "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Origin</dt>
                        <dd>{git?.originUrl ?? "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Git</dt>
                        <dd>{tools?.gitVersion ?? "Unavailable"}</dd>
                      </div>
                      <div>
                        <dt>GitHub CLI</dt>
                        <dd>
                          {tools?.ghVersion ?? "Optional · not installed"}
                        </dd>
                      </div>
                    </dl>
                    <p>
                      Allora uses Git for local history and pushes, and GitHub’s
                      API for account and repository actions. GitHub CLI is
                      detected for diagnostics but is not required or invoked in
                      this version.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function Step({
  number,
  title,
  complete,
  children,
}: {
  number: string;
  title: string;
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="github-step">
      <header>
        <span className={complete ? "complete" : ""}>
          {complete ? <Check size={14} /> : number}
        </span>
        <h3>{title}</h3>
      </header>
      <div className="github-step-body">{children}</div>
    </section>
  );
}

function StatusPill({
  tone,
  label,
}: {
  tone: "success" | "warning" | "danger" | "info" | "neutral";
  label: string;
}) {
  return <span className={`github-status-pill ${tone}`}>{label}</span>;
}

function Message({
  tone,
  icon,
  children,
}: {
  tone: "success" | "warning" | "danger" | "info";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`github-message ${tone}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      {icon}
      <div>{children}</div>
    </div>
  );
}

function repositorySummary(status: GitRepositoryStatus | null) {
  if (!status) return "Checking project";
  if (!status.isRepository) return "Local only";
  if (status.behind) return `${status.behind} behind`;
  if (status.changes.length) return `${status.changes.length} uncommitted`;
  if (status.ahead) return `${status.ahead} ready to push`;
  if (status.upstream) return "Up to date";
  if (status.originUrl) return "Ready for first push";
  return "Not published";
}

function normalizeRemote(remote: string) {
  return remote.trim().replace(/\/$/, "").toLowerCase();
}
