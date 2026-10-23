import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProjectFile } from "../pages/dashboard/types";
import {
  createTestbenchScaffold,
  defaultTestbenchConfiguration,
  formatTestbenchTime,
  getTestbenchInputSignals,
  inspectTestbenchSource,
  validateTestbenchConfiguration,
  type TestbenchConfiguration,
} from "../lib/testbenchScaffold";
import "./TestbenchCreationPopup.css";

type Props = {
  source: ProjectFile | null;
  files: ProjectFile[];
  boardName: string;
  onCreate: (fileName: string, content: string) => void;
};

export default function TestbenchCreationPopup({ source, files, boardName, onCreate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [moduleName, setModuleName] = useState("");
  const [configuration, setConfiguration] = useState<TestbenchConfiguration>(() => defaultTestbenchConfiguration());
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLElement>(null);
  const id = useId();
  const inspection = useMemo(() => inspectTestbenchSource(source), [source]);
  const design = inspection.designs.find(item => item.moduleName === moduleName);
  const inputs = design ? getTestbenchInputSignals(design) : [];
  const validation = validateTestbenchConfiguration(design, configuration);
  const errors = inspection.error ? [inspection.error] : Object.values(validation.errors);
  const artifact = design && validation.timing && !inspection.error
    ? createTestbenchScaffold(design, configuration, files, boardName)
    : undefined;

  function update(field: keyof TestbenchConfiguration, value: string) {
    setConfiguration(current => ({ ...current, [field]: value }));
  }

  function close() {
    setExpanded(false);
    trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (!expanded || !popup.current || !trigger.current) return;
    const element = popup.current;
    const anchor = trigger.current;
    element.showPopover();
    function place() {
      const rect = anchor.getBoundingClientRect();
      const edge = 12;
      const width = Math.min(440, Math.max(0, window.innerWidth - edge * 2));
      element.style.width = `${width}px`;
      element.style.left = `${Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge))}px`;
      const below = window.innerHeight - rect.bottom - 8 - edge;
      const above = rect.top - 8 - edge;
      const opensAbove = below < Math.min(element.scrollHeight, 340) && above > below;
      element.dataset.placement = opensAbove ? "above" : "below";
      element.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`;
      element.style.top = `${opensAbove ? Math.max(edge, rect.top - element.offsetHeight - 8) : rect.bottom + 8}px`;
    }
    place();
    element.classList.add("glass-unfold");
    const firstField = element.querySelector<HTMLElement>("select, input, button");
    (firstField ?? element).focus({ preventScroll: true });
    const observer = new ResizeObserver(place);
    observer.observe(element);
    function repositionAfterScroll(event: Event) {
      // Scrolling the panel or its code preview does not move the trigger.
      // Keep its viewport position stable while reaching the action buttons.
      if (event.target instanceof Node && element.contains(event.target)) return;
      place();
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", repositionAfterScroll, true);

    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (element.contains(target) || anchor.contains(target)) return;
      setExpanded(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape") return;
      event.preventDefault();
      setExpanded(false);
      anchor.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", repositionAfterScroll, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      if (element.matches(":popover-open")) element.hidePopover();
      if (element.contains(document.activeElement)) anchor.focus({ preventScroll: true });
    };
  }, [expanded]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="synthesis-secondary-button"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        onClick={() => {
          if (expanded) { close(); return; }
          const initialDesign = inspection.designs.length === 1 ? inspection.designs[0] : undefined;
          setModuleName(initialDesign?.moduleName ?? "");
          setConfiguration(defaultTestbenchConfiguration(initialDesign));
          setExpanded(true);
        }}
      >
        New Testbench
      </button>
      {expanded && (
        <section
          ref={popup}
          popover="manual"
          id={id}
          tabIndex={-1}
          role="dialog"
          aria-labelledby={`${id}-title`}
          className="welcome-product-info testbench-creation-popup"
        >
          <form noValidate onSubmit={event => {
            event.preventDefault();
            if (!artifact) return;
            onCreate(artifact.fileName, artifact.content);
            close();
          }}>
            <div className="testbench-creation-body">
            <header>
              <h2 id={`${id}-title`}>New Testbench</h2>
              <p>{source?.name ?? "No design selected"}{design ? ` · ${design.moduleName}` : ""}</p>
            </header>

            {inspection.designs.length > 1 && (
              <label>
                <span>Design module</span>
                <select value={moduleName} onChange={event => {
                  const selected = inspection.designs.find(item => item.moduleName === event.target.value);
                  setModuleName(event.target.value);
                  setConfiguration(defaultTestbenchConfiguration(selected));
                }}>
                  <option value="">Choose a module</option>
                  {inspection.designs.map(item => <option key={item.moduleName} value={item.moduleName}>{item.moduleName}</option>)}
                </select>
              </label>
            )}

            {design && !design.error && (
              <div className="testbench-creation-fields">
                <label>
                  <span>Clock signal</span>
                  <select value={configuration.clockSignal} onChange={event => update("clockSignal", event.target.value)}>
                    <option value="">No clock</option>
                    {inputs.map(signal => <option key={signal.name} value={signal.name}>{signal.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Frequency (MHz)</span>
                  <input type="number" inputMode="decimal" min="0.001" max="250000" step="any"
                    value={configuration.frequencyMHz} disabled={!configuration.clockSignal}
                    aria-invalid={Boolean(validation.errors.frequencyMHz)}
                    onChange={event => update("frequencyMHz", event.target.value)} />
                </label>
                <label>
                  <span>Reset signal</span>
                  <select value={configuration.resetSignal} aria-invalid={Boolean(validation.errors.resetSignal)} onChange={event => {
                    const resetSignal = event.target.value;
                    setConfiguration(current => ({ ...current, resetSignal, resetPolarity: /_n$/i.test(resetSignal) ? "low" : "high" }));
                  }}>
                    <option value="">No reset</option>
                    {inputs.map(signal => <option key={signal.name} value={signal.name}>{signal.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Active level</span>
                  <select value={configuration.resetPolarity} disabled={!configuration.resetSignal}
                    onChange={event => update("resetPolarity", event.target.value)}>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label>
                  <span>Reset duration (ns)</span>
                  <input type="number" inputMode="decimal" min="0.001" max="1000000000" step="0.001"
                    value={configuration.resetDurationNs} disabled={!configuration.resetSignal}
                    aria-invalid={Boolean(validation.errors.resetDurationNs)}
                    onChange={event => update("resetDurationNs", event.target.value)} />
                </label>
                <label>
                  <span>Simulation length (ns)</span>
                  <input type="number" inputMode="decimal" min="0.001" max="1000000000" step="0.001"
                    value={configuration.simulationDurationNs} aria-invalid={Boolean(validation.errors.simulationDurationNs)}
                    onChange={event => update("simulationDurationNs", event.target.value)} />
                </label>
              </div>
            )}

            {validation.timing?.halfPeriodPs && (
              <p className="testbench-creation-note">
                Clock period: {formatTestbenchTime(validation.timing.halfPeriodPs * 2)} ns
                {` (${Number((500_000 / validation.timing.halfPeriodPs).toPrecision(8))} MHz)`}.
                {validation.timing.resetReleasePs && ` Reset releases at ${formatTestbenchTime(validation.timing.resetReleasePs)} ns, just after a falling edge.`}
              </p>
            )}
            {errors.length > 0 && <p className="testbench-creation-error" role="status">{errors.join(" ")}</p>}
            {artifact && (
              <details className="testbench-creation-preview" open>
                <summary>Scaffold preview · {artifact.fileName}</summary>
                <pre tabIndex={0} aria-label="Testbench scaffold preview">{artifact.content}</pre>
              </details>
            )}
            <p className="testbench-creation-note">Creates a SystemVerilog scaffold. Add stimulus and checks before using it to verify your design.</p>
            </div>
            <div className="testbench-creation-actions ui-compact-button-group">
              <button type="button" className="ui-button ui-button-secondary" onClick={close}>Cancel</button>
              <button type="submit" className="ui-button ui-button-primary ui-action-button" disabled={!artifact}>Create</button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
