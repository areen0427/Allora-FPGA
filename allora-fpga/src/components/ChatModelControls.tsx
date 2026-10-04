import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import type { AiChatModel } from "../lib/aiChat";

type Props = {
  models: AiChatModel[];
  selectedModel: string;
  reasoningEffort: string | undefined;
  disabled: boolean;
  loading: boolean;
  error: string;
  onModelChange: (model: string) => void;
  onReasoningChange: (effort: string) => void;
};

function effortName(effort: string) {
  return effort === "xhigh" ? "Extra high" : effort.charAt(0).toUpperCase() + effort.slice(1);
}

export default function ChatModelControls(props: Props) {
  const [open, setOpen] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const reasoningAnchor = useRef<HTMLDivElement>(null);
  const reasoningTrigger = useRef<HTMLButtonElement>(null);
  const range = useRef<HTMLDivElement>(null);
  const [sliderPosition, setSliderPosition] = useState<number | null>(null);
  const dragging = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const model = props.models.find((item) => item.model === props.selectedModel)
    ?? props.models.find((item) => item.isDefault) ?? props.models[0];
  const choices = model?.supportedReasoningEfforts ?? [];
  const effortIndex = Math.max(0, choices.findIndex((item) => item.reasoningEffort === props.reasoningEffort));
  const effort = choices[effortIndex];
  const position = sliderPosition ?? effortIndex;
  const preview = choices[Math.round(position)];
  function commitPosition(value: number) {
    const nearest = Math.max(0, Math.min(choices.length - 1, Math.round(value)));
    if (choices[nearest]) props.onReasoningChange(choices[nearest].reasoningEffort);
    setSliderPosition(null);
  }

  function pointerPosition(clientX: number, element: HTMLDivElement) {
    const bounds = element.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - bounds.left - 9) / Math.max(1, bounds.width - 18)));
    return fraction * Math.max(0, choices.length - 1);
  }

  useLayoutEffect(() => {
    if (!open || props.disabled || !popup.current || !trigger.current) return;
    const element = popup.current;
    function place() {
      const anchor = trigger.current!.getBoundingClientRect();
      const main = root.current?.closest(".chat-main")?.getBoundingClientRect();
      const leftEdge = Math.max(12, main?.left ?? 0);
      const rightEdge = Math.min(window.innerWidth - 12, main?.right ?? window.innerWidth);
      const width = Math.min(440, Math.max(0, rightEdge - leftEdge - 12));
      element.style.width = `${width}px`;
      element.style.left = `${Math.max(leftEdge, Math.min(anchor.left, rightEdge - width))}px`;
      element.style.bottom = `${window.innerHeight - anchor.top + 12}px`;
      element.style.maxHeight = `${Math.max(0, anchor.top - 24)}px`;
    }
    place();
    element.showPopover();
    const observer = new ResizeObserver(place);
    observer.observe(root.current!);
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
    if (!open && !reasoningOpen) return;
    if (open) root.current?.querySelector<HTMLButtonElement>(".chat-model-option.selected, .chat-model-option")?.focus();
    else range.current?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
      if (!reasoningAnchor.current?.contains(event.target as Node)) setReasoningOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, reasoningOpen]);

  return (
    <div className="chat-model-controls" ref={root}>
      <button ref={trigger} type="button" className="chat-model-trigger"
        aria-haspopup="dialog" aria-expanded={open && !props.disabled} aria-controls={popupId}
        disabled={props.disabled} title={props.error || "Choose a model"}
        onClick={() => { setReasoningOpen(false); setOpen((value) => !value); }}>
        <span>{props.loading ? "Loading models…" : model?.displayName ?? "Choose model"}</span>
        <ChevronDown size={13} />
      </button>
      {open && !props.disabled && (
        <div ref={popup} popover="manual" id={popupId} className="chat-model-popup" role="dialog" aria-label="Choose Codex model"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            const options = [...root.current!.querySelectorAll<HTMLButtonElement>(".chat-model-option")];
            if (!options.length) return;
            event.preventDefault();
            const index = options.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
              : event.key === "ArrowDown" ? (index + 1) % options.length : index < 0 ? options.length - 1 : (index - 1 + options.length) % options.length;
            options[next].focus();
          }}>
          <header><strong>Choose your model</strong></header>
          <div className="chat-model-options">
            {props.models.map((item) => (
              <button type="button" key={item.model} className={`chat-model-option${model?.model === item.model ? " selected" : ""}`}
                aria-pressed={model?.model === item.model} onClick={() => {
                  props.onModelChange(item.model); setOpen(false); trigger.current?.focus();
                }}>
                <span className="chat-model-option-title"><strong>{item.displayName}</strong>{item.model === "gpt-6.1-sol" && <small>Default</small>}{model?.model === item.model && <Check size={15} />}</span>
                <span className="chat-model-description">{item.description || "A model available with your Codex account."}</span>
                <span className="chat-model-specs"><span>Context <b>{item.contextWindow ? `${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(item.contextWindow)} tokens` : "Not reported"}</b></span></span>
              </button>
            ))}
            {!props.models.length && <p className="chat-model-empty">No available models.</p>}
          </div>
          <footer>Context includes messages, instructions, and tool results.</footer>
        </div>
      )}
      <div className="chat-reasoning-anchor" ref={reasoningAnchor}>
      <button ref={reasoningTrigger} type="button" className={`chat-model-trigger chat-reasoning-control${effort?.reasoningEffort === "ultra" ? " is-ultra" : ""}`}
        disabled={props.disabled || !choices.length} aria-haspopup="dialog" aria-expanded={reasoningOpen} aria-controls={`${popupId}-reasoning`}
        onClick={() => { setOpen(false); setSliderPosition(null); setReasoningOpen(true); }}>
        {effort?.reasoningEffort === "ultra" && <Sparkles size={13} />}
        <span>{effort ? effortName(effort.reasoningEffort) : "Default"}</span><ChevronDown size={13} />
      </button>
      {reasoningOpen && !props.disabled && <div id={`${popupId}-reasoning`} role="dialog" aria-label="Reasoning amount" className={`chat-reasoning-popup chat-reasoning-control${effort?.reasoningEffort === "ultra" ? " is-ultra" : ""}`}>
        <label htmlFor={`${popupId}-effort`}><span>{effort?.reasoningEffort === "ultra" && <Sparkles size={11} />} Reasoning</span><strong>{preview ? effortName(preview.reasoningEffort) : "Default"}</strong></label>
        <div ref={range} id={`${popupId}-effort`} role="slider" tabIndex={0}
          className={`chat-reasoning-slider${sliderPosition !== null ? " is-dragging" : ""}`}
          aria-label="Reasoning amount" aria-valuemin={0} aria-valuemax={Math.max(0, choices.length - 1)} aria-valuenow={position}
          aria-disabled={choices.length < 2}
          aria-valuetext={preview ? effortName(preview.reasoningEffort) : "Model default"}
          onPointerDown={(event) => {
            if (choices.length < 2) return;
            event.preventDefault();
            event.currentTarget.focus();
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setSliderPosition(pointerPosition(event.clientX, event.currentTarget));
          }}
          onPointerMove={(event) => {
            if (dragging.current) setSliderPosition(pointerPosition(event.clientX, event.currentTarget));
          }}
          onPointerUp={(event) => {
            if (!dragging.current) return;
            dragging.current = false;
            commitPosition(pointerPosition(event.clientX, event.currentTarget));
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { dragging.current = false; setSliderPosition(null); }}
          onLostPointerCapture={() => { if (dragging.current) { dragging.current = false; setSliderPosition(null); } }}
          onKeyDown={(event) => {
            const movement = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
            if (movement !== undefined || event.key === "Home" || event.key === "End") {
              event.preventDefault();
              commitPosition(event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : effortIndex + (movement ?? 0));
            }
          }}>
          <span className="chat-reasoning-rail" aria-hidden="true">
            <span className="chat-reasoning-fill" style={{ width: `${choices.length > 1 ? position / (choices.length - 1) * 100 : 0}%` }} />
            {choices.map((choice, index) => <span key={choice.reasoningEffort} className="chat-reasoning-dot"
              style={{ left: `${choices.length > 1 ? index / (choices.length - 1) * 100 : 0}%` }} />)}
            <span className="chat-reasoning-thumb" style={{ left: `${choices.length > 1 ? position / (choices.length - 1) * 100 : 0}%` }} />
          </span>
        </div>
        <span className="chat-reasoning-limits"><small>{choices[0] ? effortName(choices[0].reasoningEffort) : "Default"}</small><small>{choices.length > 1 ? effortName(choices[choices.length - 1].reasoningEffort) : ""}</small></span>
      </div>}
      </div>
    </div>
  );
}
