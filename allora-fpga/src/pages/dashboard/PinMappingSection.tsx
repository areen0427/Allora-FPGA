import { useMemo, useState } from "react";
import type { BoardDefinition, BoardPin } from "../../data/boards";
import { getPinTypeColor } from "../../data/pinResourceGroups";
import DashboardSurfaceCard from "./DashboardSurfaceCard";
import InfoCard from "./InfoCard";
import VirtualBoard from "../../components/VirtualBoard";
import type { ProjectFile } from "./types";
import {
  createSuggestedMappings,
  createPinMappingConstraints,
  findPorts,
  getPinOptions,
  readPinMappingsFromConstraints,
  type HdlPort,
} from "./pinMappingUtils";

type PinMappingMode = "simple" | "advanced";

type PinMappingSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  defaultMode: "simple" | "advanced";
  topLevelFileName: string | null;
  onSaveMappings: (fileName: string, content: string) => Promise<boolean>;
};

export default function PinMappingSection({
  board,
  files,
  defaultMode,
  topLevelFileName,
  onSaveMappings,
}: PinMappingSectionProps) {
  const [mode, setMode] = useState<PinMappingMode>(defaultMode);
  const [selectedPortName, setSelectedPortName] = useState<string | null>(null);
  const ports = useMemo(
    () =>
      findPorts(
        topLevelFileName
          ? files.filter((file) => file.name === topLevelFileName)
          : [],
      ),
    [files, topLevelFileName],
  );
  const suggestedMappings = useMemo(
    () => createSuggestedMappings(ports, board.pins, board.clocks),
    [ports, board.pins, board.clocks],
  );
  const constraintFile = useMemo(
    () =>
      files.find(
        (file) =>
          file.name.toLowerCase() === `constraints.${board.constraintsFile}`,
      ) ??
      files.find((file) =>
        file.name.toLowerCase().endsWith(`.${board.constraintsFile}`),
      ) ??
      null,
    [board.constraintsFile, files],
  );
  const savedMappings = useMemo(
    () =>
      constraintFile
        ? readPinMappingsFromConstraints(board, ports, constraintFile.content)
        : null,
    [board, constraintFile, ports],
  );
  const [overrides, setOverrides] = useState<Record<string, string>>(
    () => savedMappings ?? {},
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const mappedCount = ports.filter(
    (port) => overrides[port.name] ?? suggestedMappings[port.name],
  ).length;

  function getSelectedPin(portName: string) {
    return overrides[portName] ?? suggestedMappings[portName] ?? "";
  }

  function setPortMapping(portName: string, pinKey: string) {
    setSaveState("idle");
    setOverrides((current) => ({
      ...current,
      [portName]: pinKey,
    }));
  }

  const currentMappings = Object.fromEntries(
    ports.map((port) => [port.name, getSelectedPin(port.name)]),
  );
  const savedComparison = savedMappings ?? suggestedMappings;
  const hasUnsavedChanges =
    savedMappings === null
      ? ports.some((port) => Boolean(currentMappings[port.name]))
      : ports.some(
          (port) =>
            (currentMappings[port.name] ?? "") !==
            (savedComparison[port.name] ?? ""),
        );
  const canRevert = ports.some(
    (port) =>
      (currentMappings[port.name] ?? "") !==
      ((savedMappings ?? suggestedMappings)[port.name] ?? ""),
  );

  async function saveMappings() {
    setSaveState("saving");
    const content = createPinMappingConstraints(board, ports, currentMappings);
    const saved = await onSaveMappings(
      constraintFile?.name ?? `constraints.${board.constraintsFile}`,
      content,
    );
    setSaveState(saved ? "saved" : "error");
  }

  return (
    <div
      style={{
        display: "block",
        height: "calc(100vh - 24px)",
        boxSizing: "border-box",
        minHeight: 0,
        overflow: "visible",
      }}
    >
      <InfoCard
        title="Pin Mapping"
        style={{
          height: "100%",
          overflow: "hidden",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "18px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div className="ui-button-group" style={{ display: "inline-flex", gap: "4px" }}>
              {(["simple", "advanced"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className="ui-button ui-button-secondary"
                  aria-pressed={mode === option}
                  onClick={() => setMode(option)}
                  style={{ textTransform: "capitalize" }}
                >
                  {option}
                </button>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <SummaryPill label="Ports" value={String(ports.length)} />
              <SummaryPill
                label="Mapped"
                value={`${mappedCount}/${ports.length}`}
              />
              <SummaryPill label="Pins" value={String(board.pins.length)} />
              <SummaryPill
                label="Constraints"
                value={`.${board.constraintsFile}`}
              />
            </div>
          </div>

          <div className="ui-compact-button-group" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {saveState === "error" ? (
              <span
                style={{ color: "var(--ui-error-text)", fontSize: "12px", fontWeight: 800 }}
              >
                Save failed
              </span>
            ) : saveState === "saved" && !hasUnsavedChanges ? (
              <span
                style={{ color: "var(--ui-success-text)", fontSize: "12px", fontWeight: 800 }}
              >
                Saved
              </span>
            ) : null}
            <button
              type="button"
              className="ui-button ui-button-secondary"
              onClick={() => {
                setOverrides(savedMappings ?? {});
                setSaveState("idle");
              }}
              disabled={!canRevert}

            >
              Revert
            </button>
            <button
              type="button"
              className="ui-button ui-button-primary ui-action-button"
              onClick={() => void saveMappings()}
              disabled={!hasUnsavedChanges || saveState === "saving"}

            >
              {saveState === "saving" ? "Saving…" : "Save Mapping"}
            </button>
          </div>
        </div>

        <p
          style={{
            margin: 0,
            color: "var(--ui-text-muted)",
            fontSize: "14px",
            lineHeight: 1.4,
          }}
        >
          Select a signal, then choose where it lands on the package.
        </p>

        {mode === "simple" ? (
          <SimplePinMapper
            board={board}
            ports={ports}
            suggestedMappings={suggestedMappings}
            getSelectedPin={getSelectedPin}
            setPortMapping={setPortMapping}
          />
        ) : (
          <ResourcePinMapper
            board={board}
            ports={ports}
            selectedPortName={selectedPortName}
            setSelectedPortName={setSelectedPortName}
            getSelectedPin={getSelectedPin}
            setPortMapping={setPortMapping}
          />
        )}
      </InfoCard>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-metric" style={{ minWidth: "72px", padding: "7px 10px" }}>
      <div
        style={{
          color: "var(--ui-text-muted)",
          fontSize: "10px",
          fontWeight: 900,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "var(--ui-text)",
          fontSize: "13px",
          fontWeight: 900,
          marginTop: "2px",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SimplePinMapper({
  board,
  ports,
  suggestedMappings,
  getSelectedPin,
  setPortMapping,
}: {
  board: BoardDefinition;
  ports: HdlPort[];
  suggestedMappings: Record<string, string>;
  getSelectedPin: (portName: string) => string;
  setPortMapping: (portName: string, pinKey: string) => void;
}) {
  const pinOptions = getPinOptions(board);
  const pinOptionMap = new Map(pinOptions.map((pin) => [pin.key, pin]));
  const mappedPhysicalPins = new Set(
    ports
      .map((port) => pinOptionMap.get(getSelectedPin(port.name))?.pin)
      .filter((pin): pin is string => Boolean(pin)),
  );

  return (
    <div
      style={{
        marginTop: "24px",
        minHeight: 0,
        border: "1px solid var(--ui-border-control)",
        borderRadius: "var(--ui-radius-lg)",
        overflow: "auto",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 110px minmax(220px, 1.4fr)",
          gap: "12px",
          padding: "12px 16px",
          background: "var(--ui-surface)",
          borderBottom: "1px solid var(--ui-border-subtle)",
          color: "var(--ui-text-muted)",
          fontSize: "12px",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        <div>HDL Port</div>
        <div>Direction</div>
        <div>Board Pin</div>
      </div>

      {ports.length === 0 ? (
        <EmptyPortState />
      ) : (
        ports.map((port) => {
          const selectedPin = getSelectedPin(port.name);
          const suggestion = suggestedMappings[port.name];

          return (
            <div
              key={port.name}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px minmax(220px, 1.4fr)",
                gap: "12px",
                alignItems: "center",
                padding: "14px 16px",
                borderTop: "1px solid var(--ui-border-subtle)",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "15px",
                    color: "var(--ui-text)",
                    fontWeight: 850,
                    overflowWrap: "anywhere",
                  }}
                >
                  {port.name}
                </div>
                {suggestion && selectedPin === suggestion && (
                  <div
                    style={{
                      marginTop: "4px",
                      color: "var(--ui-text-muted)",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    Suggested
                  </div>
                )}
              </div>

              <div
                style={{
                  color: "var(--ui-text-muted)",
                  fontSize: "14px",
                  fontWeight: 800,
                  textTransform: "capitalize",
                }}
              >
                {port.direction}
              </div>

              <select
                aria-label={`Board pin for ${port.name}`}
                value={selectedPin}
                onChange={(event) =>
                  setPortMapping(port.name, event.target.value)
                }
                style={{
                  width: "100%",
                  minWidth: 0,
                  border: "1px solid var(--ui-border-control)",
                  borderRadius: "var(--ui-radius-sm)",
                  background: "var(--ui-control-bg)",
                  color: "var(--ui-text)",
                  padding: "11px 12px",
                  fontSize: "14px",
                  fontWeight: 750,
                }}
              >
                <option value="">Unmapped</option>
                {pinOptions
                  .filter(
                    (pin) =>
                      pin.key === selectedPin ||
                      !mappedPhysicalPins.has(pin.pin),
                  )
                  .map((pin) => (
                    <option key={pin.key} value={pin.key}>
                      {pin.label}
                    </option>
                  ))}
              </select>
            </div>
          );
        })
      )}
    </div>
  );
}

function ResourcePinMapper({
  board,
  ports,
  selectedPortName,
  setSelectedPortName,
  getSelectedPin,
  setPortMapping,
}: {
  board: BoardDefinition;
  ports: HdlPort[];
  selectedPortName: string | null;
  setSelectedPortName: (portName: string | null) => void;
  getSelectedPin: (portName: string) => string;
  setPortMapping: (portName: string, pinKey: string) => void;
}) {
  const pinOptions = getPinOptions(board);
  const pinOptionMap = new Map(pinOptions.map((pin) => [pin.key, pin]));
  const mappedPorts = ports.filter((port) => getSelectedPin(port.name));
  const unmappedPorts = ports.filter((port) => !getSelectedPin(port.name));
  const selectedPort =
    unmappedPorts.find((port) => port.name === selectedPortName) ??
    unmappedPorts[0] ??
    null;
  const selectedPin = selectedPort ? getSelectedPin(selectedPort.name) : "";
  const selectedPinOption = pinOptions.find((pin) => pin.key === selectedPin);
  const resourceGroups = getResourceGroups(board);
  const constraintPreview = createConstraintPreview(
    board,
    ports,
    getSelectedPin,
  );
  const [view, setView] = useState<
    "assignments" | "resources" | "board" | "constraints"
  >("assignments");
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filteredPorts = normalizedSearch
    ? ports.filter((port) => {
        const pin = pinOptionMap.get(getSelectedPin(port.name));
        return [port.name, port.direction, pin?.label, pin?.pin, pin?.type]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedSearch),
          );
      })
    : ports;
  const filteredResourceGroups = normalizedSearch
    ? resourceGroups
        .map((group) => ({
          ...group,
          pins: group.pins.filter((pin) =>
            [group.title, group.detail, pin.name, pin.pin, pin.type, pin.detail]
              .filter(Boolean)
              .some((value) =>
                String(value).toLowerCase().includes(normalizedSearch),
              ),
          ),
        }))
        .filter((group) => group.pins.length > 0)
    : resourceGroups;
  const validationItems = createPinMappingValidation(
    board,
    ports,
    getSelectedPin,
  );
  const mappedPinKeys = mappedPorts.map((port) => getSelectedPin(port.name));
  const mappedPhysicalPins = new Set(
    mappedPinKeys
      .map((pinKey) => pinOptionMap.get(pinKey)?.pin)
      .filter((pin): pin is string => Boolean(pin)),
  );

  function assignPin(pinKey: string) {
    if (!selectedPort) return;
    const physicalPin = pinOptionMap.get(pinKey)?.pin;
    if (physicalPin && mappedPhysicalPins.has(physicalPin)) return;
    setPortMapping(selectedPort.name, pinKey);
  }

  return (
    <div
      style={{
        marginTop: "18px",
        // Pure flexbox column down to the scrollable list. The system WKWebView
        // (Tauri) does not reliably propagate available height through a grid
        // minmax(0, 1fr) row sized by a flex parent, which left the pin list
        // unbounded; flexbox height propagation is handled correctly there.
        flex: "1 1 0",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      {ports.length === 0 ? (
        <EmptyPortState />
      ) : (
        <>
          <div
            style={{
              flexShrink: 0,
              display: "grid",
              gridTemplateColumns:
                "minmax(220px, 0.8fr) minmax(260px, 1fr) auto",
              gap: "12px",
              alignItems: "center",
              padding: "12px",
              border: "1px solid var(--ui-border-subtle)",
              borderRadius: "var(--ui-radius-lg)",
              background: "var(--ui-surface)",
            }}
          >
            <select
              value={selectedPort?.name ?? ""}
              onChange={(event) => setSelectedPortName(event.target.value)}
              disabled={unmappedPorts.length === 0}
              style={{
                width: "100%",
                minWidth: 0,
                border: "1px solid var(--ui-border-control)",
                borderRadius: "var(--ui-radius-sm)",
                background: "var(--ui-control-bg)",
                color: "var(--ui-text)",
                padding: "10px 12px",
                fontSize: "14px",
                fontWeight: 800,
              }}
            >
              {unmappedPorts.length === 0 ? (
                <option value="">All ports mapped</option>
              ) : null}
              {unmappedPorts.map((port) => (
                <option key={port.name} value={port.name}>
                  {port.name} - {port.direction}
                </option>
              ))}
            </select>

            <label
              style={{
                minWidth: 0,
                display: "block",
              }}
            >
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search ports, pins, resources"
                type="search"
                style={{
                  width: "100%",
                  minWidth: 0,
                  border: "1px solid var(--ui-border-control)",
                  borderRadius: "var(--ui-radius-sm)",
                  background: "var(--ui-control-bg)",
                  color: "var(--ui-text)",
                  padding: "10px 12px",
                  fontSize: "14px",
                  fontWeight: 750,
                  boxSizing: "border-box",
                }}
              />
            </label>

            <div
              style={{
                color: "var(--ui-text-muted)",
                fontSize: "12px",
                fontWeight: 850,
                whiteSpace: "nowrap",
              }}
            >
              {ports.filter((port) => getSelectedPin(port.name)).length}/
              {ports.length} mapped
            </div>
          </div>

          <div
            className="ui-compact-button-group"
            style={{
              flexShrink: 0,
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
            }}
          >
            {(
              [
                ["assignments", "Assignments"],
                ["resources", "Resources"],
                ["board", "Board"],
                ["constraints", "Constraints"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="ui-button ui-button-secondary"
                aria-pressed={view === key}
                onClick={() => setView(key)}

              >
                {label}
              </button>
            ))}
          </div>

          <div
            style={{
              flex: "1 1 0",
              minHeight: 0,
              display: "flex",
              flexDirection: "row",
              gap: "14px",
              overflow: "hidden",
            }}
          >
            <div
              className="pin-resource-list"
              style={{
                flex: "1.35 1 0",
                minWidth: 0,
                minHeight: 0,
                overflow: "auto",
                paddingRight: "4px",
              }}
            >
              {view === "assignments" ? (
                <AdvancedAssignmentTable
                  ports={filteredPorts}
                  pinOptions={pinOptions}
                  pinOptionMap={pinOptionMap}
                  mappedPhysicalPins={mappedPhysicalPins}
                  selectedPortName={selectedPort?.name ?? null}
                  getSelectedPin={getSelectedPin}
                  setPortMapping={setPortMapping}
                  setSelectedPortName={setSelectedPortName}
                />
              ) : view === "resources" ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "12px",
                    alignContent: "start",
                  }}
                >
                  {filteredResourceGroups.map((group) => (
                    <ResourceGroupCard
                      key={group.title}
                      group={group}
                      selectedPin={selectedPin}
                      selectedPort={selectedPort}
                      mappedPhysicalPins={mappedPhysicalPins}
                      onAssignPin={assignPin}
                    />
                  ))}
                </div>
              ) : view === "board" ? (
                <VirtualBoard
                  board={board}
                  selectable
                  selectedPinKey={selectedPin || null}
                  mappedPinKeys={mappedPinKeys}
                  onSelectPin={assignPin}
                  maxHeight={520}
                />
              ) : (
                <ConstraintPreview
                  constraintPreview={constraintPreview}
                  mappedCount={mappedPorts.length}
                  totalCount={ports.length}
                />
              )}
            </div>

            <div
              style={{
                flex: "0.65 1 0",
                minWidth: "280px",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <DashboardSurfaceCard
                className="pin-map-assignment-card pin-map-current-assignment-card"
                style={{
                  flexShrink: 0,
                  borderRadius: "var(--ui-radius-lg)",
                  padding: "14px",
                }}
              >
                <div
                  style={{
                    color: "var(--ui-text-muted)",
                    fontSize: "11px",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Current Assignment
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    color: "var(--ui-text)",
                    fontSize: "15px",
                    fontWeight: 900,
                    overflowWrap: "anywhere",
                  }}
                >
                  {selectedPort?.name ?? "No port selected"}
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    color: selectedPinOption
                      ? "var(--ui-accent-text)"
                      : "var(--ui-text-muted)",
                    fontSize: "13px",
                    fontWeight: 800,
                    lineHeight: 1.35,
                  }}
                >
                  {selectedPinOption
                    ? selectedPinOption.label
                    : "Choose a board resource to map this port."}
                </div>
                {selectedPinOption ? (
                  <div
                    style={{
                      marginTop: "12px",
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "8px",
                    }}
                  >
                    <PinInspectorFact
                      label="Pad"
                      value={selectedPinOption.pin}
                    />
                    <PinInspectorFact
                      label="Type"
                      value={selectedPinOption.type.toUpperCase()}
                    />
                    <PinInspectorFact
                      label="Format"
                      value={`.${board.constraintsFile}`}
                    />
                    <PinInspectorFact label="I/O" value={selectedPinOption.ioStandard} />
                  </div>
                ) : null}
              </DashboardSurfaceCard>

              <DashboardSurfaceCard
                className="pin-map-resource-card pin-map-validation-card"
                style={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  borderRadius: "var(--ui-radius-lg)",
                  padding: "14px",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    alignItems: "center",
                  }}
                >
                  <span>
                    <span
                      style={{
                        color: "var(--ui-text)",
                        fontSize: "13px",
                        fontWeight: 900,
                      }}
                    >
                      Validation
                    </span>
                  </span>
                  <span
                    style={{
                      color:
                        validationItems.length === 0 ? "var(--ui-success-text)" : "var(--ui-warning-text)",
                      fontSize: "12px",
                      fontWeight: 900,
                    }}
                  >
                    {validationItems.length === 0
                      ? "Clean"
                      : `${validationItems.length} item${
                          validationItems.length === 1 ? "" : "s"
                        }`}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: "10px",
                    display: "grid",
                    gap: "8px",
                    minHeight: 0,
                    overflow: "auto",
                  }}
                >
                  {validationItems.length === 0 ? (
                    <div
                      className="pin-map-detail-box pin-map-validation-message success"
                      style={{
                        borderRadius: "var(--ui-radius-sm)",
                        padding: "10px",
                        fontSize: "12px",
                        fontWeight: 800,
                        lineHeight: 1.35,
                      }}
                    >
                      All detected ports have unique assignments.
                    </div>
                  ) : (
                    validationItems.map((item) => (
                      <div
                        className="pin-map-detail-box pin-map-validation-message warning"
                        key={`${item.kind}:${item.message}`}
                        style={{
                          borderRadius: "var(--ui-radius-sm)",
                          padding: "10px",
                          fontSize: "12px",
                          fontWeight: 800,
                          lineHeight: 1.35,
                        }}
                      >
                        {item.message}
                      </div>
                    ))
                  )}
                </div>
              </DashboardSurfaceCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type PinOption = ReturnType<typeof getPinOptions>[number];

function AdvancedAssignmentTable({
  ports,
  pinOptions,
  pinOptionMap,
  mappedPhysicalPins,
  selectedPortName,
  getSelectedPin,
  setPortMapping,
  setSelectedPortName,
}: {
  ports: HdlPort[];
  pinOptions: PinOption[];
  pinOptionMap: Map<string, PinOption>;
  mappedPhysicalPins: Set<string>;
  selectedPortName: string | null;
  getSelectedPin: (portName: string) => string;
  setPortMapping: (portName: string, pinKey: string) => void;
  setSelectedPortName: (portName: string | null) => void;
}) {
  if (ports.length === 0) {
    return (
      <div
        style={{
          border: "1px solid var(--ui-border-subtle)",
          borderRadius: "var(--ui-radius-lg)",
          background: "var(--ui-surface)",
          color: "var(--ui-text-muted)",
          padding: "18px",
          fontSize: "13px",
          fontWeight: 800,
        }}
      >
        No matching ports.
      </div>
    );
  }

  return (
    <div
      style={{
        minWidth: "720px",
        border: "1px solid var(--ui-border-control)",
        borderRadius: "var(--ui-radius-lg)",
        overflow: "hidden",
        background: "var(--ui-panel)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(170px, 1fr) 90px minmax(260px, 1.4fr) 110px",
          gap: "12px",
          padding: "11px 14px",
          background: "var(--ui-surface)",
          borderBottom: "1px solid var(--ui-border-subtle)",
          color: "var(--ui-text-muted)",
          fontSize: "11px",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        <div>Port</div>
        <div>Direction</div>
        <div>Assignment</div>
        <div>Status</div>
      </div>

      {ports.map((port) => {
        const selectedPin = getSelectedPin(port.name);
        const pin = selectedPin ? pinOptionMap.get(selectedPin) : null;
        const active = selectedPortName === port.name;

        return (
          <div
            key={port.name}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedPortName(port.name)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedPortName(port.name);
              }
            }}
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px solid var(--ui-border-subtle)",
              background: active ? "var(--ui-control-active-bg)" : "var(--ui-panel)",
              display: "grid",
              gridTemplateColumns:
                "minmax(170px, 1fr) 90px minmax(260px, 1.4fr) 110px",
              gap: "12px",
              alignItems: "center",
              padding: "12px 14px",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                minWidth: 0,
                color: active ? "var(--ui-accent-text)" : "var(--ui-text)",
                fontSize: "14px",
                fontWeight: 900,
                overflowWrap: "anywhere",
              }}
            >
              {port.name}
            </div>
            <div
              style={{
                color: "var(--ui-text-muted)",
                fontSize: "13px",
                fontWeight: 850,
                textTransform: "capitalize",
              }}
            >
              {port.direction}
            </div>
            <select
              value={selectedPin}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                setPortMapping(port.name, event.target.value)
              }
              style={{
                width: "100%",
                minWidth: 0,
                border: "1px solid var(--ui-border-control)",
                borderRadius: "var(--ui-radius-sm)",
                background: "var(--ui-control-bg)",
                color: "var(--ui-text)",
                padding: "9px 10px",
                fontSize: "13px",
                fontWeight: 750,
              }}
            >
              <option value="">Unmapped</option>
              {pinOptions
                .filter(
                  (option) =>
                    option.key === selectedPin ||
                    !mappedPhysicalPins.has(option.pin),
                )
                .map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
            </select>
            <span
              style={{
                justifySelf: "start",
                borderRadius: "999px",
                background: pin ? "var(--ui-success-bg)" : "var(--ui-surface)",
                color: pin ? "var(--ui-success-text)" : "var(--ui-text-muted)",
                border: pin ? "1px solid var(--ui-success-border)" : "1px solid var(--ui-border-subtle)",
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 900,
                whiteSpace: "nowrap",
              }}
            >
              {pin ? "Mapped" : "Open"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PinInspectorFact({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="pin-map-detail-box"
      style={{
        minWidth: 0,
        border: "1px solid var(--ui-border-subtle)",
        borderRadius: "var(--ui-radius-sm)",
        background: "var(--ui-surface)",
        padding: "8px",
      }}
    >
      <div
        style={{
          color: "var(--ui-text-muted)",
          fontSize: "10px",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: "3px",
          color: "var(--ui-text)",
          fontSize: "12px",
          fontWeight: 900,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ConstraintPreview({
  constraintPreview,
  mappedCount,
  totalCount,
  compact = false,
}: {
  constraintPreview: string;
  mappedCount: number;
  totalCount: number;
  compact?: boolean;
}) {
  return (
    <DashboardSurfaceCard
      className="pin-map-preview-card"
      style={{
        flex: compact ? "1 1 0" : undefined,
        minHeight: compact ? 0 : "100%",
        borderRadius: "var(--ui-radius-lg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        className="pin-map-preview-header"
        style={{
          flexShrink: 0,
          padding: "12px 14px",
          borderBottom: "1px solid var(--ui-border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          gap: "10px",
          fontSize: "12px",
          fontWeight: 900,
        }}
      >
        <span>Constraint Preview</span>
        <span>
          {mappedCount}/{totalCount}
        </span>
      </div>
      <pre
        className="pin-map-preview-code"
        style={{
          flex: "1 1 0",
          margin: 0,
          minHeight: compact ? 0 : "420px",
          overflow: "auto",
          padding: "14px",
          fontSize: "12px",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          fontFamily:
            "var(--font-code)",
        }}
      >
        {constraintPreview}
      </pre>
    </DashboardSurfaceCard>
  );
}

function createPinMappingValidation(
  board: BoardDefinition,
  ports: HdlPort[],
  getSelectedPin: (portName: string) => string,
) {
  const items: Array<{ kind: "warning" | "info"; message: string }> = [];
  const pinToPorts = new Map<string, string[]>();
  const pinOptions = new Map(getPinOptions(board).map((pin) => [pin.key, pin]));
  const unmapped = ports.filter((port) => !getSelectedPin(port.name));

  for (const port of ports) {
    const pinKey = getSelectedPin(port.name);
    if (!pinKey) continue;
    const physicalPin = pinOptions.get(pinKey)?.pin ?? pinKey;
    const mapped = pinToPorts.get(physicalPin) ?? [];
    mapped.push(port.name);
    pinToPorts.set(physicalPin, mapped);
  }

  if (unmapped.length > 0) {
    items.push({
      kind: "info",
      message: `${unmapped.length} port${
        unmapped.length === 1 ? "" : "s"
      } still unmapped.`,
    });
  }

  for (const [physicalPin, mappedPorts] of pinToPorts) {
    if (mappedPorts.length <= 1) continue;
    items.push({
      kind: "warning",
      message: `${physicalPin} is assigned to ${mappedPorts.join(", ")}.`,
    });
  }

  return items;
}
type ResourceGroup = {
  title: string;
  detail: string;
  pins: Array<{
    key: string;
    name: string;
    pin: string;
    type: string;
    symbol: string;
    detail?: string;
  }>;
};

function ResourceGroupCard({
  group,
  selectedPin,
  selectedPort,
  mappedPhysicalPins,
  onAssignPin,
}: {
  group: ResourceGroup;
  selectedPin: string;
  selectedPort: HdlPort | null;
  mappedPhysicalPins: Set<string>;
  onAssignPin: (pinKey: string) => void;
}) {
  const visiblePins = group.pins.filter(
    (pin) => pin.key === selectedPin || !mappedPhysicalPins.has(pin.pin),
  );

  return (
    <DashboardSurfaceCard
      className="pin-map-resource-card"
      style={{
        borderRadius: "var(--ui-radius-lg)",
        padding: "14px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <div>
          <div style={{ color: "var(--ui-text)", fontSize: "15px", fontWeight: 900 }}>
            {group.title}
          </div>
          <div
            style={{
              marginTop: "4px",
              color: "var(--ui-text-muted)",
              fontSize: "12px",
              fontWeight: 750,
            }}
          >
            {group.detail}
          </div>
        </div>
        <span style={{ color: "var(--ui-text-soft)", fontSize: "12px", fontWeight: 900 }}>
          {visiblePins.length}
        </span>
      </div>

      <div
        style={{
          marginTop: "12px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))",
          gap: "8px",
        }}
      >
        {visiblePins.map((pin) => {
          const active = selectedPin === pin.key;
          const color = getPinTypeColor(pin.type);

          return (
            <button
              className={`pin-map-resource-button${active ? " active" : ""}`}
              key={pin.key}
              type="button"
              disabled={!selectedPort}
              onClick={() => onAssignPin(pin.key)}
              title={`${pin.name} (${pin.pin})`}
              style={{
                minWidth: 0,
                minHeight: "58px",
                border: active ? "2px solid var(--ui-border-hover)" : "1px solid var(--ui-border-control)",
                borderRadius: "var(--ui-radius-md)",
                cursor: selectedPort ? "pointer" : "not-allowed",
                padding: "9px",
                display: "grid",
                gap: "3px",
                boxShadow: active ? "var(--ui-focus-ring)" : "none",
              }}
            >
              <span
                style={{
                  justifySelf: "start",
                  borderRadius: "999px",
                  background: color.background,
                  color: color.color,
                  padding: "3px 6px",
                  fontSize: "9px",
                  fontWeight: 950,
                }}
              >
                {pin.symbol}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 900,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {pin.pin}
              </span>
              <span
                style={{
                  color: "var(--ui-text-muted)",
                  fontSize: "10px",
                  fontWeight: 750,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {pin.detail ?? pin.name}
              </span>
            </button>
          );
        })}
      </div>
    </DashboardSurfaceCard>
  );
}

function getResourceGroups(board: BoardDefinition): ResourceGroup[] {
  const groups = new Map<string, ResourceGroup>();

  function addPin(
    groupTitle: string,
    groupDetail: string,
    pin: ResourceGroup["pins"][number],
  ) {
    const group = groups.get(groupTitle) ?? {
      title: groupTitle,
      detail: groupDetail,
      pins: [],
    };

    group.pins.push(pin);
    groups.set(groupTitle, group);
  }

  board.clocks
    .filter((clock) => clock.pin)
    .forEach((clock) =>
      addPin("Clocks", "Clock sources", {
        key: `clock:${clock.name}`,
        name: clock.name,
        pin: clock.pin ?? "",
        type: "clock",
        symbol: "CLK",
        detail: `${Math.round(clock.frequency / 1_000_000)} MHz`,
      }),
    );

  board.pins.forEach((pin) => {
    const title = getResourceGroupTitle(pin);
    addPin(title, pin.group ?? getPinTypeLabel(pin.type), {
      key: `pin:${pin.name}:${pin.pin}`,
      name: pin.name,
      pin: pin.pin,
      type: pin.type,
      symbol: getResourceSymbol(pin),
      detail: pin.signal ?? pin.group ?? pin.name,
    });
  });

  return Array.from(groups.values()).sort(
    (a, b) => getResourceOrder(a.title) - getResourceOrder(b.title),
  );
}

function getResourceGroupTitle(pin: BoardPin) {
  if (pin.type === "led") return "LEDs";
  if (pin.type === "button") return "Buttons / Reset";
  if (pin.type === "uart") return "UART";
  if (pin.type === "spi" || pin.type === "flash") return "SPI / Flash";
  if (pin.type === "i2c") return "I2C";
  if (
    pin.group?.toLowerCase().includes("usb") ||
    pin.signal?.toLowerCase().includes("usb")
  ) {
    return "USB / Special";
  }
  if (pin.type === "gpio") return pin.group ?? "GPIO";
  return pin.group ?? "Other";
}

function getResourceOrder(title: string) {
  const order = [
    "Clocks",
    "LEDs",
    "Buttons / Reset",
    "UART",
    "SPI / Flash",
    "I2C",
    "GPIO",
    "USB / Special",
  ];

  const index = order.indexOf(title);
  return index === -1 ? 100 : index;
}

function getResourceSymbol(pin: BoardPin) {
  if (pin.type === "clock") return "CLK";
  if (pin.type === "led") return "LED";
  if (pin.type === "button") return pin.activeLow ? "RST" : "BTN";
  if (pin.type === "uart") return "URT";
  if (pin.type === "spi" || pin.type === "flash") return "SPI";
  if (pin.type === "i2c") return "I2C";
  if (
    pin.group?.toLowerCase().includes("usb") ||
    pin.signal?.toLowerCase().includes("usb")
  ) {
    return "USB";
  }
  if (pin.type === "gpio") return "IO";
  return "PIN";
}

function getPinTypeLabel(type: string) {
  if (type === "led") return "User outputs";
  if (type === "button") return "User inputs";
  if (type === "uart") return "Serial";
  if (type === "spi" || type === "flash") return "Serial bus";
  if (type === "i2c") return "Two-wire bus";
  if (type === "gpio") return "General I/O";
  return "Board resources";
}

function createConstraintPreview(
  board: BoardDefinition,
  ports: HdlPort[],
  getSelectedPin: (portName: string) => string,
) {
  if (ports.length === 0) {
    return `# ${board.name} ${board.constraintsFile.toUpperCase()} preview\n# No top-level ports detected.`;
  }
  return createPinMappingConstraints(
    board,
    ports,
    Object.fromEntries(
      ports.map((port) => [port.name, getSelectedPin(port.name)]),
    ),
  );
}

function EmptyPortState() {
  return (
    <div
      style={{
        padding: "28px 16px",
        color: "var(--ui-text-muted)",
        fontSize: "15px",
        lineHeight: 1.5,
      }}
    >
      No top-level ports detected yet. Create or import HDL files with
      module/entity ports in the selected top-level file to start mapping pins.
    </div>
  );
}
