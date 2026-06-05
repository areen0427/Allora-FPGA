import { useMemo, useState } from "react";
import type { BoardDefinition, BoardPin } from "../../data/boards";
import InfoCard, { InfoRow } from "./InfoCard";
import type { ProjectFile } from "./types";

type HdlPort = {
  name: string;
  direction: "input" | "output" | "inout";
  baseName?: string;
  index?: number;
};

type PinMappingSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
};

export default function PinMappingSection({
  board,
  files,
}: PinMappingSectionProps) {
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [selectedPortName, setSelectedPortName] = useState<string | null>(null);
  const ports = useMemo(() => findPorts(files), [files]);
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
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 260px",
        gap: "22px",
        alignItems: "start",
      }}
    >
      <InfoCard title="Pin Mapping">
        <div
          style={{
            display: "inline-flex",
            gap: "4px",
            padding: "4px",
            borderRadius: "14px",
            background: "#f1f5f9",
            marginBottom: "18px",
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

        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "16px",
            lineHeight: 1.55,
          }}
        >
          Suggested mappings are based on matching HDL port names to known board
          signals. Override any port with the selector.
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
          <AdvancedPinMapper
            board={board}
            ports={ports}
            selectedPortName={selectedPortName}
            setSelectedPortName={setSelectedPortName}
            getSelectedPin={getSelectedPin}
            setPortMapping={setPortMapping}
          />
        )}
      </InfoCard>

      <InfoCard title="Summary" style={{ padding: "20px", borderRadius: "20px" }}>
        <InfoRow label="Detected Ports" value={String(ports.length)} />
        <InfoRow label="Mapped Ports" value={String(mappedCount)} />
        <InfoRow label="Board Pins" value={String(board.pins.length)} />
        <InfoRow label="Constraint File" value={`constraints.${board.constraintsFile}`} />
      </InfoCard>
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
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        overflow: "hidden",
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

function AdvancedPinMapper({
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
  const selectedPort = ports.find((port) => port.name === selectedPortName) ?? null;
  const selectedPin = selectedPort ? getSelectedPin(selectedPort.name) : "";
  const leftPins = pinOptions.slice(0, Math.ceil(pinOptions.length / 2));
  const rightPins = pinOptions.slice(Math.ceil(pinOptions.length / 2));

  function assignPin(pinKey: string) {
    if (!selectedPort) return;
    setPortMapping(selectedPort.name, pinKey);
  }

  return (
    <div style={{ marginTop: "24px", display: "grid", gap: "18px" }}>
      {ports.length === 0 ? (
        <EmptyPortState />
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              padding: "14px",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              background: "#f8fafc",
            }}
          >
            {ports.map((port) => {
              const isSelected = port.name === selectedPortName;
              const mapped = Boolean(getSelectedPin(port.name));

              return (
                <button
                  key={port.name}
                  type="button"
                  onClick={() => setSelectedPortName(isSelected ? null : port.name)}
                  style={{
                    border: `1px solid ${isSelected ? "#2563eb" : "#dbe4f0"}`,
                    borderRadius: "999px",
                    background: isSelected ? "#eff6ff" : "#ffffff",
                    color: isSelected ? "#2563eb" : "#475569",
                    padding: "8px 11px",
                    fontSize: "13px",
                    fontWeight: 850,
                    cursor: "pointer",
                    boxShadow: mapped ? "inset 0 -2px 0 #bfdbfe" : "none",
                  }}
                >
                  {port.name}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(120px, 180px) minmax(260px, 1fr) minmax(120px, 180px)",
              gap: "16px",
              alignItems: "stretch",
            }}
          >
            <PinRail
              pins={leftPins}
              selectedPin={selectedPin}
              selectedPort={selectedPort}
              onAssignPin={assignPin}
            />

            <div
              style={{
                minHeight: "420px",
                border: "1px solid #dbe4f0",
                borderRadius: "22px",
                background:
                  "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
              }}
            >
              <div
                style={{
                  width: "62%",
                  aspectRatio: "1 / 1",
                  border: "1px solid #94a3b8",
                  borderRadius: "18px",
                  background: "#f1f5f9",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#334155",
                  textAlign: "center",
                  padding: "20px",
                }}
              >
                <div
                  style={{
                    fontSize: "28px",
                    fontWeight: 900,
                    letterSpacing: "-0.04em",
                  }}
                >
                  {board.device}
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    color: "#64748b",
                    fontSize: "14px",
                    fontWeight: 800,
                  }}
                >
                  {board.package}
                </div>
                <div
                  style={{
                    marginTop: "22px",
                    borderRadius: "999px",
                    background: selectedPort ? "#eff6ff" : "#ffffff",
                    border: "1px solid #dbe4f0",
                    color: selectedPort ? "#2563eb" : "#64748b",
                    padding: "9px 12px",
                    fontSize: "13px",
                    fontWeight: 850,
                  }}
                >
                  {selectedPort
                    ? `Assigning ${selectedPort.name}`
                    : "Select a signal chip"}
                </div>
              </div>
            </div>

            <PinRail
              pins={rightPins}
              selectedPin={selectedPin}
              selectedPort={selectedPort}
              onAssignPin={assignPin}
            />
          </div>
        </>
      )}
    </div>
  );
}

