import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { aiChatApi, type ContextUsage, type RateLimits, type RateWindow } from "../lib/aiChat";

import { contextPercent, contextColor } from "../lib/chatUsage";

function WindowUsage({ label, window: quota }: { label: string; window?: RateWindow | null }) {
  const remaining = quota ? Math.max(0, Math.min(100, 100 - quota.usedPercent)) : null;
  return <section className="chat-quota-window">
    <div><strong>{label}</strong><span>{remaining === null ? "Unavailable" : `${Math.round(remaining)}% left`}</span></div>
    <div className="chat-usage-track"><span style={{ width: `${remaining ?? 0}%`, background: contextColor(100 - (remaining ?? 0)) }} /></div>
    <small>{quota?.resetsAt ? `Resets ${new Date(quota.resetsAt * 1000).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}` : "Reset time unavailable"}</small>
  </section>;
}
export default function ChatUsageControls({ usage, limits, available, hasMessages }: {
  usage?: ContextUsage; limits: RateLimits | null; available: boolean; hasMessages: boolean;
}) {
  const percent = contextPercent(usage) ?? (hasMessages ? null : 0);
  const [open, setOpen] = useState(false);
  const [contextHovered, setContextHovered] = useState(false);
  const contextTooltipId = useId();
  const [snapshot, setSnapshot] = useState<RateLimits | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (limits && (!limits.limitId || limits.limitId === "codex")) setSnapshot(limits);
  }, [limits]);
  useEffect(() => {
    if (!open || !available) return;
    let cancelled = false;
    setLoading(true); setError("");
    void aiChatApi.usage().then((result) => {
      if (!cancelled) setSnapshot(result.rateLimitsByLimitId?.codex ?? result.rateLimits);
    }).catch(() => {
      if (!cancelled) setError("Unable to refresh account usage. Try reopening this panel.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, available]);
  useLayoutEffect(() => {
    if (!open || !popup.current || !trigger.current) return;
    const element = popup.current;
    function place() {
      const anchor = trigger.current!.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      element.style.width = `${width}px`;
      element.style.left = `${Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12))}px`;
      element.style.bottom = `${window.innerHeight - anchor.top + 12}px`;
      element.style.maxHeight = `${Math.max(0, anchor.top - 24)}px`;
    }
    place(); element.showPopover(); element.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape);
      if (element.matches(":popover-open")) element.hidePopover();
    };
  }, [open]);
  const windows = [snapshot?.primary, snapshot?.secondary];
  const fiveHour = windows.find((value) => value?.windowDurationMins === 300);
  const weekly = windows.find((value) => value?.windowDurationMins === 10080);
  return <div className="chat-usage-controls" ref={root}>
    <button type="button" className="chat-model-trigger chat-usage-trigger" ref={trigger}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
      Usage
    </button>
    <div className="chat-context-counter" tabIndex={0} aria-label="Context usage" aria-describedby={contextHovered ? contextTooltipId : undefined}
      onMouseEnter={() => setContextHovered(true)} onMouseLeave={() => setContextHovered(false)}
      onFocus={() => setContextHovered(true)} onBlur={() => setContextHovered(false)}
      onKeyDown={(event) => { if (event.key === "Escape") setContextHovered(false); }}>
      <span>Context</span>
      {contextHovered && <div id={contextTooltipId} role="tooltip" className="chat-context-tooltip">
        <strong>{percent === null ? "Unavailable" : `${Math.round(percent)}%`}</strong>
        <small>{usage?.modelContextWindow ? `${usage.last.totalTokens.toLocaleString()}/${usage.modelContextWindow.toLocaleString()} used` : "Token counts available after Codex responds"}</small>
      </div>}
      <div className="chat-usage-track" role="progressbar" aria-label="Context window used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? "Unavailable" : `${Math.round(percent)}% used`}>
        <span style={{ width: `${percent ?? 0}%`, background: contextColor(percent ?? 0) }} />
      </div>
    </div>
    {open && <div ref={popup} id={id} popover="manual" tabIndex={-1} role="dialog" aria-label="Codex account usage" className="chat-model-popup chat-usage-popup">
      <header><strong>Codex usage</strong><button type="button" aria-label="Close usage" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button></header>
      {!available ? <p>Connect your Codex account to see usage.</p> : loading ? <p role="status">Refreshing usage…</p> : <>
        {error && <p role="status">{error}{snapshot && " Showing the last received values."}</p>}
        <WindowUsage label="5-hour limit" window={fiveHour} />
        <WindowUsage label="Weekly limit" window={weekly} />
      </>}
    </div>}
  </div>;
}
