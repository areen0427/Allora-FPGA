import type { ProjectFile } from "../pages/dashboard/types";
import type { ExecutionTarget } from "../pages/dashboard/types";

const STORAGE_KEY = "allora-fpga-projects";
const LAST_OPENED_PROJECT_KEY = "allora-fpga-last-opened-project";

export type SavedProject = {
  id: string;
  name: string;
  boardId: string;
  projectKind?: "simulation" | "hardware";
  starterTemplate?: "blank" | "counter" | "pwm";
  lastExecutionTarget?: ExecutionTarget;
  files: ProjectFile[];
  projectPath?: string;
  language?: string;
  activeFileName: string | null;
  topLevelFileName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getSavedProjects(): SavedProject[] {
  try {
    const rawProjects = window.localStorage.getItem(STORAGE_KEY);
    if (!rawProjects) return [];

    const projects = JSON.parse(rawProjects);
    if (!Array.isArray(projects)) return [];

    return projects;
  } catch {
    return [];
  }
}

export function getSavedProject(projectId: string) {
  return getSavedProjects().find((project) => project.id === projectId);
}

export function saveProject(project: SavedProject) {
  const projects = getSavedProjects();
  const nextProjects = [
    toPersistedProject(project),
    ...projects.filter((currentProject) => currentProject.id !== project.id),
  ];

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProjects));
}

// Projects with a workspace folder keep their file contents on disk only.
// localStorage stores lightweight records (name/path) so recents render and
// the ~5MB quota is never consumed by HDL sources, waveforms, or bitstreams.
function toPersistedProject(project: SavedProject): SavedProject {
  if (!project.projectPath) return project;

  return {
    ...project,
    files: project.files.map((file) => ({
      name: file.name,
      path: file.path,
      isBinary: file.isBinary,
      content: "",
    })),
  };
}

export function removeSavedProject(projectId: string) {
  const projects = getSavedProjects();
  const nextProjects = projects.filter((project) => project.id !== projectId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProjects));
}

export function getLastOpenedProjectId() {
  return window.localStorage.getItem(LAST_OPENED_PROJECT_KEY);
}

export function saveLastOpenedProjectId(projectId: string) {
  window.localStorage.setItem(LAST_OPENED_PROJECT_KEY, projectId);
}

export function createProject({
  id,
  name,
  boardId,
  files,
  projectPath,
  language,
  activeFileName,
  topLevelFileName,
  projectKind,
  starterTemplate,
  lastExecutionTarget,
}: {
  id?: string;
  name: string;
  boardId: string;
  files?: ProjectFile[];
  projectPath?: string;
  language?: string;
  activeFileName?: string | null;
  topLevelFileName?: string | null;
  projectKind?: "simulation" | "hardware";
  starterTemplate?: "blank" | "counter" | "pwm";
  lastExecutionTarget?: ExecutionTarget;
}) {
  const now = new Date().toISOString();
  const project: SavedProject = {
    id: id ?? window.crypto?.randomUUID?.() ?? `${Date.now()}`,
    name: name.trim() || "Untitled Project",
    boardId,
    projectKind,
    starterTemplate,
    lastExecutionTarget,
    files: files ?? [],
    projectPath,
    language,
    activeFileName: activeFileName ?? null,
    topLevelFileName: topLevelFileName ?? null,
    createdAt: now,
    updatedAt: now,
  };

  saveProject(project);
  return project;
}

export function formatProjectTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
