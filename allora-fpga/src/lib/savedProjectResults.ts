import type { ProjectFile } from "../pages/dashboard/types";

type Source = { name: string; content: string };

export function sameSources(saved: unknown, current: Source[]): boolean {
  if (!Array.isArray(saved) || saved.length !== current.length) return false;
  const sources = new Map(current.map((file) => [file.name, file.content]));
  const seen = new Set<string>();
  return saved.every((file) => {
    if (!file || typeof file.name !== "string" || seen.has(file.name)) return false;
    seen.add(file.name);
    return typeof file.content === "string" && sources.get(file.name) === file.content;
  });
}

export function readSavedResult(files: ProjectFile[], name: string): Record<string, unknown> | null {
  const file = files.find((item) => item.name === name && !item.isBinary);
  if (!file) return null;
  try {
    const result: unknown = JSON.parse(file.content);
    return result && typeof result === "object" && !Array.isArray(result)
      ? result as Record<string, unknown> : null;
  } catch { return null; }
}

export function matchesSavedSimulator(
  saved: Record<string, unknown> | null,
  sources: Source[], top: string, config: unknown, view: "simulation" | "peripheralWorkbench", memoryFiles: Source[] = [],
): boolean {
  const result = saved?.result as { compiled?: boolean } | undefined;
  return result?.compiled === true && saved?.topModule === top &&
    sameSources(saved.sourceFiles, sources) && sameSources(saved.memoryFiles ?? [], memoryFiles) &&
    stableJson(normalizeConfig(saved[view], view)) === stableJson(normalizeConfig(config, view));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

function normalizeConfig(value: unknown, view: string): unknown {
  if (view !== "simulation" || !value || typeof value !== "object") return value;
  const config = value as Record<string, unknown>;
  if (!Array.isArray(config.peripherals)) return value;
  return { ...config, peripherals: config.peripherals.filter((item) => item?.signal)
    .map((item) => ({ ...item, bit: item.bit ?? 0, activeHigh: item.activeHigh ?? true }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id))) };
}

export function getMemorySources(files: ProjectFile[]): Source[] {
  return files.filter((file) => !file.isBinary && /^src\/generated\/[^/]+\.hex$/.test(file.name))
    .map(({ name, content }) => ({ name, content }));
}
