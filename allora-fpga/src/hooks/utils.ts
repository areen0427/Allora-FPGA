import type { ProjectFile } from "../pages/dashboard/types";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export function isHdlFile(fileName: string) {
  return (
    fileName.endsWith(".v") ||
    fileName.endsWith(".sv") ||
    fileName.endsWith(".vhd") ||
    fileName.endsWith(".vhdl")
  );
}

export function moveFileToTop(files: ProjectFile[], fileName: string) {
  const fileIndex = files.findIndex((file) => file.name === fileName);
  if (fileIndex <= 0) return files;

  const nextFiles = [...files];
  const [topLevelFile] = nextFiles.splice(fileIndex, 1);
  return [topLevelFile, ...nextFiles];
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "The project could not be saved.";
}

export function getSaveStatusLabel(status: SaveStatus, lastSavedAt: string) {
  if (status === "saving") return "Saving...";
  if (status === "unsaved") return "Unsaved changes";
  if (status === "error") return "Save failed";
  return lastSavedAt ? "Saved" : "Not saved";
}