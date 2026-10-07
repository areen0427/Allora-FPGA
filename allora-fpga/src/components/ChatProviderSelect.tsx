import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { aiIntegrationApi, type AiProvider, type AiProviderStatus } from "../lib/aiIntegration";

const providers: { id: AiProvider; name: string }[] = [
  { id: "codex", name: "Codex" },
  { id: "claude", name: "Claude Code" },
];

type Props = {
  selected: AiProvider;
  disabled: boolean;
  desktopAvailable: boolean;
  codexStatus: AiProviderStatus | null;
  onChange: (provider: AiProvider) => void;
};

export default function ChatProviderSelect(props: Props) {
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<Partial<Record<AiProvider, AiProviderStatus>>>({});
  const [checking, setChecking] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const popupId = useId();

  useEffect(() => {
    if (!open || !props.desktopAvailable) return;
    let cancelled = false;
    setChecking(true);
    void Promise.all(providers.map(async ({ id }) => {
      try { return [id, await aiIntegrationApi.status(id)] as const; }
      catch { return [id, { provider: id, installed: false, authenticated: false, state: "error" }] as const; }
    })).then((results) => {
      if (cancelled) return;
      setStatuses(Object.fromEntries(results));
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, [open, props.desktopAvailable]);

  useLayoutEffect(() => {
    if (!open || props.disabled || !popup.current || !trigger.current) return;
    const element = popup.current;
    function place() {
      const anchor = trigger.current!.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 24);
      element.style.width = `${width}px`;
      element.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`;
      element.style.bottom = `${window.innerHeight - anchor.top + 12}px`;
      element.style.maxHeight = `${Math.max(0, anchor.top - 24)}px`;
    }
    place();
    element.showPopover();
    const observer = new ResizeObserver(place);
    observer.observe(trigger.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      if (element.matches(":popover-open")) element.hidePopover();
    };
  }, [open, props.disabled]);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>(".chat-provider-option[aria-pressed='true']")?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function subtitle(id: AiProvider) {
    if (!props.desktopAvailable) return "Open the desktop app to check connection";
    if (checking) return "Checking account connection…";
    const status = statuses[id] ?? (id === "codex" ? props.codexStatus : null);
    if (!status || status.state === "error") return "Unable to check account connection";
    return status.authenticated ? "Account connected" : "Account not connected";
  }

  return (
    <div className="chat-provider-select" ref={root}>
      <button ref={trigger} type="button" className="chat-model-trigger chat-provider-trigger"
        disabled={props.disabled} aria-label="Choose provider" aria-haspopup="dialog"
        aria-expanded={open && !props.disabled} aria-controls={popupId}
        onClick={() => setOpen((value) => !value)}>
        <span>{providers.find(({ id }) => id === props.selected)?.name}</span>
      </button>
      {open && !props.disabled && (
        <div ref={popup} popover="manual" id={popupId} className="chat-model-popup chat-provider-popup"
          role="dialog" aria-label="Choose provider" onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const options = [...root.current!.querySelectorAll<HTMLButtonElement>(".chat-provider-option")];
            const index = options.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
              : event.key === "ArrowDown" ? (index + 1) % options.length : (index - 1 + options.length) % options.length;
            options[next]?.focus();
          }}>
          <header><strong>Provider</strong></header>
          {providers.map(({ id, name }) => (
            <button key={id} type="button" className={`chat-provider-option${props.selected === id ? " selected" : ""}`}
              aria-pressed={props.selected === id} onClick={() => {
                props.onChange(id); setOpen(false); trigger.current?.focus();
              }}>
              <span><strong>{name}</strong><small>{subtitle(id)}</small></span>
              {props.selected === id && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
