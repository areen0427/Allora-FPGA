import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, Download, Plus, Save, Search, Trash2 } from "lucide-react";
import type { BoardDefinition } from "../../data/boards";
import type { PinBrowserResourceGroup } from "../../data/pinResourceGroups";
import { getPinOptions } from "../dashboard/pinMappingUtils";
import type { HdlPort } from "../dashboard/pinMappingUtils";
import { getPinMappingElectricalIssues } from "../dashboard/pinMappingUtils";
import { createWelcomeConstraintDownload } from "./welcomePinConstraints";

type OutputDeclaration = { name: string; width: number };
type PinOption = ReturnType<typeof getPinOptions>[number];
type PadGroup = {
  pin: string;
  aliases: PinBrowserResourceGroup["pins"];
};

export function WelcomeOutputMapper({
  board,
  resourceGroups,
  hidden = false,
}: {
  board: BoardDefinition;
  resourceGroups: PinBrowserResourceGroup[];
  hidden?: boolean;
}) {
  const [declarations, setDeclarations] = useState<OutputDeclaration[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [selectedPort, setSelectedPort] = useState("");
  const [portName, setPortName] = useState("");
  const [portWidth, setPortWidth] = useState(1);
  const [pinSearch, setPinSearch] = useState("");
  const [portError, setPortError] = useState("");
  const [download, setDownload] = useState<ReturnType<
    typeof createWelcomeConstraintDownload
  > | null>(null);

  const ports = useMemo(
    () => declarations.flatMap(expandOutputDeclaration),
    [declarations],
  );
  const pinOptions = useMemo(() => getPinOptions(board), [board]);
  const optionsByKey = useMemo(
    () => new Map(pinOptions.map((option) => [option.key, option])),
    [pinOptions],
  );
  const padGroups = useMemo(
    () => groupAssignablePads(resourceGroups, optionsByKey),
    [resourceGroups, optionsByKey],
  );
  const mappedCount = ports.filter((port) => mappings[port.name]).length;
  const complete = ports.length > 0 && mappedCount === ports.length;
  const assignedPads = new Set(
    Object.entries(mappings)
      .filter(([portName]) => portName !== selectedPort)
      .map(([, key]) => optionsByKey.get(key)?.pin)
      .filter((pin): pin is string => Boolean(pin)),
  );
  const electricalIssues = getPinMappingElectricalIssues(
    board,
    ports,
    mappings,
  );
  const exportFormat =
    board.constraintsFile === "peri"
      ? "Efinity Interface Script (.isf)"
      : `.${board.constraintsFile.toUpperCase()}`;
  const normalizedPinSearch = pinSearch.trim().toLowerCase();
  const visiblePads = normalizedPinSearch
    ? padGroups.filter(
        (group) =>
          group.pin.toLowerCase().includes(normalizedPinSearch) ||
          group.aliases.some((alias) =>
            `${alias.name} ${alias.type} ${alias.detail ?? ""}`
              .toLowerCase()
              .includes(normalizedPinSearch),
          ),
      )
    : padGroups;

  function addOutput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = portName.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      setPortError("Use a Verilog or VHDL identifier, such as data_out.");
      return;
    }
    if (
      declarations.some(
        (declaration) => declaration.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setPortError("That output port already exists.");
      return;
    }

    const width = Math.max(1, Math.min(64, Math.floor(portWidth) || 1));
    const declaration = { name, width };
    const newPorts = expandOutputDeclaration(declaration);
    setDeclarations((current) => [...current, declaration]);
    setMappings((current) => ({ ...current, ...Object.fromEntries(newPorts.map((port) => [port.name, ""])) }));
    setSelectedPort(newPorts[0]?.name ?? "");
    setPortName("");
    setPortWidth(1);
    setPortError("");
    setDownload(null);
  }

  function removeOutput(port: HdlPort) {
    const declarationName = port.baseName ?? port.name;
    const removedNames = new Set(
      ports
        .filter((item) => (item.baseName ?? item.name) === declarationName)
        .map((item) => item.name),
    );
    const remainingPorts = ports.filter((item) => !removedNames.has(item.name));
    setDeclarations((current) =>
      current.filter((item) => item.name !== declarationName),
    );
    setMappings((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([name]) => !removedNames.has(name)),
      ),
    );
    if (removedNames.has(selectedPort)) {
      setSelectedPort(remainingPorts[0]?.name ?? "");
    }
    setDownload(null);
  }

  function assignPad(key: string) {
    if (!selectedPort) return;
    setMappings((current) => ({ ...current, [selectedPort]: key }));
    setDownload(null);
  }

  function clearAssignment(portName: string) {
    setMappings((current) => ({ ...current, [portName]: "" }));
    setDownload(null);
  }

  function saveMapping() {
    if (!complete) return;
    setDownload(createWelcomeConstraintDownload(board, ports, mappings));
  }

  function downloadConstraints() {
    if (!download) return;
    const blob = new Blob([download.content], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = download.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const firstPortByDeclaration = new Set<string>();

  return (
    <div className="pin-output-workspace" hidden={hidden}>
      <div className="pin-output-toolbar">
        <form className="pin-output-create-form" onSubmit={addOutput}>
          <label className="pin-output-form-field">
            <span>Output port</span>
            <input
              value={portName}
              onChange={(event) => setPortName(event.target.value)}
              placeholder="e.g. status_led"
              aria-label="Output port name"
              autoComplete="off"
            />
          </label>
          <label className="pin-output-form-field pin-output-width-field">
            <span>Width</span>
            <input
              value={portWidth}
              onChange={(event) =>
                setPortWidth(Number(event.target.value) || 1)
              }
              min={1}
              max={64}
              type="number"
              aria-label="Output port width in bits"
            />
          </label>
          <button
            className="pin-output-primary-button ui-button ui-button-primary ui-action-button"
            type="submit"
          >
            <Plus size={15} /> Add output
          </button>
        </form>

        <div className="pin-output-actions">
          <div className="pin-output-counts" aria-live="polite">
            <span>{ports.length} output{ports.length === 1 ? "" : "s"}</span>
            <span>{mappedCount} mapped</span>
          </div>
          <button
            className="pin-output-primary-button ui-button ui-button-primary ui-action-button"
            type="button"
            disabled={!complete}
            onClick={saveMapping}
          >
            <Save size={15} /> Save mapping
          </button>
        </div>
      </div>

      {portError ? (
        <div className="pin-output-inline-message error" role="alert">
          {portError}
        </div>
      ) : null}

      <div className="pin-output-workspace-grid">
        <section className="pin-output-assignment-panel ui-workspace-framed" aria-label="Output assignments">
          <div className="pin-output-panel-heading">
            <div>
              <h3>Output assignments</h3>
              <p>
                Select an output and choose an available pad. Save reveals the {exportFormat} download.
              </p>
            </div>
          </div>

          <div className="pin-output-table-scroll">
            {ports.length ? (
              <table className="pin-output-table">
                <thead>
                  <tr>
                    <th scope="col">Port</th>
                    <th scope="col">Direction</th>
                    <th scope="col">Assignment</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {ports.map((port, index) => {
                    const selected = selectedPort === port.name;
                    const option = optionsByKey.get(mappings[port.name] ?? "");
                    const declarationName = port.baseName ?? port.name;
                    const showRemove = !firstPortByDeclaration.has(declarationName);
                    firstPortByDeclaration.add(declarationName);

                    return (
                      <tr
                        key={port.name}
                        className={`ui-selectable-row${selected ? " selected" : ""}`}
                        aria-selected={selected}
                        tabIndex={selected || (!selectedPort && ports[0]?.name === port.name) ? 0 : -1}
                        onClick={() => setSelectedPort(port.name)}
                        onFocus={(event) => {
                          if (event.target === event.currentTarget) setSelectedPort(port.name);
                        }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          const nextIndex = event.key === "ArrowDown"
                            ? Math.min(index + 1, ports.length - 1)
                            : event.key === "ArrowUp"
                              ? Math.max(index - 1, 0)
                              : event.key === "Home"
                                ? 0
                                : event.key === "End"
                                  ? ports.length - 1
                                  : null;
                          if (nextIndex !== null) {
                            event.preventDefault();
                            const row = event.currentTarget.parentElement?.children[nextIndex];
                            if (row instanceof HTMLElement) {
                              row.focus({ preventScroll: true });
                              row.scrollIntoView({ block: "nearest" });
                            }
                            return;
                          }
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedPort(port.name);
                          }
                        }}
                      >
                        <td>
                          <span className="pin-output-port-name">{port.name}</span>
                        </td>
                        <td><span className="pin-output-direction">Output</span></td>
                        <td>
                          {option ? (
                            <span className="pin-output-assigned-pin">
                              <strong>{option.pin}</strong>
                              <span>{option.shortLabel}</span>
                            </span>
                          ) : (
                            <span className="pin-output-unassigned">Choose a pad</span>
                          )}
                        </td>
                        <td>
                          <span className={option ? "pin-output-status mapped" : "pin-output-status unmapped"}>
                            {option ? "Mapped" : "Unmapped"}
                          </span>
                        </td>
                        <td>
                          <div
                            className="pin-output-row-actions ui-compact-button-group"
                            role="group"
                            aria-label={`Actions for ${port.name}`}
                          >
                            {option ? (
                              <button
                                className="pin-output-text-action ui-hover-button pin-output-danger-action"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  clearAssignment(port.name);
                                }}
                                aria-label={`Clear assignment for ${port.name}`}
                              >
                                Clear
                              </button>
                            ) : null}
                            {showRemove ? (
                              <button
                                className="pin-output-icon-action ui-icon-button ui-icon-button-hover pin-output-danger-action"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeOutput(port);
                                }}
                                aria-label={`Remove output ${declarationName}`}
                                title={`Remove ${declarationName}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="pin-output-empty-state">
                Add an output port to start mapping package pads.
              </div>
            )}
          </div>

          {electricalIssues.length ? (
            <div className="pin-output-inline-message warning">
              <AlertTriangle size={15} />
              <span>
                {electricalIssues.length} assignment{electricalIssues.length === 1 ? "" : "s"} lack a documented I/O standard. The file will leave that standard unspecified.
              </span>
            </div>
          ) : null}

          {download ? (
            <div className="pin-output-download-card" role="status">
              <div>
                <strong>Mapping saved</strong>
                <span>{download.filename} · {download.formatLabel}</span>
                {download.note ? <small>{download.note}</small> : null}
              </div>
              <button
                className="pin-output-primary-button ui-button ui-button-primary ui-action-button"
                type="button"
                onClick={downloadConstraints}
              >
                <Download size={15} /> Download constraints
              </button>
            </div>
          ) : null}
        </section>

        <aside className="pin-output-pad-panel ui-workspace-framed" aria-label="Available package pads">
          <div className="pin-output-panel-heading">
            <div>
              <h3>Available package pads</h3>
              <p>{selectedPort ? `Assign a pad to ${selectedPort}.` : "Select an output port first."}</p>
            </div>
            <span className="pin-output-pad-count">{padGroups.length}</span>
          </div>
          <label className="pin-output-search">
            <Search size={15} />
            <input
              value={pinSearch}
              onChange={(event) => setPinSearch(event.target.value)}
              placeholder="Search aliases or pads"
              type="search"
              aria-label="Search package pads"
            />
          </label>
          <div className="pin-output-pad-list">
            {visiblePads.map((group) => {
              const isUsed = assignedPads.has(group.pin);
              return (
                <div className="pin-output-pad-group" key={group.pin}>
                  <div className="pin-output-pad-title">
                    <strong>{group.pin}</strong>
                    <span>{group.aliases.length} alias{group.aliases.length === 1 ? "" : "es"}</span>
                  </div>
                  <div className="pin-output-pad-aliases ui-compact-button-group ui-selection-group">
                    {group.aliases.map((alias) => {
                      const option = optionsByKey.get(alias.key);
                      if (!option) return null;
                      const active = mappings[selectedPort] === alias.key;
                      const clickable = Boolean(selectedPort) && (!isUsed || active);
                      const Entry = clickable ? "button" : "div";
                      return (
                        <Entry
                          key={alias.key}
                          className={`pin-output-pad-alias${clickable ? "" : " unavailable"}`}
                          type={clickable ? "button" : undefined}
                          aria-pressed={clickable ? active : undefined}
                          onClick={clickable ? () => assignPad(alias.key) : undefined}
                          title={`${alias.name} · ${alias.detail ?? alias.type}`}
                        >
                          <span>{alias.name}</span>
                          {alias.detail ? <small>{alias.detail}</small> : null}
                          <span className="ui-control-divider-below" aria-hidden="true" />
                        </Entry>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {visiblePads.length === 0 ? (
              <div className="pin-output-empty-state">No available pads match that search.</div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function expandOutputDeclaration(declaration: OutputDeclaration): HdlPort[] {
  if (declaration.width <= 1) {
    return [{ name: declaration.name, direction: "output" }];
  }
  return Array.from({ length: declaration.width }, (_, offset) => {
    const index = declaration.width - offset - 1;
    return {
      name: `${declaration.name}[${index}]`,
      baseName: declaration.name,
      index,
      direction: "output" as const,
    };
  });
}

function groupAssignablePads(
  resourceGroups: PinBrowserResourceGroup[],
  optionsByKey: Map<string, PinOption>,
): PadGroup[] {
  const pads = new Map<string, PadGroup>();
  for (const group of resourceGroups) {
    for (const alias of group.pins) {
      if (!alias.assignable || !optionsByKey.has(alias.key)) continue;
      const pad = pads.get(alias.pin) ?? { pin: alias.pin, aliases: [] };
      if (!pad.aliases.some((item) => item.key === alias.key)) {
        pad.aliases.push(alias);
      }
      pads.set(alias.pin, pad);
    }
  }
  return [...pads.values()].sort((a, b) => a.pin.localeCompare(b.pin, undefined, { numeric: true }));
}
