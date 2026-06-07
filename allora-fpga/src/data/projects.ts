import type { ProjectFile } from "../pages/dashboard/types";

const STORAGE_KEY = "allora-fpga-projects";

export type SavedProject = {
  id: string;
  name: string;
  boardId: string;
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
    project,
    ...projects.filter((currentProject) => currentProject.id !== project.id),
  ];

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProjects));
}

export function removeSavedProject(projectId: string) {
  const projects = getSavedProjects();
  const nextProjects = projects.filter((project) => project.id !== projectId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProjects));
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
}: {
  id?: string;
  name: string;
  boardId: string;
  files?: ProjectFile[];
  projectPath?: string;
  language?: string;
  activeFileName?: string | null;
  topLevelFileName?: string | null;
}) {
  const now = new Date().toISOString();
  const project: SavedProject = {
    id: id ?? window.crypto?.randomUUID?.() ?? `${Date.now()}`,
    name: name.trim() || "Untitled Project",
    boardId,
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
