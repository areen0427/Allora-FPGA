import { useId, useLayoutEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { hasTauriInvoke } from "../../lib/tauri";
import {
  MAX_IMPORT_FILE_BYTES,
  mergeOutputDeclarations,
  parseImportSources,
  type OutputDeclaration,
} from "../../lib/portImport";
import {
  importVivadoProject,
  type DesignImport,
} from "../../lib/vivadoProject";

export function PinOutputImport({
  declarations,
  onImport,
}: {
  declarations: OutputDeclaration[];
  onImport: (outputs: OutputDeclaration[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [design, setDesign] = useState<DesignImport | null>(null);
  const [selection, setSelection] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLElement>(null);
  const request = useRef({ sequence: 0 });
  const id = useId();
  useLayoutEffect(() => {
    if (!expanded || !popup.current) return;
    const element = popup.current;
    const requests = request.current;
    element.showPopover();
    function place() {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(400, window.innerWidth - 24);
      element.style.width = `${width}px`;
      element.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
      element.style.maxHeight = `${window.innerHeight - 24}px`;
      element.style.top = `${Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - element.offsetHeight - 12))}px`;
    }
    place();
    element.classList.add("glass-unfold");
    element.focus();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    function outside(event: PointerEvent) {
      if (
        !element.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setExpanded(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      requests.sequence++;
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      if (element.matches(":popover-open")) element.hidePopover();
    };
  }, [expanded]);
  async function loadDesign(read: () => Promise<DesignImport | null>) {
    const sequence = ++request.current.sequence;
    setLoading(true);
    setError("");
    setDesign(null);
    setSelection("");
    try {
      const result = await read();
      if (sequence !== request.current.sequence || !result) return;
      setDesign(result);
      const matches = result.units
        .map((unit, index) => ({ unit, index }))
        .filter(({ unit }) => unit.name === result.topModule);
      setSelection(
        matches.length === 1
          ? String(matches[0].index)
          : !result.topModule && result.units.length === 1
            ? "0"
            : "",
      );
    } catch (failure) {
      if (sequence === request.current.sequence)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (sequence === request.current.sequence) setLoading(false);
    }
  }
  const unit = selection !== "" ? design?.units[Number(selection)] : undefined;
  const merged = mergeOutputDeclarations(declarations, unit?.outputs ?? []);
  function close() {
    setExpanded(false);
    trigger.current?.focus();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ui-button ui-button-secondary"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={id}
        title="Import Top Level Design File or Vivado Project"
        onClick={() => {
          setLoading(false);
          setExpanded((value) => !value);
        }}
      >
        <Upload size={15} /> Import design
      </button>
      {expanded && (
        <section
          ref={popup}
          id={id}
          popover="manual"
          tabIndex={-1}
          role="dialog"
          aria-labelledby={`${id}-title`}
          className="welcome-product-info pin-output-import-popup"
        >
          <h3 id={`${id}-title`}>Import output ports</h3>
          <p>
            Choose a top-level HDL file or a Vivado project, then review its
            outputs.
          </p>
          <div className="ui-compact-button-group pin-output-import-actions">
            <label className="ui-button ui-button-secondary">
              HDL file
              <input
                type="file"
                accept=".v,.sv,.vhd,.vhdl"
                aria-label="Import top-level HDL file"
                disabled={loading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void loadDesign(async () => {
                    if (!/\.(v|sv|vhd|vhdl)$/i.test(file.name))
                      throw new Error(
                        "Choose a Verilog, SystemVerilog or VHDL file.",
                      );
                    if (file.size > MAX_IMPORT_FILE_BYTES)
                      throw new Error(
                        "HDL files must be no larger than 2 MiB.",
                      );
                    return {
                      units: parseImportSources([
                        { name: file.name, content: await file.text() },
                      ]),
                      warnings: [],
                    };
                  });
                }}
              />
            </label>
            <button
              type="button"
              className="ui-button ui-button-secondary"
              disabled={loading || !hasTauriInvoke()}
              onClick={() =>
                void loadDesign(async () => {
                  const path = await open({
                    multiple: false,
                    directory: false,
                    filters: [{ name: "Vivado project", extensions: ["xpr"] }],
                  });
                  return typeof path === "string"
                    ? importVivadoProject(path)
                    : null;
                })
              }
            >
              Vivado project
            </button>
          </div>
          {!hasTauriInvoke() && (
            <small>
              Vivado project import is available in the desktop app.
            </small>
          )}
          {loading && <p role="status">Reading design…</p>}
          {error && (
            <p className="pin-output-import-error" role="alert">
              {error}
            </p>
          )}
          {design && (
            <>
              {design.topModule &&
                !design.units.some(
                  (item) => item.name === design.topModule,
                ) && (
                  <p role="status">
                    Project top “{design.topModule}” was not found. Choose an
                    available top or import its generated wrapper.
                  </p>
                )}
              <label className="pin-output-form-field">
                Top-level module or entity
                <select className="ui-dropdown"
                  value={selection}
                  onChange={(event) => setSelection(event.target.value)}
                >
                  <option value="">Choose a top level</option>
                  {design.units.map((item, index) => (
                    <option value={index} key={`${item.file}:${index}`}>
                      {item.name} — {item.file.split(/[\\/]/).pop()}
                    </option>
                  ))}
                </select>
              </label>
              {unit?.error ? (
                <p className="pin-output-import-error" role="alert">
                  {unit.error}
                </p>
              ) : (
                unit && (
                  <>
                    <ul
                      className="pin-output-import-list"
                      aria-label="Imported output preview"
                    >
                      {unit.outputs.map((output) => (
                        <li key={output.name}>
                          <strong>{output.name}</strong>
                          <span>
                            {output.width} bit{output.width === 1 ? "" : "s"}
                            {output.indices
                              ? ` [${output.indices[0]}:${output.indices.at(-1)}]`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {!unit.outputs.length && (
                      <p>No output ports found in this top level.</p>
                    )}
                    {!!merged.skipped && (
                      <p>
                        {merged.skipped} existing output
                        {merged.skipped === 1 ? "" : "s"} will be skipped.
                        Existing widths and assignments are preserved.
                      </p>
                    )}
                  </>
                )
              )}
              {design.warnings.map((warning) => (
                <small key={warning}>{warning}</small>
              ))}
            </>
          )}
          <div className="ui-compact-button-group pin-output-import-actions">
            <button
              type="button"
              className="ui-button ui-button-primary ui-action-button"
              disabled={
                !unit || !!unit.error || !merged.added.length || loading
              }
              onClick={() => {
                onImport(merged.added);
                close();
              }}
            >
              Add {merged.added.length} output
              {merged.added.length === 1 ? "" : "s"}
            </button>
            <button
              type="button"
              className="ui-button ui-button-secondary"
              onClick={close}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </>
  );
}
