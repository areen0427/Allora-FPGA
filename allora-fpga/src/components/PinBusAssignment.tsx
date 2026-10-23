import { useId, useLayoutEffect, useRef, useState } from "react";
import type { BoardDefinition } from "../data/boards";
import type { HdlPort } from "../pages/dashboard/pinMappingUtils";
import { getBulkPinGroups, getPinBuses, previewBulkPinAssignment, type PinAssignments } from "../lib/pinAssignment";
import "./PinBusAssignment.css";

export default function PinBusAssignment({ board, ports, mappings, selectedPortName, disabled, onApply }: {
  board: BoardDefinition;
  ports: HdlPort[];
  mappings: PinAssignments;
  selectedPortName: string | null;
  disabled: boolean;
  onApply: (mappings: PinAssignments) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busName, setBusName] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [start, setStart] = useState(0);
  const [reverse, setReverse] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLElement>(null);
  const id = useId();
  const buses = getPinBuses(ports);
  const bus = buses.find((item) => item.name === busName)
    ?? buses.find((item) => item.ports.some((port) => port.name === selectedPortName))
    ?? buses[0];
  const groups = bus ? getBulkPinGroups(board, bus.direction) : [];
  const group = groups.find((item) => item.title === groupTitle) ?? groups[0];
  const preview = previewBulkPinAssignment(board, ports, mappings, {
    busName: bus?.name ?? "", groupTitle: group?.title ?? "", start, reverse,
  });

  useLayoutEffect(() => {
    if (!open || !popup.current) return;
    const element = popup.current;
    if (!element.isConnected) return;
    if (!element.matches(":popover-open")) element.showPopover();
    function place() {
      if (!element.isConnected || !trigger.current?.isConnected) return;
      const anchor = trigger.current.getBoundingClientRect();
      const width = Math.min(520, window.innerWidth - 24);
      element.style.width = `${width}px`;
      element.style.maxHeight = `${window.innerHeight - 24}px`;
      element.style.left = `${Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12))}px`;
      element.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - element.offsetHeight - 12))}px`;
    }
    place();
    element.classList.add("glass-unfold");
    element.focus();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    function outside(event: PointerEvent) {
      if (!element.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      if (element.isConnected && element.matches(":popover-open")) element.hidePopover();
    };
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return <>
    <button ref={trigger} type="button" className="ui-button ui-button-secondary"
      disabled={disabled || !buses.length} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      title={buses.length ? "Preview assignments for a whole HDL bus" : "No literal HDL bus ranges detected"}
      onClick={() => setOpen((value) => !value)}>Assign Bus</button>
    {open && <section ref={popup} id={id} popover="manual" tabIndex={-1} role="dialog"
      aria-labelledby={`${id}-title`} className="welcome-product-info pin-bus-popup">
      <h3 id={`${id}-title`}>Assign bus</h3>
      <p>Review every bit before applying. Only this bus changes; Save Mapping writes the draft to disk.</p>
      <div className="pin-bus-choices">
        <label>HDL bus
          <select aria-label="HDL bus" value={bus?.name ?? ""} onChange={(event) => { setBusName(event.target.value); setGroupTitle(""); setStart(0); }}>
            {buses.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.direction} · {item.ports.length} bit{item.ports.length === 1 ? "" : "s"}</option>)}
          </select>
        </label>
        <label>Board resource group
          <select aria-label="Board resource group" value={group?.title ?? ""} onChange={(event) => { setGroupTitle(event.target.value); setStart(0); }}>
            {!groups.length && <option value="">No compatible verified resources</option>}
            {groups.map((item) => <option key={item.title} value={item.title}>{item.title} · {item.pins.length} pad{item.pins.length === 1 ? "" : "s"}</option>)}
          </select>
        </label>
        <label>Start at resource
          <select aria-label="Start at resource" value={start} disabled={!group} onChange={(event) => setStart(Number(event.target.value))}>
            {(group?.pins ?? []).map((pin, index) => <option key={pin.key} value={index}>{pin.shortLabel}</option>)}
            {!group && <option value={0}>No resources</option>}
          </select>
        </label>
        <label className="pin-bus-reverse"><input type="checkbox" checked={reverse} onChange={(event) => setReverse(event.target.checked)} />Reverse resource order</label>
      </div>
      <p className="pin-bus-note">Bits follow HDL declaration order. Pads follow the listed board resource order, without skipping occupied pads. GPIO supports any direction; LEDs are outputs and buttons/clocks are inputs. Other peripheral directions are not inferred.</p>
      <div className="pin-bus-preview" role="region" aria-label="Bus assignment preview" tabIndex={0}>
        <table><thead><tr><th scope="col">HDL port</th><th scope="col">Current</th><th scope="col">Proposed</th></tr></thead>
          <tbody>{preview.rows.map((row) => <tr key={row.portName} className={row.conflicts.length ? "has-conflict" : undefined}>
            <th scope="row">{row.portName}</th><td>{row.previousLabel}</td><td>{row.nextLabel}{row.conflicts.length > 0 && <small>Used by {row.conflicts.join(", ")}</small>}</td>
          </tr>)}</tbody></table>
      </div>
      {preview.errors.length > 0 ? <ul className="pin-bus-errors" role="alert">{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul>
        : <p role="status">{preview.changedCount ? `${preview.changedCount} assignment${preview.changedCount === 1 ? "" : "s"} will change. Undo reverses the whole batch.` : "This bus already has these assignments."}</p>}
      <div className="pin-bus-actions ui-compact-button-group">
        <button type="button" className="ui-button ui-button-secondary" onClick={close}>Done</button>
        <button type="button" className="ui-button ui-action-button" disabled={disabled || !preview.canApply}
          onClick={() => { if (preview.canApply) { onApply(preview.nextMappings); close(); } }}>Apply to Draft</button>
      </div>
    </section>}
  </>;
}
