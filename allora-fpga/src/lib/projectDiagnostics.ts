import type { DashboardSection } from "../pages/dashboard/types";

export const DIAGNOSTIC_LIMITS = { projects: 4, perProject: 6, message: 800, details: 3200, ttlMs: 2 * 60 * 60 * 1000 } as const;
export type ProjectDiagnostic = {
  id: string;
  projectKey: string;
  projectPath?: string;
  boardId?: string;
  source: DashboardSection;
  title: string;
  message: string;
  details: string;
  firstSeen: number;
  lastSeen: number;
  version: number;
  occurrences: number;
  state: "active" | "cleared";
};
export type DiagnosticInput = Pick<ProjectDiagnostic, "projectKey" | "source" | "message"> & Partial<Pick<ProjectDiagnostic, "projectPath" | "boardId" | "title" | "details">>;
export type TroubleshootIntent = { projectKey: string; diagnosticId: string; prompt: string };
export function diagnosticProjectKey(path: string) { return path.replaceAll("\\", "/").replace(/\/+$/, ""); }
export const diagnosticSourceLabel = (source: DashboardSection) => ({
  programming: "Programming", "pin-mapping": "Pin Mapping", bitstream: "Bitstream", testbench: "Testbench", synthesis: "Synthesis",
  "board-migration": "Board Migration",
  "virtual-fpga": "Virtual FPGA", "peripheral-workbench": "Peripheral Workbench", "memory-asset-studio": "Memory Asset Studio",
  "register-builder": "Register Builder", editor: "Editor", serial: "Serial Monitor", health: "Build Health", chat: "AI Design Studio",
})[source];

// A fixed-size in-process buffer: no timers, filesystem scans, storage writes, or model calls.
export function createProjectDiagnostics(now: () => number = Date.now) {
  const projects = new Map<string, ProjectDiagnostic[]>();
  const listeners = new Set<() => void>();
  const intentListeners = new Set<() => void>();
  let revision = 0;
  let sequence = 0;
  let intent: TroubleshootIntent | undefined;
  const notify = () => { revision++; for (const listener of listeners) listener(); };
  const prune = () => {
    const cutoff = now() - DIAGNOSTIC_LIMITS.ttlMs;
    for (const [key, entries] of projects) {
      const recent = entries.filter(entry => entry.lastSeen > cutoff);
      if (recent.length) projects.set(key, recent); else projects.delete(key);
    }
  };
  return {
    report(input: DiagnosticInput): ProjectDiagnostic | undefined {
      const message = input.message.trim().slice(0, DIAGNOSTIC_LIMITS.message);
      if (!message || !input.projectKey) return;
      prune();
      const key = diagnosticProjectKey(input.projectKey);
      const entries = projects.get(key) ?? [];
      const details = (input.details ?? "").slice(-DIAGNOSTIC_LIMITS.details);
      const previous = entries.find(entry => entry.source === input.source && entry.message === message);
      // Stable errors are free on re-render/remount: no notifications or new prompt versions.
      if (previous?.state === "active" && previous.details === details) return previous;
      const stamp = now();
      const entry: ProjectDiagnostic = {
        id: previous?.id ?? `diagnostic:${stamp}:${++sequence}`, projectKey: key, projectPath: input.projectPath, boardId: input.boardId,
        source: input.source, title: (input.title ?? `${diagnosticSourceLabel(input.source)} error`).slice(0, 120), message, details,
        firstSeen: previous?.firstSeen ?? stamp, lastSeen: stamp, version: (previous?.version ?? 0) + 1,
        occurrences: (previous?.occurrences ?? 0) + 1, state: "active",
      };
      projects.delete(key);
      projects.set(key, [entry, ...entries.filter(item => item.id !== entry.id)].slice(0, DIAGNOSTIC_LIMITS.perProject));
      while (projects.size > DIAGNOSTIC_LIMITS.projects) projects.delete(projects.keys().next().value!);
      notify();
      return entry;
    },
    clear(projectKey: string, id: string) {
      const entries = projects.get(diagnosticProjectKey(projectKey));
      const entry = entries?.find(item => item.id === id);
      if (!entry || entry.state === "cleared") return;
      Object.assign(entry, { state: "cleared", version: entry.version + 1, lastSeen: now() });
      notify();
    },
    recent(projectKey: string) {
      const cutoff = now() - DIAGNOSTIC_LIMITS.ttlMs;
      return (projects.get(diagnosticProjectKey(projectKey)) ?? []).filter(entry => entry.lastSeen > cutoff);
    },
    snapshot() {
      const cutoff = now() - DIAGNOSTIC_LIMITS.ttlMs;
      return [...projects.values()].flat().filter(entry => entry.lastSeen > cutoff)
        .sort((a, b) => b.lastSeen - a.lastSeen).map(entry => ({ ...entry }));
    },
    revision: () => revision,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    troubleshoot(value: TroubleshootIntent) { intent = value; for (const listener of intentListeners) listener(); },
    takeIntent(projectKey: string) {
      if (!intent || diagnosticProjectKey(intent.projectKey) !== diagnosticProjectKey(projectKey)) return;
      const value = intent; intent = undefined; return value;
    },
    subscribeIntent(listener: () => void) { intentListeners.add(listener); return () => { intentListeners.delete(listener); }; },
  };
}
export const projectDiagnostics = createProjectDiagnostics();
