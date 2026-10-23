export type ChatTool = {
  id: string;
  name: string;
  status: "running" | "complete" | "error";
  input?: string;
  output?: string;
  result?: unknown;
};
export type ChatArtifact = {
  id: string;
  kind: "waveform" | "synthesis" | "timing" | "bitstream" | "file";
  label: string;
  path?: string;
  projectPath?: string;
  data?: unknown;
  sourceLocation?: { line: number; column?: number; endLine?: number };
};
export type ChangeReviewData = {
  id: string;
  projectPath: string;
  files: { path: string; before: string | null; after: string | null }[];
  skipped?: string[] | number;
  canRestore?: boolean;
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function parse(value: string | undefined): unknown {
  try { return value ? JSON.parse(value) : undefined; } catch { return undefined; }
}

/** Only successful structured tool results create artifact cards. Incomplete previews are ignored. */
export function extractChatArtifacts(tools: readonly ChatTool[], projectPath?: string): ChatArtifact[] {
  const artifacts = new Map<string, ChatArtifact>();
  for (const tool of tools) {
    if (tool.status !== "complete") continue;
    const input = parse(tool.input);
    const fallbackProject = record(input) && typeof input.projectPath === "string" ? input.projectPath : projectPath;
    function visit(value: unknown, inheritedProject: string | undefined, depth: number) {
      if (!record(value) || depth > 5 || value.isError === true || value.failure || value.error || ["failed", "error", "cancelled", "running", "cancelling"].includes(String(value.status))) return;
      const currentProject = typeof value.projectPath === "string" ? value.projectPath : typeof value.project === "string" ? value.project : inheritedProject;
      function add(kind: ChatArtifact["kind"], label: string, path?: unknown, data?: unknown) {
        if (path !== undefined && (typeof path !== "string" || !path.trim() || /^(?:https?|javascript|data):/i.test(path))) return;
        if (!path && data === undefined) return;
        const key = `${kind}:${currentProject ?? ""}:${String(path ?? "inline")}`;
        artifacts.set(key, { id: `${tool.id}:${key}`, kind, label, path: typeof path === "string" ? path : undefined, projectPath: currentProject, data });
      }
      if (typeof value.waveformPath === "string") add("waveform", "Simulation waveform", value.waveformPath);
      if (typeof value.artifactPath === "string") add("bitstream", "Built bitstream", value.artifactPath);
      if (value.timing && record(value.timing)) add("timing", "Timing report", undefined, value.timing);
      if (typeof value.reportPath === "string") {
        const synthesis = /synthesis-diagram/i.test(value.reportPath) || /synthesis/i.test(String(value.kind ?? tool.name));
        const timing = /timing/i.test(value.reportPath);
        add(synthesis ? "synthesis" : timing ? "timing" : "file", synthesis ? "Synthesis diagram" : timing ? "Timing report" : "Saved report", value.reportPath);
      }
      for (const key of ["structuredContent", "result", "data"]) visit(value[key], currentProject, depth + 1);
      if (Array.isArray(value.content)) for (const item of value.content) {
        if (record(item) && item.type === "text" && typeof item.text === "string") visit(parse(item.text), currentProject, depth + 1);
      }
    }
    visit(tool.result ?? parse(tool.output), fallbackProject, 0);
  }
  return [...artifacts.values()];
}

export type DiffLine = { kind: "context" | "added" | "removed"; text: string; before?: number; after?: number };

/** A bounded line diff avoids quadratic memory usage for large generated RTL files. */
export function diffChatFile(before: string | null, after: string | null): DiffLine[] {
  const left = before === null || before === "" ? [] : before.split("\n");
  const right = after === null || after === "" ? [] : after.split("\n");
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let endLeft = left.length, endRight = right.length;
  while (endLeft > start && endRight > start && left[endLeft - 1] === right[endRight - 1]) { endLeft--; endRight--; }
  if (start === left.length && start === right.length) return [];
  const result: DiffLine[] = [];
  for (let n = Math.max(0, start - 3); n < start; n++) result.push({ kind: "context", text: left[n], before: n + 1, after: n + 1 });
  const oldLines = left.slice(start, endLeft), newLines = right.slice(start, endRight);
  if (oldLines.length * newLines.length <= 200_000) {
    const rows = Array.from({ length: oldLines.length + 1 }, () => new Uint32Array(newLines.length + 1));
    for (let i = oldLines.length - 1; i >= 0; i--) for (let j = newLines.length - 1; j >= 0; j--) {
      rows[i][j] = oldLines[i] === newLines[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
    let i = 0, j = 0;
    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        result.push({ kind: "context", text: oldLines[i], before: start + i + 1, after: start + j + 1 }); i++; j++;
      } else if (i < oldLines.length && (j === newLines.length || rows[i + 1][j] >= rows[i][j + 1])) {
        result.push({ kind: "removed", text: oldLines[i], before: start + i + 1 }); i++;
      } else { result.push({ kind: "added", text: newLines[j], after: start + j + 1 }); j++; }
    }
  } else {
    oldLines.forEach((text, i) => result.push({ kind: "removed", text, before: start + i + 1 }));
    newLines.forEach((text, i) => result.push({ kind: "added", text, after: start + i + 1 }));
  }
  for (let n = 0; n < Math.min(3, left.length - endLeft); n++) result.push({ kind: "context", text: left[endLeft + n], before: endLeft + n + 1, after: endRight + n + 1 });
  return result;
}

export function formatTurnDuration(elapsedMs?: number): string | null {
  if (elapsedMs === undefined || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  const seconds = Math.round(elapsedMs / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Match the requested saved VCD without falling back to another waveform with the same basename. */
export function findChatWaveform<T extends { name: string; path?: string; isBinary?: boolean }>(files: readonly T[], path: string, projectPath?: string): T | undefined {
  const normalize = (value: string) => value.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  const target = normalize(path);
  const project = projectPath ? normalize(projectPath) : undefined;
  const relative = project && target.startsWith(`${project}/`) ? target.slice(project.length + 1) : target;
  const isAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(relative);
  return files.find(file => {
    if (file.isBinary || !/\.vcd$/i.test(file.name)) return false;
    const filePath = file.path ? normalize(file.path) : undefined;
    const name = normalize(file.name);
    return filePath === target || filePath === relative || name === relative || (!isAbsolute && !!filePath?.endsWith(`/${relative}`));
  });
}
