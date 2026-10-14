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
