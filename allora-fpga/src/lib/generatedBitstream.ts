import type { ProjectFile } from "../pages/dashboard/types";

/** Use only the canonical output written by generate_bitstream_service. */
export function resolveGeneratedBitstream(files: ProjectFile[], projectPath: string | undefined, projectName: string, boardFamily: string): ProjectFile | undefined {
  if (!projectPath) return undefined;
  const family = boardFamily.toLowerCase();
  const extension = family.includes("ice40") ? "bin" : "bit";
  // Match the native sanitizer exactly, including repeated punctuation.
  const stem = projectName.trim().replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "") || "allora_project";
  const path = `${projectPath.replace(/\/$/, "")}/build/${stem}.${extension}`;
  return files.find(file => file.path === path);
}
