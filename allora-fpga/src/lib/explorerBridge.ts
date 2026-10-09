import { hasTauriInvoke } from "./tauri";
export type ExplorerMessage =
  | {
      type: "rtl-selection" | "rtl-navigate";
      projectKey: string;
      fileName: string;
      content: string;
      start: number;
      end: number;
      startColumn?: number;
      endColumn?: number;
    }
  | { type: "waveform-request"; projectKey: string }
  | {
      type: "waveform";
      projectKey: string;
      files: { name: string; content: string }[];
      memories: { name: string; content: string }[];
      vcd: string;
      waveformName: string;
      recordingId: string;
    }
  | {
      type: "waveform-select";
      projectKey: string;
      recordingId: string;
      signalName: string;
    }
  | {
      type: "waveform-time";
      projectKey: string;
      recordingId: string;
      time: number;
    }
  | { type: "navigation-result"; projectKey: string; message: string };
const EVENT = "allora-synthesis-explorer";
type Events = {
  emit: (name: string, payload: unknown) => Promise<void>;
  listen: (
    name: string,
    callback: (event: { payload: ExplorerMessage }) => void,
  ) => Promise<() => void>;
};
function events() {
  return (window as Window & { __TAURI__?: { event?: Events } }).__TAURI__
    ?.event;
}
export async function publishExplorer(message: ExplorerMessage) {
  if (hasTauriInvoke()) {
    const api = events();
    if (!api) throw new Error("Native window event API unavailable.");
    await api.emit(EVENT, message);
  } else {
    const channel = new BroadcastChannel(EVENT);
    channel.postMessage(message);
    channel.close();
  }
}
export function listenExplorer(callback: (message: ExplorerMessage) => void) {
  let disposed = false,
    cleanup: (() => void) | undefined;
  if (hasTauriInvoke()) {
    const api = events();
    if (api)
      void api
        .listen(EVENT, (event) => {
          if (!disposed) callback(event.payload);
        })
        .then((fn) => {
          if (disposed) fn();
          else cleanup = fn;
        })
        .catch(() => {});
  } else {
    const channel = new BroadcastChannel(EVENT);
    channel.onmessage = (event) => callback(event.data);
    cleanup = () => channel.close();
  }
  return () => {
    disposed = true;
    cleanup?.();
  };
}
