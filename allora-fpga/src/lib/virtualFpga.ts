import { invokeTauri } from "./tauri";
import type { ProjectFile } from "../pages/dashboard/types";
import { findTopModule, isTestbenchFile } from "../hooks/utils";
import type { BoardDefinition } from "../data/boardTypes";
import { getVirtualBoardResources } from "./virtualBoardResources";

export type RtlPort = {
  name: string;
  direction: "input" | "output" | "inout" | "unknown";
  width: number;
  offset?: number;
  upto?: boolean;
};

export type VirtualPeripheralType =
  | "clock"
  | "reset"
  | "button"
  | "switch"
  | "led";

export type VirtualPeripheral = {
  id: string;
  type: VirtualPeripheralType;
  label: string;
  signal: string | null;
  bit?: number;
  activeHigh?: boolean;
  pad?: string;
  group?: string;
  frequencyHz?: number;
  color?: string;
};

export type VirtualFpgaConfig = {
  boardId?: string;
  topModule: string;
  engine: "verilator";
  clockFrequencyHz: number;
  enableVcd: boolean;
  peripherals: VirtualPeripheral[];
};

export type SimulationSnapshot = {
  simTimePs: number;
  values: Record<string, string>;
};

export type SimulationStepResult = {
  state: SimulationSnapshot;
  trace: SimulationSnapshot[];
};

export type ToolAvailability = {
  available: boolean;
  path: string | null;
  installHint: string;
};

export type SimulationTools = {
  yosys: ToolAvailability;
  verilator: ToolAvailability;
};

export type StartSimulationResult = {
  sessionId: number;
  ports: RtlPort[];
  state: SimulationSnapshot;
  logs: string[];
  waveformPath: string | null;
};

const DEFAULT_PERIPHERALS: VirtualPeripheral[] = [
  { id: "clock-0", type: "clock", label: "CLOCK", signal: null },
  {
    id: "reset-0",
    type: "reset",
    label: "RESET",
    signal: null,
    activeHigh: true,
  },
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `button-${index}`,
    type: "button" as const,
    label: `BTN${index}`,
    signal: null,
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `switch-${index}`,
    type: "switch" as const,
    label: `SW${index}`,
    signal: null,
  })),
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `led-${index}`,
    type: "led" as const,
    label: `LED${index}`,
    signal: null,
  })),
];

export function defaultVirtualFpgaConfig(topModule: string, board?: BoardDefinition): VirtualFpgaConfig {
  const physicalBoard = board && board.id !== "allora-virtual" ? board : undefined;
  const resources = physicalBoard ? getVirtualBoardResources(physicalBoard) : null;
  return {
    ...(physicalBoard ? { boardId: physicalBoard.id } : {}),
    topModule,
    engine: "verilator",
    clockFrequencyHz: resources?.clock?.frequency ?? 50_000_000,
    enableVcd: true,
    peripherals: resources?.peripherals ?? DEFAULT_PERIPHERALS.map((peripheral) => ({ ...peripheral })),
  };
}

export function readVirtualFpgaConfig(
  files: ProjectFile[],
  fallbackTopModule: string,
  board?: BoardDefinition,
): VirtualFpgaConfig {
  let fallback = defaultVirtualFpgaConfig(fallbackTopModule, board);
  const metadata = files.find((file) => file.name === "allora-project.json");
  if (!metadata || metadata.isBinary) return fallback;
  try {
    const parsed = JSON.parse(metadata.content) as {
      simulation?: Partial<VirtualFpgaConfig>;
    };
    const simulation = parsed.simulation;
    if (!simulation || simulation.engine !== "verilator") return fallback;
    // Headless readers can restore the saved resource snapshot. The workspace
    // always supplies its board so the current catalog remains authoritative.
    if (!board && simulation.boardId) {
      fallback = { ...fallback, boardId: simulation.boardId,
        peripherals: mergePeripherals(simulation.peripherals, []),
      };
    }
    return {
      ...fallback,
      ...simulation,
      topModule: simulation.topModule?.trim() || fallbackTopModule,
      boardId: fallback.boardId,
      clockFrequencyHz: simulation.boardId && simulation.boardId !== fallback.boardId
        ? fallback.clockFrequencyHz
        : normalizeFrequency(simulation.clockFrequencyHz, fallback.clockFrequencyHz),
      peripherals: mergePeripherals(simulation.peripherals, fallback.peripherals, Boolean(fallback.boardId), simulation.boardId !== undefined && simulation.boardId !== fallback.boardId),
    };
  } catch {
    return fallback;
  }
}