function PinRail({
  pins,
  selectedPin,
  selectedPort,
  onAssignPin,
}: {
  pins: ReturnType<typeof getPinOptions>;
  selectedPin: string;
  selectedPort: HdlPort | null;
  onAssignPin: (pinKey: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        alignContent: "start",
        gap: "6px",
        maxHeight: "420px",
        overflowY: "auto",
        paddingRight: "2px",
      }}
    >
      {pins.map((pin) => {
        const active = pin.key === selectedPin;

        return (
          <button
            key={pin.key}
            type="button"
            disabled={!selectedPort}
            onClick={() => onAssignPin(pin.key)}
            title={pin.label}
            style={{
              border: `1px solid ${active ? "#2563eb" : "#dbe4f0"}`,
              borderRadius: "10px",
              background: active ? "#eff6ff" : "#ffffff",
              color: active ? "#2563eb" : selectedPort ? "#334155" : "#94a3b8",
              padding: "8px 9px",
              textAlign: "left",
              fontSize: "12px",
              fontWeight: 800,
              cursor: selectedPort ? "pointer" : "not-allowed",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {pin.shortLabel}
          </button>
        );
      })}
    </div>
  );
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
      module/entity ports to start mapping pins.
    </div>
  );
}

function findPorts(files: ProjectFile[]) {
  const ports: HdlPort[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const discovered = file.name.endsWith(".vhd") || file.name.endsWith(".vhdl")
      ? findVhdlPorts(file.content)
      : findVerilogPorts(file.content);

    for (const port of discovered) {
      if (seen.has(port.name)) continue;
      seen.add(port.name);
      ports.push(port);
    }
  }

  return ports;
}

function findVerilogPorts(content: string) {
  const ports: HdlPort[] = [];
  const portPattern =
    /\b(input|output|inout)\b\s+(?:wire|reg|logic)?\s*(?:\[(\d+)\s*:\s*(\d+)\]\s*)?([a-zA-Z_][a-zA-Z0-9_$]*)/g;

  for (const match of content.matchAll(portPattern)) {
    ports.push(
      ...expandPort({
        direction: match[1] as HdlPort["direction"],
        name: match[4],
        msb: match[2],
        lsb: match[3],
      })
    );
  }

  return ports;
}

function findVhdlPorts(content: string) {
  const ports: HdlPort[] = [];
  const portBlock = content.match(/port\s*\(([\s\S]*?)\)\s*;/i)?.[1] ?? "";
  const portPattern =
    /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(in|out|inout)\b[^;]*(?:\((\d+)\s+downto\s+(\d+)\))?/gi;

  for (const match of portBlock.matchAll(portPattern)) {
    const direction = match[2].toLowerCase() as HdlPort["direction"];
    ports.push(
      ...expandPort({
        name: match[1],
        direction,
        msb: match[3],
        lsb: match[4],
      })
    );
  }

  return ports;
}

function expandPort({
  name,
  direction,
  msb,
  lsb,
}: {
  name: string;
  direction: HdlPort["direction"];
  msb?: string;
  lsb?: string;
}) {
  if (!msb || !lsb) return [{ name, direction }];

  const start = Number(msb);
  const end = Number(lsb);
  const step = start >= end ? -1 : 1;
  const ports: HdlPort[] = [];

  for (let index = start; step > 0 ? index <= end : index >= end; index += step) {
    ports.push({
      name: `${name}[${index}]`,
      baseName: name,
      index,
      direction,
    });
  }

  return ports;
}

function createSuggestedMappings(
  ports: HdlPort[],
  pins: BoardPin[],
  clocks: BoardDefinition["clocks"]
) {
  const mappings: Record<string, string> = {};
  const usedPins = new Set<string>();

  for (const port of ports) {
    const clockMatch = findClockMatch(port, clocks);

    if (clockMatch?.pin) {
      mappings[port.name] = `clock:${clockMatch.name}`;
      continue;
    }

    const pinMatch = findPinMatch(port, pins, usedPins);

    if (pinMatch) {
      mappings[port.name] = `pin:${pinMatch.name}:${pinMatch.pin}`;
      usedPins.add(pinMatch.name);
    }
  }

  return mappings;
}

