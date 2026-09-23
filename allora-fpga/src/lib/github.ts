import { invokeTauri } from "./tauri";

export type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
};

export type GitHubAuthStatus = {
  configured: boolean;
  authenticated: boolean;
  user: GitHubUser | null;
  message: string | null;
};

export type GitToolAvailability = {
  gitAvailable: boolean;
  gitVersion: string | null;
  ghAvailable: boolean;
  ghVersion: string | null;
};

export type GitChange = {
  path: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
};

export type GitRepositoryStatus = {
  isRepository: boolean;
  hasCommits: boolean;
  branch: string | null;
  detached: boolean;
  upstream: string | null;
  originUrl: string | null;
  ahead: number | null;
  behind: number | null;
  changes: GitChange[];
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  clean: boolean;
};

export type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  cloneUrl: string;
  htmlUrl: string;
  defaultBranch: string;
};

export type GitHubServiceError = {
  code: string;
  message: string;
  detail?: string | null;
};

export function repositoryNameFromProject(projectName: string) {
  return (
    projectName
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^A-Za-z0-9_.-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 100) || "allora-fpga-project"
  );
}

export function toGitHubServiceError(error: unknown): GitHubServiceError {
  if (isRecord(error)) {
    const message =
      typeof error.message === "string"
        ? error.message
        : "The GitHub action could not be completed.";
    return {
      code: typeof error.code === "string" ? error.code : "unknown_error",
      message,
      detail: typeof error.detail === "string" ? error.detail : null,
    };
  }
  if (typeof error === "string") {
    try {
      return toGitHubServiceError(JSON.parse(error));
    } catch {
      return { code: "unknown_error", message: error };
    }
  }
  if (error instanceof Error) {
    return { code: "unknown_error", message: error.message };
  }
  return {
    code: "unknown_error",
    message: "The GitHub action could not be completed.",
  };
}

export function getGitToolAvailability() {
  return invokeTauri<GitToolAvailability>("github_tool_availability");
}

export function getGitHubAuthStatus() {
  return invokeTauri<GitHubAuthStatus>("github_auth_status");
}

export function signInToGitHub() {
  return invokeTauri<GitHubAuthStatus>("github_sign_in");
}

export function signOutOfGitHub() {
  return invokeTauri<void>("github_sign_out");
}

export function listGitHubRepositories() {
  return invokeTauri<GitHubRepository[]>("github_list_repositories");
}

export function createGitHubRepository(input: {
  name: string;
  description: string;
  private: boolean;
}) {
  return invokeTauri<GitHubRepository>("github_create_repository", {
    request: input,
  });
}

export function getGitRepositoryStatus(projectPath: string) {
  return invokeTauri<GitRepositoryStatus>("git_repository_status", {
    request: { projectPath },
  });
}

export function initializeGitRepository(projectPath: string) {
  return invokeTauri<void>("git_initialize_repository", {
    request: { projectPath },
  });
}

export function commitAllProjectFiles(input: {
  projectPath: string;
  message: string;
  authorName?: string;
  authorEmail?: string;
}) {
  return invokeTauri<GitRepositoryStatus>("git_commit_all", {
    request: {
      projectPath: input.projectPath,
      message: input.message,
      authorName: input.authorName?.trim() || null,
      authorEmail: input.authorEmail?.trim() || null,
    },
  });
}

export function setGitOrigin(projectPath: string, remoteUrl: string) {
  return invokeTauri<GitRepositoryStatus>("git_set_origin", {
    request: { projectPath, remoteUrl },
  });
}

export function pushGitProject(projectPath: string) {
  return invokeTauri<GitRepositoryStatus>("git_push_project", {
    request: { projectPath },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