export function writeVirtualFpgaConfig(
  metadataContent: string,
  config: VirtualFpgaConfig,
) {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(metadataContent) as Record<string, unknown>;
  } catch {
    // Preserve a usable project configuration even if an empty metadata file
    // was just created. The UI surfaces malformed existing JSON separately.
  }
  return `${JSON.stringify({ ...metadata, simulation: config }, null, 2)}\n`;
}

export function getConfiguredTopModule(
  files: ProjectFile[],
  topFileName: string | null,
) {
  if (topFileName) {
    const topFile = files.find((file) => file.name === topFileName);
    return (
      (topFile ? findTopModule([topFile]) : null) ??
      topFileName.replace(/\.(sv|v|vhd|vhdl)$/i, "")
    );
  }
  const metadata = files.find((file) => file.name === "allora-project.json");
  if (metadata && !metadata.isBinary) {
    try {
      const parsed = JSON.parse(metadata.content) as { topModule?: string };
      if (parsed.topModule?.trim()) return parsed.topModule.trim();
    } catch {
      // Fall through to the selected top-level file name.
    }
  }
  return "top";
}

export function getHdlSources(files: ProjectFile[], topModule?: string) {
  return files
    .filter(
      (file) =>
        /\.(sv|v)$/i.test(file.name) &&
        !file.isBinary &&
        !isTestbenchFile(file, topModule ?? null),
    )
    .map(({ name, content }) => ({ name, content }));
}

export function mappingKey(peripheral: VirtualPeripheral) {
  if (!peripheral.signal) return "";
  return peripheral.bit === undefined
    ? peripheral.signal
    : `${peripheral.signal}[${peripheral.bit}]`;
}

export function parseMappingKey(value: string) {
  const match = /^(.*)\[(\d+)]$/.exec(value);
  return match
    ? { signal: match[1], bit: Number(match[2]) }
    : { signal: value || null, bit: undefined };
}

export function getMappingOptions(
  ports: RtlPort[],
  peripheral: VirtualPeripheral,
) {
  const direction = peripheral.type === "led" ? "output" : "input";
  const requiresScalar =
    peripheral.type === "clock" || peripheral.type === "reset";
  return ports
    .filter(
      (port) =>
        port.direction === direction && (!requiresScalar || port.width === 1),
    )
    .flatMap((port) =>
      port.width === 1
        ? [{ key: port.name, label: port.name }]
        : Array.from({ length: port.width }, (_, bit) => ({
            key: `${port.name}[${bit}]`,
            label: `${port.name}[${bit}]`,
          })),
    );
}

export function getPeripheralValue(
  peripheral: VirtualPeripheral,
  snapshot: SimulationSnapshot | null,
) {
  if (!peripheral.signal || !snapshot) return 0;
  const raw = BigInt(snapshot.values[peripheral.signal] ?? "0");
  return Number((raw >> BigInt(peripheral.bit ?? 0)) & 1n);
}

/** Physical switches, buttons and LEDs keep the polarity declared by the board. */
export function isPeripheralActive(peripheral: VirtualPeripheral, snapshot: SimulationSnapshot | null) {
  if (!peripheral.signal || !snapshot) return false;
  return getPeripheralValue(peripheral, snapshot) === (peripheral.activeHigh === false ? 0 : 1);
}

