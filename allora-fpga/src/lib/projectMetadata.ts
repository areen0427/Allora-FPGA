import type { SavedProject } from "../data/projects";
import { getBoardById, VIRTUAL_BOARD } from "../data/boards";
import { findTopModuleFile } from "../hooks/utils";
import type { ProjectFile } from "../pages/dashboard/types";

/** Disk metadata is authoritative after chat edits and when reopening a project. */
export function reconcileProjectMetadata(project: SavedProject, files: ProjectFile[]): SavedProject {
  const file = files.find(file => file.name === "allora-project.json");
  if (!file || file.isBinary) throw new Error("Project metadata is missing.");
  const metadata = JSON.parse(file.content);
  const boardId = metadata.boardId ?? project.boardId;
  if (!getBoardById(boardId)) throw new Error("The project references an unavailable board.");
  const boardChanged = boardId !== project.boardId;
  return {
    ...project,
    files,
    name: metadata.name?.trim() || project.name,
    boardId,
    language: metadata.language ?? project.language,
    projectKind: boardId === VIRTUAL_BOARD.id ? "simulation" : "hardware",
    lastExecutionTarget: boardId === VIRTUAL_BOARD.id ? "simulate" : boardChanged ? "build" : project.lastExecutionTarget,
    topLevelFileName: findTopModuleFile(files, metadata.topModule) ?? project.topLevelFileName,
    updatedAt: new Date().toISOString(),
  };
}
