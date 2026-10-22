type ChatHistoryEntry = {
  workspacePath: string;
  messages: { projectPath?: string }[];
  updatedAt?: string;
};
type ProjectSummary = { projectPath?: string; boardId: string };

export function chatHistoryDetails(chat: ChatHistoryEntry, projects: ProjectSummary[]) {
  const projectPath = [...chat.messages].reverse().find(message => message.projectPath)?.projectPath;
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
  const latestPath = projectPath ?? chat.workspacePath;
  const project = latestPath ? projects.find(item => item.projectPath && normalize(item.projectPath) === normalize(latestPath)) : undefined;
  const updated = chat.updatedAt ? new Date(chat.updatedAt) : null;
  const validDate = updated && Number.isFinite(updated.getTime()) ? updated : null;
  return {
    boardId: project?.boardId,
    hasProject: Boolean(projectPath || project),
    updatedLabel: validDate?.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) ?? "Date unavailable",
    updatedDateTime: validDate?.toISOString(),
  };
}


export const CHAT_HISTORY_KEY = "allora-codex-conversations-v1";

const normalizeProjectPath = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");

/** Resume only a conversation belonging to this project, never another workspace. */
export function latestProjectChat<T extends ChatHistoryEntry>(chats: T[], projectPath?: string): T | undefined {
  if (!projectPath) return undefined;
  const target = normalizeProjectPath(projectPath);
  return chats.filter(chat => normalizeProjectPath(chat.workspacePath) === target
    || chat.messages.some(message => typeof message.projectPath === "string" && normalizeProjectPath(message.projectPath) === target))
    .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0))[0];
}

export function hasSavedProjectChat(projectPath?: string): boolean {
  if (!projectPath) return false;
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(CHAT_HISTORY_KEY) ?? "[]");
    if (!Array.isArray(saved)) return false;
    // Match the history loader's validation and limit so navigation cannot
    // send a project to an empty chat because of an unreadable history record.
    const chats = saved.filter((chat): chat is ChatHistoryEntry => chat
      && typeof chat.id === "string" && typeof chat.title === "string"
      && typeof chat.workspacePath === "string" && Array.isArray(chat.messages)
      && chat.messages.every((message: { id?: unknown; role?: unknown; text?: unknown }) => message
        && typeof message.id === "string" && (message.role === "user" || message.role === "assistant")
        && typeof message.text === "string")).slice(0, 40);
    return Boolean(latestProjectChat(chats.filter(chat => chat.messages.length > 0), projectPath));
  } catch {
    return false;
  }
}