export function getPeripheralDriveValue(peripheral: VirtualPeripheral, active: boolean) {
  return Number(peripheral.activeHigh === false ? !active : active);
}

export function formatSignalValue(raw: string | undefined, width: number) {
  const value = BigInt(raw ?? "0");
  const binary = value.toString(2).padStart(width, "0");
  const hexDigits = Math.max(1, Math.ceil(width / 4));
  return {
    binary,
    hex: `0x${value.toString(16).toUpperCase().padStart(hexDigits, "0")}`,
    decimal: value.toString(10),
  };
}

export const virtualFpgaApi = {
  detectTools: () => invokeTauri<SimulationTools>("detect_simulation_tools"),
  discoverPorts: (
    sourceFiles: ReturnType<typeof getHdlSources>,
    topModule: string,
    projectPath?: string,
  ) =>
    invokeTauri<RtlPort[]>("discover_rtl_ports", {
      request: { sourceFiles, topModule, projectPath },
    }),
  start: (request: {
    sourceFiles: ReturnType<typeof getHdlSources>;
    topModule: string;
    clockSignal: string | null;
    clockFrequencyHz: number;
    enableVcd: boolean;
    projectPath?: string;
  }) =>
    invokeTauri<StartSimulationResult>("start_virtual_simulation", { request }),
  setInput: (sessionId: number, signal: string, value: number | string) =>
    invokeTauri<SimulationSnapshot>("set_virtual_simulation_input", {
      request: { sessionId, signal, value },
    }),
  step: (sessionId: number, cycles: number) =>
    invokeTauri<SimulationStepResult>("step_virtual_simulation", {
      request: { sessionId, cycles },
    }),
  reset: (sessionId: number, resetSignal: string | null, activeHigh = true) =>
    invokeTauri<SimulationStepResult>("reset_virtual_simulation", {
      request: { sessionId, resetSignal, activeHigh },
    }),
  stop: (sessionId: number) =>
    invokeTauri<string | null>("stop_virtual_simulation", {
      request: { sessionId },
    }),
};

function normalizeFrequency(value: unknown, fallback = 50_000_000) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 1
    ? Math.round(number)
    : fallback;
}

function mergePeripherals(value: unknown, defaults = DEFAULT_PERIPHERALS, physical = false, differentBoard = false): VirtualPeripheral[] {
  if (differentBoard) return defaults.map(item => ({ ...item }));
  if (!Array.isArray(value)) {
    return defaults.map((peripheral) => ({ ...peripheral }));
  }
  const saved = new Map(
    value
      .filter((item): item is VirtualPeripheral =>
        Boolean(item && typeof item === "object" && "id" in item),
      )
      .map((item) => [item.id, item]),
  );
  // Migrate the old generic simulator mappings by their matching control type.
  // New board IDs include the pad, so future catalog changes preserve identity.
  const typeIndices = new Map<string, number>();
  if (physical) return defaults.map(peripheral => {
    const index = typeIndices.get(peripheral.type) ?? 0;
    typeIndices.set(peripheral.type, index + 1);
    const previous = saved.get(peripheral.id) ?? saved.get(`${peripheral.type}-${index}`);
    return {
      ...peripheral,
      signal: typeof previous?.signal === "string" ? previous.signal : null,
      ...(Number.isInteger(previous?.bit) && Number(previous?.bit) >= 0 ? { bit: previous?.bit } : {}),
      ...(peripheral.type === "reset" && previous?.activeHigh !== undefined ? { activeHigh: previous.activeHigh } : {}),
    };
  });
  const merged = defaults.map((peripheral) => ({
    ...peripheral,
    ...saved.get(peripheral.id),
    type: peripheral.type,
  }));
  const defaultIds = new Set(defaults.map((peripheral) => peripheral.id));
  return [...merged, ...[...saved.values()].filter((peripheral) =>
    !defaultIds.has(peripheral.id) && ["clock", "reset", "button", "switch", "led"].includes(peripheral.type),
  )];
}
