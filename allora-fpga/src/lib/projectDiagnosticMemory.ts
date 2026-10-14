import type { ProjectDiagnostic } from "./projectDiagnostics";
import { hasTauriInvoke, invokeTauri } from "./tauri";

let pending = Promise.resolve();
let queued: { signature: string; entries: ProjectDiagnostic[] } | undefined;
let lastSynced = "";
let inFlight = false;
// This updates app-local memory only. The model reads it through an explicit
// Allora tool call when the user asks about a recent error.
export async function syncProjectDiagnosticMemory(entries: readonly ProjectDiagnostic[]): Promise<void> {
  if (!hasTauriInvoke()) return;
  const snapshot = entries.map(entry => ({ ...entry }));
  const signature = JSON.stringify(snapshot.map(entry => [entry.id, entry.version, entry.projectPath]));
  if (signature === lastSynced && !queued && !inFlight) return pending;
  queued = { signature, entries: snapshot };
  // Collapse bursts to the newest snapshot. Serial IPC prevents a late, older
  // update from overwriting current memory. Ordinary sends reuse the last sync.
  pending = pending.catch(() => {}).then(async () => {
    const next = queued;
    queued = undefined;
    if (!next || next.signature === lastSynced) return;
    inFlight = true;
    try {
      await invokeTauri<void>("sync_project_diagnostic_memory", { entries: next.entries });
      lastSynced = next.signature;
    } finally {
      inFlight = false;
    }
  });
  await pending;
}
