import { useEffect, useState } from "react";
import {
  currentMonitor,
  getCurrentWindow,
  type Monitor,
} from "@tauri-apps/api/window";
import { hasTauriInvoke } from "../lib/tauri";

const DEFAULT_DISPLAY_KEY = "display:default";

function getMonitorKey(monitor: Monitor | null) {
  if (!monitor) return DEFAULT_DISPLAY_KEY;

  const name = monitor.name?.trim().toLocaleLowerCase();
  if (name) {
    // Monitor names survive display scaling and arrangement changes. Tauri
    // does not expose a stable hardware ID, so identically named displays share
    // this preference.
    return `display:${encodeURIComponent(name)}`;
  }

  return `display:unnamed:${monitor.size.width}x${monitor.size.height}@${monitor.scaleFactor}`;
}

export function useCurrentDisplayKey() {
  const [displayInfo, setDisplayInfo] = useState({
    displayKey: DEFAULT_DISPLAY_KEY,
    resolved: false,
  });

  useEffect(() => {
    if (!hasTauriInvoke()) {
      setDisplayInfo({ displayKey: DEFAULT_DISPLAY_KEY, resolved: true });
      return;
    }

    let disposed = false;
    let refreshTimer: number | undefined;
    let refreshSequence = 0;
    const unlisteners: Array<() => void> = [];
    const appWindow = getCurrentWindow();

    const refresh = async () => {
      const sequence = ++refreshSequence;
      try {
        const monitor = await currentMonitor();
        if (disposed || sequence !== refreshSequence) return;
        if (monitor) {
          setDisplayInfo({
            displayKey: getMonitorKey(monitor),
            resolved: true,
          });
        } else {
          setDisplayInfo((current) =>
            current.resolved
              ? current
              : { displayKey: DEFAULT_DISPLAY_KEY, resolved: true },
          );
        }
      } catch {
        if (disposed || sequence !== refreshSequence) return;
        setDisplayInfo((current) =>
          current.resolved
            ? current
            : { displayKey: DEFAULT_DISPLAY_KEY, resolved: true },
        );
      }
    };

    const scheduleRefresh = () => {
      // Invalidate a query that started before the display event so its late
      // result cannot briefly restore the previous display's preference.
      refreshSequence += 1;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refresh(), 120);
    };

    const subscribe = async (
      addListener: () => Promise<() => void>,
    ) => {
      try {
        const unlisten = await addListener();
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      } catch {
        // The initial monitor query still supplies a safe default.
      }
    };

    void refresh();
    void Promise.all([
      subscribe(() => appWindow.onMoved(scheduleRefresh)),
      subscribe(() => appWindow.onResized(scheduleRefresh)),
      subscribe(() => appWindow.onScaleChanged(scheduleRefresh)),
    ]).then(() => {
      // Re-query once listeners are ready so a display move during listener
      // registration cannot leave the window associated with its old monitor.
      if (!disposed) void refresh();
    });

    return () => {
      disposed = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  return displayInfo;
}
