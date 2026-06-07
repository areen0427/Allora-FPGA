import { useMemo, useState } from "react";
import type { BoardDefinition, BoardPin } from "../../data/boards";
import InfoCard from "./InfoCard";
import type { ProjectFile } from "./types";
import {
  createSuggestedMappings,
  findPorts,
  getPinOptions,
  type HdlPort,
} from "./pinMappingUtils";

type PinMappingSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  defaultMode: "simple" | "advanced";
  topLevelFileName: string | null;
};

export default function PinMappingSection({
  board,
  files,
  defaultMode,
  topLevelFileName,
}: PinMappingSectionProps) {
  const [mode, setMode] = useState<"simple" | "advanced">(defaultMode);
  const [selectedPortName, setSelectedPortName] = useState<string | null>(null);
  const ports = useMemo(
    () => findPorts(topLevelFileName ? files.filter((file) => file.name === topLevelFileName) : []),
    [files, topLevelFileName]
  );
  const suggestedMappings = useMemo(
    () => createSuggestedMappings(ports, board.pins, board.clocks),
    [ports, board.pins, board.clocks]
  );
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const mappedCount = ports.filter(
    (port) => overrides[port.name] ?? suggestedMappings[port.name]
  ).length;

  function getSelectedPin(portName: string) {
    return overrides[portName] ?? suggestedMappings[portName] ?? "";
  }

  function setPortMapping(portName: string, pinKey: string) {
    setOverrides((current) => ({
      ...current,
      [portName]: pinKey,
    }));
  }

  return (
    <div
      style={{
        display: "block",
        height: "calc(100vh - 48px)",
        minHeight: 0,
        overflow: "hidden",
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
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div
              style={{
                display: "inline-flex",
                gap: "4px",
                padding: "4px",
                borderRadius: "14px",
                background: "#f1f5f9",
              }}
            >
              {(["simple", "advanced"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  style={{
                    border: "none",
                    borderRadius: "10px",
                    background: mode === option ? "#ffffff" : "transparent",
                    color: mode === option ? "#2563eb" : "#64748b",
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontWeight: 850,
                    cursor: "pointer",
                    textTransform: "capitalize",
                    boxShadow:
                      mode === option ? "0 1px 3px rgba(15,23,42,0.08)" : "none",
                  }}
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
              <SummaryPill label="Mapped" value={`${mappedCount}/${ports.length}`} />
              <SummaryPill label="Pins" value={String(board.pins.length)} />
              <SummaryPill label="Constraints" value={`.${board.constraintsFile}`} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOverrides({})}
            disabled={Object.keys(overrides).length === 0}
            style={{
              border: "1px solid #dbe4f0",
              borderRadius: "11px",
              background: "#ffffff",
              color: Object.keys(overrides).length === 0 ? "#94a3b8" : "#475569",
              padding: "8px 11px",
              fontSize: "13px",
              fontWeight: 850,
              cursor: Object.keys(overrides).length === 0 ? "not-allowed" : "pointer",
            }}
          >
            Reset
          </button>
        </div>

        <p
          style={{
            margin: 0,
            color: "#64748b",
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
    <div
      style={{
        minWidth: "72px",
        borderRadius: "12px",
        border: "1px solid var(--dashboard-control-border, rgba(203, 213, 225, 0.78))",
        background: "var(--dashboard-control-bg, rgba(255,255,255,0.68))",
        padding: "7px 10px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
      }}
    >
      <div
        style={{
          color: "var(--dashboard-muted-text, #64748b)",
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
          color: "var(--dashboard-strong-text, #0f172a)",
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
  return (
    <div
      style={{
        marginTop: "24px",
        minHeight: 0,
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        overflow: "auto",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 110px minmax(220px, 1.4fr)",
          gap: "12px",
          padding: "12px 16px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          color: "#64748b",
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
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "15px",
                    color: "#0f172a",
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
                      color: "#64748b",
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
                  color: "#475569",
                  fontSize: "14px",
                  fontWeight: 800,
                  textTransform: "capitalize",
                }}
              >
                {port.direction}
              </div>

              <select
                value={selectedPin}
                onChange={(event) => setPortMapping(port.name, event.target.value)}
                style={{
                  width: "100%",
                  minWidth: 0,
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  background: "#ffffff",
                  color: "#0f172a",
                  padding: "11px 12px",
                  fontSize: "14px",
                  fontWeight: 750,
                }}
              >
                <option value="">Unmapped</option>
                {getPinOptions(board).map((pin) => (
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
  const selectedPort =
    ports.find((port) => port.name === selectedPortName) ?? ports[0] ?? null;
  const selectedPin = selectedPort ? getSelectedPin(selectedPort.name) : "";
  const pinOptions = getPinOptions(board);
  const selectedPinOption = pinOptions.find((pin) => pin.key === selectedPin);
  const mappedPorts = ports.filter((port) => getSelectedPin(port.name));
  const resourceGroups = getResourceGroups(board);
  const constraintPreview = createConstraintPreview(board, ports, getSelectedPin);

  function assignPin(pinKey: string) {
    if (!selectedPort) return;
    setPortMapping(selectedPort.name, pinKey);
  }

  return (
    <div
      style={{
        marginTop: "18px",
        flex: "1 1 auto",
        minHeight: 0,
        display: "grid",
        gridTemplateRows: ports.length === 0 ? "auto" : "auto minmax(0, 1fr) auto",
        gap: "14px",
      }}
    >
      {ports.length === 0 ? (
        <EmptyPortState />
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: "12px",
              alignItems: "center",
              padding: "12px",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              background: "#f8fafc",
            }}
          >
            <select
              value={selectedPort?.name ?? ""}
              onChange={(event) => setSelectedPortName(event.target.value)}
              style={{
                width: "100%",
                minWidth: 0,
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                background: "#ffffff",
                color: "#0f172a",
                padding: "10px 12px",
                fontSize: "14px",
                fontWeight: 800,
              }}
            >
              {ports.map((port) => (
                <option key={port.name} value={port.name}>
                  {port.name} - {port.direction}
                </option>
              ))}
            </select>

            <div
              style={{
                color: "#64748b",
                fontSize: "12px",
                fontWeight: 850,
                whiteSpace: "nowrap",
              }}
            >
              {ports.filter((port) => getSelectedPin(port.name)).length}/{ports.length} mapped
            </div>
          </div>

          <div
            style={{
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.65fr)",
              gap: "14px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                minHeight: 0,
                overflow: "auto",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
                paddingRight: "4px",
                alignContent: "start",
              }}
            >
              {resourceGroups.map((group) => (
                <ResourceGroupCard
                  key={group.title}
                  group={group}
                  selectedPin={selectedPin}
                  selectedPort={selectedPort}
                  onAssignPin={assignPin}
                />
              ))}
            </div>

            <div
              style={{
                minHeight: 0,
                display: "grid",
                gridTemplateRows: "auto minmax(0, 1fr)",
                gap: "12px",
              }}
            >
              <div
                className="pin-map-assignment-card"
                style={{
                  border: "1px solid var(--dashboard-surface-border, #e2e8f0)",
                  borderRadius: "16px",
                  background: "var(--dashboard-surface-bg, #ffffff)",
                  color: "var(--dashboard-text, #0f172a)",
                  padding: "14px",
                }}
              >
                <div style={{ color: "var(--dashboard-muted-text, #64748b)", fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Current Assignment
                </div>
                <div style={{ marginTop: "8px", color: "var(--dashboard-strong-text, #0f172a)", fontSize: "15px", fontWeight: 900, overflowWrap: "anywhere" }}>
                  {selectedPort?.name ?? "No port selected"}
                </div>
                <div style={{ marginTop: "6px", color: selectedPinOption ? "var(--dashboard-control-active-border, #2563eb)" : "var(--dashboard-muted-text, #94a3b8)", fontSize: "13px", fontWeight: 800, lineHeight: 1.35 }}>
                  {selectedPinOption
                    ? selectedPinOption.label
                    : "Choose a board resource to map this port."}
                </div>
              </div>

              <div
                className="pin-map-preview-card"
                style={{
                  minHeight: 0,
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  overflow: "hidden",
                  display: "grid",
                  gridTemplateRows: "auto minmax(0, 1fr)",
                }}
              >
                <div
                  className="pin-map-preview-header"
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid rgba(148,163,184,0.22)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    fontSize: "12px",
                    fontWeight: 900,
                  }}
                >
                  <span>Constraint Preview</span>
                  <span>{mappedPorts.length}/{ports.length}</span>
                </div>
                <pre
                  className="pin-map-preview-code"
                  style={{
                    margin: 0,
                    minHeight: 0,
                    overflow: "auto",
                    padding: "14px",
                    fontSize: "12px",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  {constraintPreview}
                </pre>
              </div>
            </div>
          </div>

        </>
      )}
    </div>
  );
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
  onAssignPin,
}: {
  group: ResourceGroup;
  selectedPin: string;
  selectedPort: HdlPort | null;
  onAssignPin: (pinKey: string) => void;
}) {
  return (
    <div
      className="pin-map-resource-card"
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "14px",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
        <div>
          <div style={{ color: "#0f172a", fontSize: "15px", fontWeight: 900 }}>
            {group.title}
          </div>
          <div style={{ marginTop: "4px", color: "#64748b", fontSize: "12px", fontWeight: 750 }}>
            {group.detail}
          </div>
        </div>
        <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 900 }}>
          {group.pins.length}
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
        {group.pins.map((pin) => {
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
                border: active ? "2px solid #2563eb" : "1px solid #dbe4f0",
                borderRadius: "13px",
                cursor: selectedPort ? "pointer" : "not-allowed",
                padding: "9px",
                display: "grid",
                gap: "3px",
                boxShadow: active ? "0 0 0 4px rgba(37,99,235,0.12)" : "none",
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
              <span style={{ fontSize: "12px", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pin.pin}
              </span>
              <span style={{ color: "#64748b", fontSize: "10px", fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pin.detail ?? pin.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getResourceGroups(board: BoardDefinition): ResourceGroup[] {
  const groups = new Map<string, ResourceGroup>();

  function addPin(groupTitle: string, groupDetail: string, pin: ResourceGroup["pins"][number]) {
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
      })
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

  return Array.from(groups.values()).sort((a, b) => getResourceOrder(a.title) - getResourceOrder(b.title));
}

function getResourceGroupTitle(pin: BoardPin) {
  if (pin.type === "led") return "LEDs";
  if (pin.type === "button") return "Buttons / Reset";
  if (pin.type === "uart") return "UART";
  if (pin.type === "spi" || pin.type === "flash") return "SPI / Flash";
  if (pin.type === "i2c") return "I2C";
  if (pin.group?.toLowerCase().includes("usb") || pin.signal?.toLowerCase().includes("usb")) {
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
  if (pin.group?.toLowerCase().includes("usb") || pin.signal?.toLowerCase().includes("usb")) {
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
  getSelectedPin: (portName: string) => string
) {
  const pinOptions = new Map(getPinOptions(board).map((pin) => [pin.key, pin]));
  const lines = [`# ${board.name} ${board.constraintsFile.toUpperCase()} preview`];

  if (ports.length === 0) {
    lines.push("# No top-level ports detected.");
    return lines.join("\n");
  }

  for (const port of ports) {
    const selectedPin = getSelectedPin(port.name);
    const pin = selectedPin ? pinOptions.get(selectedPin) : null;

    if (!pin?.pin) {
      lines.push(`# ${port.name} is unmapped`);
      continue;
    }

    if (board.constraintsFile === "xdc") {
      lines.push(`set_property PACKAGE_PIN ${pin.pin} [get_ports ${port.name}]`);
      lines.push(`set_property IOSTANDARD LVCMOS33 [get_ports ${port.name}]`);
    } else if (board.constraintsFile === "pcf") {
      lines.push(`set_io ${port.name} ${pin.pin}`);
    } else if (board.constraintsFile === "lpf") {
      lines.push(`LOCATE COMP "${port.name}" SITE "${pin.pin}";`);
      lines.push(`IOBUF PORT "${port.name}" IO_TYPE=LVCMOS33;`);
    } else {
      lines.push(`IO_LOC "${port.name}" ${pin.pin};`);
    }
  }

  return lines.join("\n");
}

function EmptyPortState() {
  return (
    <div
      style={{
        padding: "28px 16px",
        color: "#64748b",
        fontSize: "15px",
        lineHeight: 1.5,
      }}
    >
      No top-level ports detected yet. Create or import HDL files with
      module/entity ports in the selected top-level file to start mapping pins.
    </div>
  );
}

function getPinTypeColor(type: string) {
  if (type === "clock") return { background: "#eff6ff", color: "#2563eb" };
  if (type === "led") return { background: "#fef3c7", color: "#b45309" };
  if (type === "button") return { background: "#fee2e2", color: "#b91c1c" };
  if (type === "uart" || type === "spi" || type === "flash" || type === "i2c") {
    return { background: "#f0fdf4", color: "#15803d" };
  }
  if (type === "unknown") return { background: "#f5f3ff", color: "#6d28d9" };
  return { background: "#f8fafc", color: "#475569" };
}
