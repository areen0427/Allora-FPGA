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

export function findTopModule(files: ProjectFile[]) {
  for (const file of files) {
    const match = file.content.match(
      /\b(module|entity)\s+([a-zA-Z_][a-zA-Z0-9_$]*)/i,
    );
    if (match) return match[2];
  }

  return null;
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isLikelyTestbenchName(fileName: string) {
  return /(^|[_\-.])(tb|testbench)([_\-.]|$)/i.test(fileName);
}

/**
 * Heuristically detects whether a file is a testbench (rather than a
 * synthesizable design source). Testbenches contain `$finish`/`initial`
 * constructs that Yosys rejects, so they must be excluded from synthesis.
 */
export function isTestbenchFile(file: ProjectFile, topModule: string | null) {
  if (isLikelyTestbenchName(file.name)) return true;

  const moduleName = findTopModule([file]);
  if (!moduleName) return false;

  const normalizedModule = normalizeName(moduleName);
  const normalizedTop = topModule ? normalizeName(topModule) : "";
  return (
    normalizedModule.includes("testbench") ||
    normalizedModule.endsWith("tb") ||
    normalizedModule.startsWith("tb") ||
    Boolean(normalizedTop && normalizedModule === `${normalizedTop}tb`)
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
