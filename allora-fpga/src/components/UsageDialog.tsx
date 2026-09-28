import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { hasTauriInvoke, invokeTauri } from "../lib/tauri";

type ResourceUsage = {
  cpuPercent: number;
  memoryBytes: number;
  totalMemoryBytes: number | null;
};

function formatMemory(bytes: number) {
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function UsageDialog({
  anchor,
  onClose,
}: {
  anchor: HTMLButtonElement;
  onClose: () => void;
}) {
  const [usage, setUsage] = useState<ResourceUsage | null>(null);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [showNumbers, setShowNumbers] = useState(() =>
    document.documentElement.dataset.reduceMotion === "true" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showNumbers) return;
    const timer = window.setTimeout(() => setShowNumbers(true), 320);
    return () => window.clearTimeout(timer);
  }, [showNumbers]);

  useLayoutEffect(() => {
    function place() {
      if (!dialogRef.current) return;
      const trigger = anchor.getBoundingClientRect();
      const dialog = dialogRef.current.getBoundingClientRect();
      const margin = 12;
      setPosition({
        left: Math.max(margin, Math.min(trigger.right + margin, window.innerWidth - dialog.width - margin)),
        top: Math.max(margin, Math.min(trigger.bottom - dialog.height, window.innerHeight - dialog.height - margin)),
      });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor, usage, error, showNumbers]);

  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    async function refresh() {
      if (pending || !hasTauriInvoke()) return;
      pending = true;
      try {
        const next = await invokeTauri<ResourceUsage>("resource_usage");
        if (!cancelled) {
          setUsage(next);
          setError("");
        }
      } catch (cause) {
        if (!cancelled) setError(String(cause));
      } finally {
        pending = false;
      }
    }

    if (hasTauriInvoke()) {
      void refresh();
    } else {
      setError("Resource usage is available in the desktop app.");
    }
    const timer = window.setInterval(() => void refresh(), 2000);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function dismissOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (anchor.contains(target) || dialogRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", dismissOutside);
      previousFocus?.focus();
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={dialogRef}
      className="usage-dialog"
      role="dialog"
      aria-labelledby="usage-title"
      tabIndex={-1}
      style={position ? { left: position.left, top: position.top } : { visibility: "hidden" }}
    >
        <header className="usage-dialog-header">
          <div className="usage-dialog-title">
            <div>
              <span className="usage-dialog-eyebrow">Allora FPGA</span>
              <h2 id="usage-title">Resource usage</h2>
            </div>
          </div>
        </header>
        <div className="usage-metrics">
          <div className="usage-metric">
            <span>CPU</span>
            <strong className={showNumbers && usage ? "is-ready" : undefined}>
              {showNumbers && usage ? `${usage.cpuPercent.toFixed(1)}%` : "—"}
            </strong>
          </div>
          <div className="usage-metric">
            <span>Memory</span>
            <strong className={showNumbers && usage ? "is-ready" : undefined}>
              {showNumbers && usage ? formatMemory(usage.memoryBytes) : "—"}
            </strong>
            <small>
              {showNumbers && usage
                ? usage.totalMemoryBytes
                  ? `${((usage.memoryBytes / usage.totalMemoryBytes) * 100).toFixed(1)}% of installed RAM`
                  : "Resident memory"
                : "\u00a0"}
            </small>
          </div>
        </div>
        {showNumbers && error ? <p className="usage-error" role="status">{error}</p> : null}
        {showNumbers && !usage && !error ? <p className="usage-loading">Measuring usage…</p> : null}
    </div>
  );
}
