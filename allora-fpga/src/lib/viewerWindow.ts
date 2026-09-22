import { hasTauriInvoke, invokeTauri } from "./tauri";

export type ViewerKind = "synthesis" | "waveform";

export type ViewerEnvelope<T> = {
  title: string;
  payload: T;
};

const STORAGE_PREFIX = "allora-fpga-viewer:";

export async function openViewerWindow<T>(
  kind: ViewerKind,
  title: string,
  payload: T,
) {
  const id = createViewerId();
  const storageKey = `${STORAGE_PREFIX}${id}`;
  const envelope: ViewerEnvelope<T> = { title, payload };

  if (hasTauriInvoke()) {
    await invokeTauri("open_viewer_window", {
      request: {
        kind,
        storageKey,
        payload: JSON.stringify(envelope),
        title,
        label: `viewer-${kind}-${id}`,
      },
    });
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(envelope));
  const viewer = window.open(
    `/?viewer=${kind}&key=${encodeURIComponent(storageKey)}`,
    `allora-${kind}-${id}`,
    "popup=yes,width=1280,height=850,resizable=yes,scrollbars=yes",
  );
  if (!viewer) {
    window.localStorage.removeItem(storageKey);
    throw new Error("The viewer window was blocked by the browser.");
  }
}

export async function readViewerEnvelope<T>(storageKey: string) {
  const isTauri = hasTauriInvoke();
  const raw = isTauri
    ? await invokeTauri<string | null>("read_viewer_payload", { storageKey })
    : window.localStorage.getItem(storageKey);
  if (!isTauri) window.localStorage.removeItem(storageKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ViewerEnvelope<T>;
  } catch {
    return null;
  }
}

function createViewerId() {
  return (
    window.crypto?.randomUUID?.().replaceAll("-", "") ??
    `${Date.now()}${Math.random().toString(36).slice(2)}`
  );
}