function findClockMatch(
  port: HdlPort,
  clocks: BoardDefinition["clocks"]
) {
  const aliases = getPortAliases(port);
  const isClockPort = aliases.some((alias) =>
    ["clk", "clock", "sysclk", "clk12", "clk25", "clk48"].includes(alias)
  );

  if (!isClockPort) return null;

  return (
    clocks.find((clock) =>
      aliases.some((alias) => normalizeName(clock.name).includes(alias))
    ) ?? clocks[0] ?? null
  );
}

function findPinMatch(
  port: HdlPort,
  pins: BoardPin[],
  usedPins: Set<string>
) {
  const aliases = getPortAliases(port);
  const preferredTypes = getPreferredTypes(aliases, port.direction);

  for (const type of preferredTypes) {
    const candidates = pins.filter((pin) => pin.type === type && !usedPins.has(pin.name));
    const indexedMatch = findIndexedCandidate(port, candidates);
    if (indexedMatch) return indexedMatch;

    const aliasMatch = findAliasCandidate(aliases, candidates);
    if (aliasMatch) return aliasMatch;

    if (candidates.length === 1) return candidates[0];
  }

  return findAliasCandidate(
    aliases,
    pins.filter((pin) => !usedPins.has(pin.name))
  );
}

function findIndexedCandidate(port: HdlPort, candidates: BoardPin[]) {
  if (port.index === undefined) return null;
  const normalizedBase = normalizeName(port.baseName ?? port.name);

  return (
    candidates.find((pin) => {
      const searchable = getPinSearchTerms(pin).join(" ");
      return (
        normalizeName(searchable).includes(normalizedBase) &&
        new RegExp(`(^|[^0-9])${port.index}([^0-9]|$)`).test(searchable)
      );
    }) ?? candidates[port.index] ?? null
  );
}

function findAliasCandidate(aliases: string[], candidates: BoardPin[]) {
  return (
    candidates.find((pin) =>
      getPinSearchTerms(pin).some((term) => {
        const normalizedPin = normalizeName(term);
        return aliases.some(
          (alias) =>
            normalizedPin === alias ||
            normalizedPin.includes(alias) ||
            alias.includes(normalizedPin)
        );
      })
    ) ?? null
  );
}

function getPreferredTypes(
  aliases: string[],
  direction: HdlPort["direction"]
): BoardPin["type"][] {
  if (aliases.some((alias) => ["rst", "reset", "rstn", "resetn", "btn", "button", "sw", "switch"].includes(alias))) {
    return ["button", "gpio"];
  }

  if (aliases.some((alias) => ["led", "rgb", "red", "green", "blue", "r", "g", "b"].includes(alias))) {
    return ["led", "gpio"];
  }

  if (aliases.some((alias) => ["tx", "uarttx"].includes(alias))) {
    return ["uart", "gpio"];
  }

  if (aliases.some((alias) => ["rx", "uartrx"].includes(alias))) {
    return ["uart", "gpio"];
  }

  if (aliases.some((alias) => alias.startsWith("gpio") || alias === "io")) {
    return ["gpio"];
  }

  return direction === "output" ? ["led", "gpio"] : ["button", "gpio"];
}

function getPortAliases(port: HdlPort) {
  const rawName = port.baseName ?? port.name;
  const normalized = normalizeName(rawName);
  const aliases = new Set([normalized]);

  if (["clk", "clock", "sysclk"].includes(normalized)) {
    aliases.add("clk");
    aliases.add("clock");
  }

  if (["rst", "reset", "rstn", "resetn"].includes(normalized)) {
    aliases.add("rst");
    aliases.add("reset");
    aliases.add("rstn");
  }

  if (normalized.startsWith("led")) aliases.add("led");
  if (normalized.startsWith("btn") || normalized.includes("button")) {
    aliases.add("btn");
    aliases.add("button");
  }
  if (normalized.includes("uart") && normalized.endsWith("tx")) aliases.add("tx");
  if (normalized.includes("uart") && normalized.endsWith("rx")) aliases.add("rx");
  if (normalized.endsWith("tx")) aliases.add("tx");
  if (normalized.endsWith("rx")) aliases.add("rx");

  return Array.from(aliases);
}

function getPinSearchTerms(pin: BoardPin) {
  return [pin.name, pin.signal, pin.group, pin.pin].filter(Boolean).map(String);
}

function getPinOptions(board: BoardDefinition) {
  return [
    ...board.clocks
      .filter((clock) => clock.pin)
      .map((clock) => ({
        key: `clock:${clock.name}`,
        label: `${clock.name} (${clock.pin}) - Clock`,
        shortLabel: `${clock.name} ${clock.pin}`,
      })),
    ...board.pins.map((pin) => ({
      key: `pin:${pin.name}:${pin.pin}`,
      label: `${pin.name} (${pin.pin})${pin.group ? ` - ${pin.group}` : ""}`,
      shortLabel: `${pin.name} ${pin.pin}`,
    })),
  ];
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
