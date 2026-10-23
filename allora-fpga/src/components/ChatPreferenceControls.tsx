import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, PencilLine, Speech } from "lucide-react";
import type { ChatHdlLanguage } from "../data/settings";
import type { ChatMode } from "../lib/aiChat";
import "./ChatPreferenceControls.css";

type Choice<Value extends string> = { value: Value; label: string; description?: string; icon?: ReactNode; mark?: string };
const modes: Choice<ChatMode>[] = [
  { value: "edit", label: "Edit", icon: <PencilLine size={15} aria-hidden="true" />, description: "Create and update project files with Allora tools." },
  { value: "discuss", label: "Discuss", icon: <Speech size={15} aria-hidden="true" />, description: "Inspect and explain. AI project changes and execution tools are disabled." },
];
const languages: Choice<ChatHdlLanguage>[] = [
  { value: "verilog", label: "Verilog", mark: "V" },
  { value: "systemverilog", label: "SystemVerilog", mark: "SV" },
  { value: "vhdl", label: "VHDL", mark: "VHDL" },
];

function PreferenceDropdown<Value extends string>({ label, value, choices, disabled, onChange }: {
  label: string; value: Value; choices: Choice<Value>[]; disabled: boolean; onChange: (value: Value) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const expanded = open && !disabled;
  const selected = choices.find(choice => choice.value === value);
  const adornment = (choice: Choice<Value>) => choice.icon
    ? <span className="chat-preference-icon">{choice.icon}</span>
    : choice.mark ? <span className="chat-language-mark" aria-hidden="true">{choice.mark}</span> : null;
  useLayoutEffect(() => {
    if (!expanded || !popup.current || !trigger.current) return;
    const element = popup.current;
    element.showPopover();
    function place() {
      const anchor = trigger.current!.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 24);
      // Set all fixed-position edges explicitly: native popovers can otherwise
      // retain an automatic top inset and stretch between top and bottom.
      element.style.top = "auto";
      element.style.right = "auto";
      element.style.height = "max-content";
      element.style.width = `${width}px`;
      element.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`;
      element.style.bottom = `${window.innerHeight - anchor.top + 8}px`;
      element.style.maxHeight = `${Math.max(0, anchor.top - 20)}px`;
    }
    place();
    element.classList.add("glass-unfold");
    element.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    const observer = new ResizeObserver(place);
    observer.observe(trigger.current);
    const scroll = (event: Event) => { if (!element.contains(event.target as Node)) place(); };
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
      if (element.matches(":popover-open")) element.hidePopover();
    };
  }, [expanded]);
  return <div className="chat-preference-control">
    <button ref={trigger} type="button" className="ui-dropdown ui-hover-button chat-model-trigger chat-preference-trigger"
      disabled={disabled} aria-label={label} title={label} aria-haspopup="listbox" aria-expanded={expanded} aria-controls={id}
      onClick={() => setOpen(current => !current)}>
      {selected && adornment(selected)}
      <span>{selected?.label}</span>
    </button>
    {expanded && <div ref={popup} id={id} popover="manual" role="listbox" aria-label={label}
      className="welcome-product-info chat-preference-popup" onKeyDown={event => {
        if (event.key === "Tab") { setOpen(false); trigger.current?.focus(); return; }
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const options = [...popup.current!.querySelectorAll<HTMLButtonElement>('[role="option"]')];
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      }}>
      {choices.map(choice => <button key={choice.value} type="button" role="option" aria-selected={choice.value === value}
        className="chat-preference-option" onClick={() => { setOpen(false); trigger.current?.focus(); onChange(choice.value); }}>
        {adornment(choice)}
        <span className="chat-preference-option-copy"><strong>{choice.label}</strong>{choice.description && <small>{choice.description}</small>}</span>
        {choice.value === value && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}

export default function ChatPreferenceControls({ mode, language, disabled, onModeChange, onLanguageChange }: {
  mode: ChatMode; language: ChatHdlLanguage; disabled: boolean;
  onModeChange: (mode: ChatMode) => void; onLanguageChange: (language: ChatHdlLanguage) => void;
}) {
  return <>
    <PreferenceDropdown label="Chat mode" value={mode} choices={modes} disabled={disabled} onChange={onModeChange} />
    <PreferenceDropdown label="HDL language" value={language} choices={languages} disabled={disabled} onChange={onLanguageChange} />
  </>;
}
