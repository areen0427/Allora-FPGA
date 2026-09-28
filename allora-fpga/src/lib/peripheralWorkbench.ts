import type { ProjectFile } from "../pages/dashboard/types";
import {
  readVirtualFpgaConfig,
  type RtlPort,
  type SimulationSnapshot,
  virtualFpgaApi,
} from "./virtualFpga";

export type DeviceKind =
  | "button"
  | "switch"
  | "led"
  | "led-bank"
  | "seven-segment"
  | "uart";
export type Connection = {
  signal: string;
  bit: number;
  width: number;
  offset?: number;
  upto?: boolean;
};
export type Device = {
  id: string;
  kind: DeviceKind;
  name: string;
  x: number;
  y: number;
  activeHigh: boolean;
  initial: boolean;
  count: number;
  baud: number;
  hex?: boolean;
  lineEnding?: string;
  connections: Record<string, Connection>;
  labels: string[];
};
export type Workbench = {
  version: 1;
  frequency: number;
  clock: Connection | null;
  devices: Device[];
};
export const library: { kind: DeviceKind; label: string }[] = [
  { kind: "button", label: "Momentary button" },
  { kind: "switch", label: "Toggle switch" },
  { kind: "led", label: "LED" },
  { kind: "led-bank", label: "LED bank" },
  { kind: "seven-segment", label: "Seven-segment + DP" },
  { kind: "uart", label: "UART terminal" },
];
export function newDevice(kind: DeviceKind, index: number): Device {
  return {
    id: crypto.randomUUID(),
    kind,
    name: `${library.find((d) => d.kind === kind)!.label} ${index + 1}`,
    x: (index % 3) * 270,
    y: Math.floor(index / 3) * 310,
    activeHigh: true,
    initial: false,
    count: 8,
    baud: 115200,
    connections: {},
    labels: [],
  };
}
export function channels(d: Device): string[] {
  return d.kind === "uart"
    ? ["tx", "rx"]
    : d.kind === "seven-segment"
      ? ["a", "b", "c", "d", "e", "f", "g", "dp"]
      : d.kind === "led-bank"
        ? Array.from({ length: d.count }, (_, i) => String(i))
        : ["signal"];
}
export function inputChannel(d: Device, channel: string) {
  return (
    d.kind === "button" ||
    d.kind === "switch" ||
    (d.kind === "uart" && channel === "rx")
  );
}
export function options(ports: RtlPort[], input: boolean) {
  return ports
    .filter(
      (p) => p.direction === (input ? "input" : "output") && p.width <= 64,
    )
    .flatMap((p) =>
      Array.from({ length: p.width }, (_, bit) => ({
        value: `${p.name}:${bit}`,
        label:
          p.width === 1
            ? p.name
            : `${p.name}[${(p.offset ?? 0) + (p.upto ? p.width - 1 - bit : bit)}]`,
        connection: {
          signal: p.name,
          bit,
          width: p.width,
          offset: p.offset ?? 0,
          upto: p.upto ?? false,
        },
      })),
    );
}
export function key(c: Connection | null | undefined) {
  return c ? `${c.signal}:${c.bit}` : "";
}
export function mappingError(
  c: Connection,
  ports: RtlPort[],
  input: boolean,
): string | null {
  const p = ports.find((p) => p.name === c.signal);
  if (!p) return `${c.signal}: port removed or renamed`;
  if (p.direction !== (input ? "input" : "output"))
    return `${c.signal}: wrong direction`;
  if (
    p.width !== c.width ||
    (p.offset ?? 0) !== (c.offset ?? 0) ||
    Boolean(p.upto) !== Boolean(c.upto)
  )
    return `${c.signal}: port range changed; remap explicitly`;
  if (!Number.isInteger(c.bit) || c.bit < 0 || c.bit >= p.width || p.width > 64)
    return `${c.signal}: invalid bit/width`;
  return null;
}
export function validate(
  config: Workbench,
  ports: RtlPort[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const drivers = new Map<string, string>();
  function check(id: string, c: Connection, input: boolean) {
    const error = mappingError(c, ports, input);
    if (error) (errors[id] ??= []).push(error);
    if (input) {
      const previous = drivers.get(key(c));
      if (previous) {
        (errors[id] ??= []).push(
          `Conflicting input driver: ${c.signal}[${c.bit}]`,
        );
        (errors[previous] ??= []).push(
          `Conflicting input driver: ${c.signal}[${c.bit}]`,
        );
      }
      drivers.set(key(c), id);
    }
  }
  if (config.clock) {
    check("clock", config.clock, true);
    if (config.clock.width !== 1)
      (errors.clock ??= []).push("Clock requires a scalar input");
  }
  if (
    !Number.isFinite(config.frequency) ||
    config.frequency < 1 ||
    config.frequency > 1e9
  )
    (errors.clock ??= []).push("Clock frequency must be 1 Hz–1 GHz");
  for (const d of config.devices) {
    for (const ch of channels(d)) {
      const c = d.connections[ch];
      if (c) check(d.id, c, inputChannel(d, ch));
    }
    if (
      d.kind === "uart" &&
      (!Number.isFinite(d.baud) || d.baud < 1 || config.frequency < d.baud * 16)
    )
      (errors[d.id] ??= []).push(
        "UART needs a simulation frequency at least 16× baud",
      );
  }
  return errors;
}
function validWorkbench(c: Workbench): boolean {
  const connection = (v: Connection) =>
    v &&
    typeof v.signal === "string" &&
    Number.isInteger(v.bit) &&
    Number.isInteger(v.width);
  return (
    c?.version === 1 &&
    Number.isFinite(c.frequency) &&
    (c.clock === null || connection(c.clock)) &&
    Array.isArray(c.devices) &&
    new Set(c.devices.map((d) => d.id)).size === c.devices.length &&
    c.devices.every(
      (d) =>
        d &&
        typeof d.id === "string" &&
        typeof d.name === "string" &&
        library.some((k) => k.kind === d.kind) &&
        Number.isFinite(d.x) &&
        d.x >= 0 &&
        Number.isFinite(d.y) &&
        d.y >= 0 &&
        typeof d.activeHigh === "boolean" &&
        typeof d.initial === "boolean" &&
        Number.isInteger(d.count) &&
        d.count >= 1 &&
        d.count <= 32 &&
        Number.isFinite(d.baud) &&
        Array.isArray(d.labels) &&
        d.labels.every((l) => typeof l === "string") &&
        d.connections &&
        Object.values(d.connections).every(connection),
    )
  );
}
export function readWorkbench(files: ProjectFile[], top: string): Workbench {
  const metadata = files.find((f) => f.name === "allora-project.json");
  if (!metadata || metadata.isBinary)
    throw new Error("Readable allora-project.json is required");
  if (metadata) {
    const parsed = JSON.parse(metadata.content);
    if (parsed.peripheralWorkbench) {
      const config = parsed.peripheralWorkbench as Workbench;
      if (!validWorkbench(config))
        throw new Error("Unsupported Peripheral Workbench metadata");
      return config;
    }
  }
  const legacy = readVirtualFpgaConfig(files, top);
  const convert = (
    p: (typeof legacy.peripherals)[number],
  ): Connection | null =>
    p.signal
      ? {
          signal: p.signal,
          bit: p.bit ?? 0,
          width: p.bit === undefined ? 1 : -1,
        }
      : null;
  return {
    version: 1,
    frequency: legacy.clockFrequencyHz,
    clock: convert(legacy.peripherals.find((p) => p.type === "clock")!),
    devices: legacy.peripherals
      .filter(
        (p) =>
          p.signal && ["button", "switch", "led", "reset"].includes(p.type),
      )
      .map((p, i) => ({
        ...newDevice(p.type === "reset" ? "button" : (p.type as DeviceKind), i),
        name: p.label,
        activeHigh: p.activeHigh !== false,
        connections: { signal: convert(p)! },
      })),
  };
}
// Only legacy vector mappings lack a saved width. Resolve them once against structural discovery.
export function migrateLegacy(config: Workbench, ports: RtlPort[]): Workbench {
  return {
    ...config,
    devices: config.devices.map((d) => ({
      ...d,
      connections: Object.fromEntries(
        Object.entries(d.connections).map(([ch, c]) => [
          ch,
          c.width === -1 && ports.some((p) => p.name === c.signal)
            ? {
                ...c,
                width: ports.find((p) => p.name === c.signal)!.width,
                offset: ports.find((p) => p.name === c.signal)!.offset ?? 0,
                upto: ports.find((p) => p.name === c.signal)!.upto ?? false,
              }
            : c,
        ]),
      ),
    })),
  };
}
export function writeWorkbench(content: string, config: Workbench) {
  return (
    JSON.stringify(
      { ...JSON.parse(content), peripheralWorkbench: config },
      null,
      2,
    ) + "\n"
  );
}
export function signal(
  c: Connection | undefined,
  snapshot: SimulationSnapshot | null,
) {
  return c && snapshot
    ? Number((BigInt(snapshot.values[c.signal] ?? "0") >> BigInt(c.bit)) & 1n)
    : 0;
}
export function lit(
  d: Device,
  ch: string,
  snapshot: SimulationSnapshot | null,
) {
  return Boolean(
    d.connections[ch] &&
    snapshot &&
    signal(d.connections[ch], snapshot) === Number(d.activeHigh),
  );
}

// UART host model: TX edges are sampled from EVERY half-cycle, including entire batches.
// RX changes occur at integral cycle boundaries, rounded to nearest bit deadline.
export class UartModel {
  bytes: number[] = [];
  errors = 0;
  private previous = 1;
  private start: number | null = null;
  private sampleIndex = 0;
  private value = 0;
  queue: number[] = [];
  private frame: number[] = [];
  private frameStart = 0;
  private frameIndex = 0;
  readonly baud: number;
  readonly frequency: number;
  constructor(baud: number, frequency: number) {
    this.baud = baud;
    this.frequency = frequency;
  }
  observe(level: number, timePs: number) {
    const bitPs = 1e12 / this.baud;
    if (this.start === null && this.previous === 1 && level === 0) {
      this.start = timePs;
      this.sampleIndex = -1;
      this.value = 0;
    }
    if (
      this.start !== null &&
      timePs >= this.start + (this.sampleIndex + 1.5) * bitPs
    ) {
      if (this.sampleIndex === -1 && level !== 0) this.start = null;
      else if (this.sampleIndex >= 0 && this.sampleIndex < 8)
        this.value |= level << this.sampleIndex;
      else if (this.sampleIndex === 8) {
        if (level) this.bytes.push(this.value);
        else this.errors++;
        this.start = null;
      }
      this.sampleIndex++;
    }
    this.previous = level;
    if (this.bytes.length > 8192)
      this.bytes.splice(0, this.bytes.length - 8192);
  }
  enqueue(bytes: number[]) {
    if (this.queue.length + bytes.length > 4096)
      throw new Error("UART transmit queue limit is 4096 bytes");
    this.queue.push(...bytes);
  }
  drive(cycle: number): number | null {
    if (
      this.frame.length &&
      cycle >=
        this.frameStart +
          Math.round((this.frameIndex * this.frequency) / this.baud)
    ) {
      if (this.frameIndex < 10) return this.frame[this.frameIndex++];
      this.frame = [];
    }
    if (!this.frame.length && this.queue.length) {
      const byte = this.queue.shift()!;
      this.frame = [
        0,
        ...Array.from({ length: 8 }, (_, bit) => (byte >> bit) & 1),
        1,
      ];
      this.frameStart = cycle;
      this.frameIndex = 1;
      return 0;
    }
    return null;
  }
  nextDeadline(cycle: number) {
    return this.frame.length
      ? Math.max(
          cycle + 1,
          this.frameStart +
            Math.round((this.frameIndex * this.frequency) / this.baud),
        )
      : this.queue.length
        ? cycle
        : Infinity;
  }
}
export type SimulationApi = Pick<typeof virtualFpgaApi, "setInput" | "step">;
export class WorkbenchRuntime {
  snapshot: SimulationSnapshot;
  cycle = 0;
  uarts = new Map<string, UartModel>();
  activity: Record<string, number> = {};
  private observedLevels = new Map<string, number>();
  readonly session: number;
  readonly config: Workbench;
  readonly api: SimulationApi;
  constructor(
    session: number,
    config: Workbench,
    snapshot: SimulationSnapshot,
    api: SimulationApi = virtualFpgaApi,
  ) {
    this.session = session;
    this.config = config;
    this.api = api;
    this.snapshot = snapshot;
    for (const d of config.devices)
      if (d.kind === "uart")
        this.uarts.set(d.id, new UartModel(d.baud, config.frequency));
  }
  async drive(c: Connection, value: number) {
    const old = BigInt(this.snapshot.values[c.signal] ?? "0");
    const mask = 1n << BigInt(c.bit);
    const next = value ? old | mask : old & ~mask;
    this.snapshot = await this.api.setInput(
      this.session,
      c.signal,
      next.toString(),
    );
    this.observe([this.snapshot]);
  }
  async input(d: Device, active: boolean) {
    if (d.connections.signal)
      await this.drive(d.connections.signal, Number(active === d.activeHigh));
  }
  async initialize() {
    for (const d of this.config.devices) {
      if (d.kind === "button" || d.kind === "switch")
        await this.input(d, d.kind === "switch" && d.initial);
      if (d.kind === "uart" && d.connections.rx)
        await this.drive(d.connections.rx, 1);
    }
  }
  observe(trace: SimulationSnapshot[]) {
    for (const point of trace) {
      for (const d of this.config.devices) {
        if (d.kind === "uart" && d.connections.tx) {
          this.uarts
            .get(d.id)!
            .observe(signal(d.connections.tx, point), point.simTimePs);
        } else if (["led", "led-bank", "seven-segment"].includes(d.kind)) {
          for (const ch of channels(d)) {
            if (!d.connections[ch]) continue;
            const id = `${d.id}:${ch}`;
            const level = signal(d.connections[ch], point);
            const before = this.observedLevels.get(id);
            if (before !== undefined && before !== level)
              this.activity[d.id] = (this.activity[d.id] ?? 0) + 1;
            this.observedLevels.set(id, level);
          }
        }
      }
    }
  }

  async advance(cycles: number) {
    const end = this.cycle + cycles;
    while (this.cycle < end) {
      let next = Math.min(end, this.cycle + 256);
      for (const d of this.config.devices)
        if (d.kind === "uart" && d.connections.rx) {
          const uart = this.uarts.get(d.id)!;
          const level = uart.drive(this.cycle);
          if (level !== null) await this.drive(d.connections.rx, level);
          next = Math.min(next, uart.nextDeadline(this.cycle));
        }
      const result = await this.api.step(
        this.session,
        Math.max(1, next - this.cycle),
      );
      this.cycle = next;
      this.observe(result.trace);
      this.snapshot = result.state;
    }
  }
}
