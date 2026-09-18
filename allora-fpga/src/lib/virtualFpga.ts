import { invokeTauri } from "./tauri";
import type { ProjectFile } from "../pages/dashboard/types";
import { findTopModule, isTestbenchFile } from "../hooks/utils";

export type RtlPort = {
  name: string;
  direction: "input" | "output" | "inout" | "unknown";
  width: number;
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
};

export type VirtualFpgaConfig = {
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

export function defaultVirtualFpgaConfig(topModule: string): VirtualFpgaConfig {
  return {
    topModule,
    engine: "verilator",
    clockFrequencyHz: 50_000_000,
    enableVcd: true,
    peripherals: DEFAULT_PERIPHERALS.map((peripheral) => ({ ...peripheral })),
  };
}

export function readVirtualFpgaConfig(
  files: ProjectFile[],
  fallbackTopModule: string,
): VirtualFpgaConfig {
  const fallback = defaultVirtualFpgaConfig(fallbackTopModule);
  const metadata = files.find((file) => file.name === "allora-project.json");
  if (!metadata || metadata.isBinary) return fallback;
  try {
    const parsed = JSON.parse(metadata.content) as {
      simulation?: Partial<VirtualFpgaConfig>;
    };
    const simulation = parsed.simulation;
    if (!simulation || simulation.engine !== "verilator") return fallback;
    return {
      ...fallback,
      ...simulation,
      topModule: simulation.topModule?.trim() || fallbackTopModule,
      clockFrequencyHz: normalizeFrequency(simulation.clockFrequencyHz),
      peripherals: mergePeripherals(simulation.peripherals),
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
  ) =>
    invokeTauri<RtlPort[]>("discover_rtl_ports", {
      request: { sourceFiles, topModule },
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
  setInput: (sessionId: number, signal: string, value: number) =>
    invokeTauri<SimulationSnapshot>("set_virtual_simulation_input", {
      request: { sessionId, signal, value },
    }),
  step: (sessionId: number, cycles: number) =>
    invokeTauri<SimulationSnapshot>("step_virtual_simulation", {
      request: { sessionId, cycles },
    }),
  reset: (sessionId: number, resetSignal: string | null, activeHigh = true) =>
    invokeTauri<SimulationSnapshot>("reset_virtual_simulation", {
      request: { sessionId, resetSignal, activeHigh },
    }),
  stop: (sessionId: number) =>
    invokeTauri<string | null>("stop_virtual_simulation", {
      request: { sessionId },
    }),
};

function normalizeFrequency(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 1
    ? Math.round(number)
    : 50_000_000;
}

function mergePeripherals(value: unknown): VirtualPeripheral[] {
  if (!Array.isArray(value)) {
    return DEFAULT_PERIPHERALS.map((peripheral) => ({ ...peripheral }));
  }
  const saved = new Map(
    value
      .filter((item): item is VirtualPeripheral =>
        Boolean(item && typeof item === "object" && "id" in item),
      )
      .map((item) => [item.id, item]),
  );
  return DEFAULT_PERIPHERALS.map((peripheral) => ({
    ...peripheral,
    ...saved.get(peripheral.id),
    type: peripheral.type,
  }));
}
