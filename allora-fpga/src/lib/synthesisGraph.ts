/** Yosys JSON is the source of truth. Views never infer missing pins or RTL. */
export type Bit = number | string;
export type SourceLocation = {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
};
export type Pin = {
  name: string;
  direction: string;
  bits: Bit[];
  role: string;
};
export type HardwareNode = {
  id: string;
  label: string;
  kind: string;
  detail: string;
  category: string;
  pins: Pin[];
  sources: SourceLocation[];
  attributes: Record<string, unknown>;
  parameters: Record<string, unknown>;
  module?: string;
  members?: string[];
};
export type HardwareEdge = {
  id: string;
  from: string;
  to: string;
  fromPort: string;
  toPort: string;
  label: string;
  bits: Bit[];
  width: number;
  role: string;
  connections: { bit: Bit; fromIndex: number; toIndex: number }[];
  members?: string[];
};
export type HardwareNet = {
  id: string;
  name: string;
  bits: Bit[];
  offset: number;
  upto: boolean;
  sources: SourceLocation[];
  attributes: Record<string, unknown>;
};
export type HardwareGraph = {
  module: string;
  nodes: HardwareNode[];
  edges: HardwareEdge[];
  nets: HardwareNet[];
  warnings: string[];
};
export type YosysModule = {
  attributes?: Record<string, unknown>;
  ports?: Record<string, { direction: string; bits: Bit[] }>;
  cells?: Record<
    string,
    {
      type: string;
      port_directions?: Record<string, string>;
      connections?: Record<string, Bit[]>;
      attributes?: Record<string, unknown>;
      parameters?: Record<string, unknown>;
    }
  >;
  netnames?: Record<
    string,
    {
      bits: Bit[];
      offset?: number;
      upto?: number;
      attributes?: Record<string, unknown>;
    }
  >;
};
export type YosysArtifact = {
  modules: Record<string, YosysModule>;
  creator?: string;
};
export type SynthesisDiagramResponse = {
  logs: string[];
  topModule: string;
  outputName: string;
  nodes: { id: string; label: string; kind: string; detail: string }[];
  edges: { from: string; to: string; label: string }[];
  artifacts?: Partial<
    Record<"functional" | "logic" | "technology", YosysArtifact>
  >;
  sourceFiles?: { name: string; content: string }[];
  projectKey?: string;
  memoryFiles?: { name: string; content: string }[];
  optimizationHistory?: {
    name: string;
    stats: { total: number; instances: number; types: Record<string, number> };
  }[];
  previousBuild?: {
    stages: Record<
      string,
      { total: number; instances: number; types: Record<string, number> }
    >;
  };
  waveform?: { vcd: string; waveformName: string };
};
export type Abstraction = "functional" | "logic" | "technology";

export function sourceLocations(value: unknown): SourceLocation[] {
  if (typeof value !== "string") return [];
  return value.split("|").flatMap((entry) => {
    const match = /^(.*):(\d+)\.(\d+)-(\d+)\.(\d+)$/.exec(entry);
    if (!match || Number(match[2]) < 1 || Number(match[4]) < Number(match[2]))
      return [];
    return [
      {
        file: match[1],
        line: +match[2],
        column: +match[3],
        endLine: +match[4],
        endColumn: +match[5],
      },
    ];
  });
}
export function sourceFile(
  location: SourceLocation,
  files: { name: string; content: string }[],
) {
  // Yosys sources are written under src/<original relative filename>.
  return (
    files.find((file) => `src/${file.name}` === location.file) ??
    files.find((file) => file.name === location.file)
  );
}
export function category(type: string, module = false): string {
  if (module) return "module";
  const t = type.toLowerCase();
  if (/mem|ram|rom/.test(t)) return "memory";
  if (/fsm/.test(t)) return "fsm";
  if (/dff|(^|_)ff|latch|dlatch|sb_dff|trellis_ff/.test(t)) return "register";
  if (/mux/.test(t)) return "mux";
  if (/lut/.test(t)) return "lut";
  if (/add|sub|mul|div|mod|alu|carry|ccu|dsp|neg/.test(t)) return "arithmetic";
  if (/\$(eq|ne|lt|le|gt|ge)|compare/.test(t)) return "compare";
  if (/^(sb_|trellis_|ehx|dp16|ib|ob|bb|pll)/.test(t)) return "primitive";
  return "logic";
}
export function pinRole(name: string): string {
  if (/^(CLK|C|CLOCK|RD_CLK|WR_CLK)$/.test(name)) return "clock";
  if (/^(ARST|SRST|RD_ARST|RD_SRST|R|RESET|RST)$/.test(name)) return "reset";
  if (/^(EN|E|CE|RD_EN|WR_EN)$/.test(name)) return "enable";
  return "data";
}
const bitKey = (bit: Bit) => `${typeof bit}:${bit}`;
export function buildHardwareGraph(
  artifact: YosysArtifact,
  moduleName: string,
): HardwareGraph {
  const module = artifact.modules?.[moduleName];
  if (!module)
    throw new Error(
      `Module ${moduleName} is absent from this synthesis stage.`,
    );
  const nodes: HardwareNode[] = [],
    edges: HardwareEdge[] = [],
    warnings: string[] = [];
  const nets: HardwareNet[] = Object.entries(module.netnames ?? {}).map(
    ([name, net]) => ({
      id: `net:${name}`,
      name,
      bits: net.bits ?? [],
      offset: net.offset ?? 0,
      upto: Boolean(net.upto),
      attributes: net.attributes ?? {},
      sources: sourceLocations(net.attributes?.src),
    }),
  );
  const aliases = new Map<string, string[]>();
  for (const net of nets)
    for (const bit of net.bits) {
      const key = bitKey(bit);
      const names = aliases.get(key) ?? [];
      if (!names.includes(net.name)) names.push(net.name);
      aliases.set(key, names);
    }
  for (const [name, port] of Object.entries(module.ports ?? {})) {
    const net = nets.find((net) => net.name === name);
    nodes.push({
      id: `port:${name}`,
      label: name,
      kind: port.direction,
      detail: `${port.direction} port`,
      category: "port",
      pins: [
        {
          name,
          direction:
            port.direction === "input"
              ? "output"
              : port.direction === "output"
                ? "input"
                : "inout",
          bits: port.bits,
          role: "data",
        },
      ],
      sources: net?.sources ?? [],
      attributes: net?.attributes ?? {},
      parameters: {},
    });
  }
  for (const [name, cell] of Object.entries(module.cells ?? {})) {
    const isModule = Boolean(
      artifact.modules[cell.type] &&
      !artifact.modules[cell.type].attributes?.blackbox,
    );
    const pins = Object.entries(cell.connections ?? {}).map(([pin, bits]) => ({
      name: pin,
      bits,
      direction:
        cell.port_directions?.[pin] ??
        artifact.modules[cell.type]?.ports?.[pin]?.direction ??
        "unknown",
      role: isModule ? "data" : pinRole(pin),
    }));
    if (pins.some((pin) => pin.direction === "unknown"))
      warnings.push(
        `${name}: missing pin direction; unknown connectivity is not inferred.`,
      );
    nodes.push({
      id: `cell:${name}`,
      label: name.startsWith("$") ? cell.type.replace(/^\$/, "") : name,
      kind: "cell",
      detail: cell.type,
      category: category(cell.type, isModule),
      pins,
      sources: sourceLocations(cell.attributes?.src),
      attributes: cell.attributes ?? {},
      parameters: cell.parameters ?? {},
      module: isModule ? cell.type : undefined,
    });
  }
  const drivers = new Map<
      string,
      { node: string; pin: string; index: number }[]
    >(),
    loads = new Map<
      string,
      { node: string; pin: string; index: number; role: string }[]
    >();
  const constants = new Set<string>();
  for (const node of nodes)
    for (const pin of node.pins)
      for (const [index, bit] of pin.bits.entries()) {
        const key = bitKey(bit);
        if (typeof bit === "string" && /^[01xz]$/i.test(bit))
          constants.add(bit);
        if (pin.direction === "output" || pin.direction === "inout") {
          const items = drivers.get(key) ?? [];
          if (
            !items.some(
              (item) =>
                item.node === node.id &&
                item.pin === pin.name &&
                item.index === index,
            )
          )
            items.push({ node: node.id, pin: pin.name, index });
          drivers.set(key, items);
        }
        if (pin.direction === "input" || pin.direction === "inout") {
          const items = loads.get(key) ?? [];
          if (
            !items.some(
              (item) =>
                item.node === node.id &&
                item.pin === pin.name &&
                item.index === index,
            )
          )
            items.push({ node: node.id, pin: pin.name, index, role: pin.role });
          loads.set(key, items);
        }
      }
  for (const bit of constants) {
    const id = `const:${bit}`;
    nodes.push({
      id,
      label: bit,
      kind: "constant",
      detail: "constant",
      category: "constant",
      pins: [{ name: "Y", direction: "output", bits: [bit], role: "data" }],
      sources: [],
      attributes: {},
      parameters: {},
    });
    drivers.set(bitKey(bit), [{ node: id, pin: "Y", index: 0 }]);
  }
  const grouped = new Map<string, HardwareEdge>();
  for (const [key, destinations] of loads) {
    const bit = key.startsWith("number:") ? Number(key.slice(7)) : key.slice(7);
    for (const driver of drivers.get(key) ?? [])
      for (const load of destinations) {
        // Preserve feedback between distinct pins; an inout terminal is not a separate link to itself.
        if (driver.node === load.node && driver.pin === load.pin) continue;
        const id = JSON.stringify([
          driver.node,
          driver.pin,
          load.node,
          load.pin,
        ]);
        let edge = grouped.get(id);
        if (!edge) {
          edge = {
            id,
            from: driver.node,
            fromPort: driver.pin,
            to: load.node,
            toPort: load.pin,
            label: "",
            bits: [],
            width: 0,
            role: load.role,
            connections: [],
          };
          grouped.set(id, edge);
        }
        if (!edge.bits.includes(bit)) edge.bits.push(bit);
        edge.connections.push({
          bit,
          fromIndex: driver.index,
          toIndex: load.index,
        });
      }
  }
  for (const edge of grouped.values()) {
    edge.width = new Set(
      edge.connections.map((connection) => connection.toIndex),
    ).size;
    const names = new Set(
      edge.bits.flatMap((bit) => aliases.get(bitKey(bit)) ?? []),
    );
    edge.label =
      [...names].filter((name) => !name.startsWith("$")).join(", ") ||
      [...names].join(", ") ||
      edge.bits.join(",");
    edges.push(edge);
  }
  return { module: moduleName, nodes, edges, nets, warnings };
}
export function legacyGraph(diagram: SynthesisDiagramResponse): HardwareGraph {
  return {
    module: diagram.topModule,
    nodes: diagram.nodes.map((node) => ({
      ...node,
      category: category(node.detail),
      pins: [],
      sources: [],
      attributes: {},
      parameters: {},
    })),
    edges: diagram.edges.map((edge, i) => ({
      ...edge,
      id: `legacy:${i}`,
      fromPort: "",
      toPort: "",
      bits: [],
      width: 0,
      role: "data",
      connections: [],
    })),
    nets: [],
    warnings: [
      "Legacy result: pin, width, source and hierarchy metadata unavailable. Re-run synthesis for full exploration.",
    ],
  };
}
export function graphIndex(graph: HardwareGraph) {
  const incoming = new Map<string, HardwareEdge[]>(),
    outgoing = new Map<string, HardwareEdge[]>();
  for (const edge of graph.edges) {
    const ins = incoming.get(edge.to) ?? [];
    ins.push(edge);
    incoming.set(edge.to, ins);
    const outs = outgoing.get(edge.from) ?? [];
    outs.push(edge);
    outgoing.set(edge.from, outs);
  }
  return {
    nodes: new Map(graph.nodes.map((node) => [node.id, node])),
    incoming,
    outgoing,
  };
}
/** Structural reachability, not a prediction of values, timing or Boolean influence. */
export function traceGraph(
  graph: HardwareGraph,
  seed: string,
  direction: "forward" | "backward",
  stopAtRegisters = true,
  selectedBit?: Bit,
) {
  const index = graphIndex(graph),
    nodes = new Set<string>(),
    edges = new Set<string>(),
    boundaries = new Set<string>();
  const edgeSeed = graph.edges.find((edge) => edge.id === seed);
  const netSeed = graph.nets.find((net) => net.id === seed);
  const seedEdges = edgeSeed
    ? [edgeSeed]
    : netSeed
      ? graph.edges.filter((edge) =>
          edge.bits.some((bit) =>
            selectedBit === undefined
              ? netSeed.bits.includes(bit)
              : bit === selectedBit,
          ),
        )
      : [];
  const queue = seedEdges.length
    ? seedEdges.map((edge) => (direction === "forward" ? edge.to : edge.from))
    : index.nodes.has(seed)
      ? [seed]
      : [];
  for (const edge of seedEdges) {
    edges.add(edge.id);
    nodes.add(edge.from);
    nodes.add(edge.to);
  }
  const visited = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (visited.has(id)) continue;
    visited.add(id);
    nodes.add(id);
    // Hierarchy is opaque in a module-local graph. Enter the instance to trace
    // its interior instead of assuming that it is combinational.
    const targetCategory = index.nodes.get(id)?.category;
    if (
      (id !== seed || edgeSeed || netSeed) &&
      (targetCategory === "module" ||
        (stopAtRegisters &&
          ["register", "memory", "fsm"].includes(targetCategory ?? "")))
    ) {
      boundaries.add(id);
      continue;
    }
    for (const edge of (direction === "forward"
      ? index.outgoing
      : index.incoming
    ).get(id) ?? []) {
      if (edge.role !== "data" && id !== seed) continue;
      edges.add(edge.id);
      const next = direction === "forward" ? edge.to : edge.from;
      nodes.add(next);
      if (!visited.has(next)) queue.push(next);
    }
  }
  return { nodes, edges, boundaries };
}
export function sourceMatches(
  graph: HardwareGraph,
  files: { name: string; content: string }[],
  fileName: string,
  start: number,
  end: number,
  startColumn = 0,
  endColumn = Number.MAX_SAFE_INTEGER,
) {
  const overlaps = (src: SourceLocation) =>
    sourceFile(src, files)?.name === fileName &&
    (src.line < end || (src.line === end && src.column <= endColumn)) &&
    (src.endLine > start ||
      (src.endLine === start && src.endColumn >= startColumn));
  return [...graph.nodes, ...graph.nets]
    .filter((item) => item.sources.some(overlaps))
    .map((item) => item.id);
}
/** Explicit category summaries preserve membership; they do not assert functional equivalence. */
export function projectGraph(
  graph: HardwareGraph,
  collapsed: Set<string>,
  limit = 800,
  focus?: string,
): HardwareGraph {
  const mapped = new Map<string, string>(),
    groups = new Map<string, HardwareNode>(),
    nodes: HardwareNode[] = [];
  for (const node of graph.nodes) {
    if (collapsed.has(node.category) && node.kind === "cell") {
      const id = `group:${node.category}`;
      mapped.set(node.id, id);
      const group = groups.get(id) ?? {
        ...node,
        id,
        label: node.category,
        kind: "group",
        detail: `${node.category} category`,
        pins: [],
        sources: [],
        attributes: {},
        parameters: {},
        module: undefined,
        members: [],
      };
      group.members!.push(node.id);
      groups.set(id, group);
    } else {
      mapped.set(node.id, node.id);
      nodes.push(node);
    }
  }
  nodes.push(...groups.values());
  if (focus)
    nodes.sort(
      (a, b) =>
        Number(b.id === mapped.get(focus)) - Number(a.id === mapped.get(focus)),
    );
  const shown = nodes.slice(0, limit),
    shownIds = new Set(shown.map((node) => node.id));
  const edges = new Map<string, HardwareEdge>();
  for (const edge of graph.edges) {
    const from = mapped.get(edge.from)!,
      to = mapped.get(edge.to)!;
    if (!shownIds.has(from) || !shownIds.has(to)) continue;
    if (from === to && from.startsWith("group:")) continue;
    if (from === edge.from && to === edge.to) {
      edges.set(edge.id, edge);
      continue;
    }
    const id = JSON.stringify([from, to, edge.role]);
    const current = edges.get(id) ?? {
      ...edge,
      id,
      from,
      to,
      fromPort: "",
      toPort: "",
      label: "Grouped connections",
      bits: [],
      width: 0,
      members: [],
      connections: [],
    };
    current.members!.push(edge.id);
    for (const bit of edge.bits)
      if (!current.bits.includes(bit)) current.bits.push(bit);
    for (const connection of edge.connections) current.connections.push(connection);
    current.width = 0;
    edges.set(id, current);
  }
  return {
    ...graph,
    nodes: shown,
    edges: [...edges.values()],
    warnings: [
      ...graph.warnings,
      ...(nodes.length > limit
        ? [
            `Showing ${limit} of ${nodes.length} expanded elements. Search, collapse categories or increase the detail budget to reveal more; omitted connections remain in the analysis graph.`,
          ]
        : []),
    ],
  };
}
export function reconcileSelection(
  previous: HardwareGraph,
  next: HardwareGraph,
  id: string | null,
): string | null {
  if (!id) return null;
  if (
    next.nodes.some((node) => node.id === id) ||
    next.edges.some((edge) => edge.id === id) ||
    next.nets.some((net) => net.id === id)
  )
    return id;
  const source = previous.nodes.find((node) => node.id === id);
  if (!source?.sources.length) return null;
  const matches = next.nodes.filter((node) =>
    node.sources.some((src) =>
      source.sources.some(
        (old) =>
          old.file === src.file &&
          old.line === src.line &&
          old.endLine === src.endLine,
      ),
    ),
  );
  return matches.length === 1 ? matches[0].id : null;
}
export function stageStats(artifact: YosysArtifact, top: string) {
  const counts: Record<string, number> = {};
  let instances = 0;
  const visit = (name: string, stack: Set<string>) => {
    if (stack.has(name)) return;
    const next = new Set(stack).add(name);
    for (const cell of Object.values(artifact.modules[name]?.cells ?? {})) {
      if (
        artifact.modules[cell.type] &&
        !artifact.modules[cell.type].attributes?.blackbox
      ) {
        instances++;
        visit(cell.type, next);
      } else {
        const key = category(cell.type);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
  };
  visit(top, new Set());
  return {
    counts,
    instances,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
  };
}
export function recordedValue(
  values: { time: number; value: string }[],
  time: number,
) {
  let lo = 0,
    hi = values.length - 1,
    result: string | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid].time <= time) {
      result = values[mid].value;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return result;
}
export function waveformCandidates<
  T extends { id: string; name: string; width: number },
>(net: HardwareNet, signals: T[], instancePath: string) {
  // Require an explicit DUT instance path and exact scoped alias/width. Never short-name match.
  if (
    !instancePath.trim() ||
    net.name.startsWith("$") ||
    net.bits.some((bit) => typeof bit !== "number")
  )
    return [];
  const name = `${instancePath}.${net.name}`;
  return signals.filter(
    (signal) =>
      signal.width === net.bits.length &&
      (signal.name === name ||
        signal.name ===
          `${name} [${net.upto ? net.offset : net.offset + net.bits.length - 1}:${net.upto ? net.offset + net.bits.length - 1 : net.offset}]`),
  );
}

/** Numeric Yosys parameters are binary strings or JSON integers; text parameters stay text. */
export function parameterNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return value;
  if (typeof value !== "string" || !/^[01]+$/.test(value)) return undefined;
  const decoded = BigInt(`0b${value}`);
  return decoded <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(decoded)
    : undefined;
}

/** Wire-declaration provenance highlights real connections/drivers, not invented cell src spans. */
export function sourceAssociations(graph: HardwareGraph, matches: string[]) {
  const ids = new Set(matches),
    nodes = new Set(
      graph.nodes.filter((node) => ids.has(node.id)).map((node) => node.id),
    );
  const bits = new Set(
    graph.nets
      .filter((net) => ids.has(net.id))
      .flatMap((net) => net.bits.filter((bit) => typeof bit === "number")),
  );
  const edges = new Set<string>();
  for (const edge of graph.edges)
    if (edge.bits.some((bit) => typeof bit === "number" && bits.has(bit))) {
      edges.add(edge.id);
      nodes.add(edge.from);
    }
  return { nodes, edges };
}

/** Module-local operator depth, with sequential and opaque module boundaries cut. */
export function logicDepth(graph: HardwareGraph) {
  const index = graphIndex(graph);
  const boundary = (node: HardwareNode) =>
    !!node.module ||
    ["register", "memory", "fsm", "primitive"].includes(node.category);
  const pending = new Map<string, number>();
  const depths = new Map<string, number>();
  const inputDepth = new Map<string, number>();
  const queue: string[] = [];
  for (const node of graph.nodes) {
    const count = boundary(node)
      ? 0
      : (index.incoming.get(node.id) ?? []).filter(
          (edge) => edge.role === "data",
        ).length;
    pending.set(node.id, count);
    if (!count) queue.push(node.id);
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i],
      node = index.nodes.get(id)!;
    const depth = boundary(node)
      ? 0
      : (inputDepth.get(id) ?? 0) + (node.kind === "cell" ? 1 : 0);
    depths.set(id, depth);
    for (const edge of index.outgoing.get(id) ?? []) {
      if (edge.role !== "data") continue;
      const target = index.nodes.get(edge.to);
      if (!target) continue;
      inputDepth.set(
        target.id,
        Math.max(inputDepth.get(target.id) ?? 0, depth),
      );
      if (boundary(target)) continue;
      const left = (pending.get(target.id) ?? 0) - 1;
      pending.set(target.id, left);
      if (left === 0) queue.push(target.id);
    }
  }
  let max = 0;
  for (const value of depths.values()) max = Math.max(max, value);
  return { depths, max, unresolved: graph.nodes.length - depths.size };
}

/** Suggest scopes using exact names/widths only; selection remains explicit. */
export function waveformScopes<
  T extends { id: string; name: string; width: number },
>(graph: HardwareGraph, signals: T[]) {
  const paths = new Set<string>();
  for (const signal of signals) {
    const name = signal.name.replace(/ \[\d+:\d+\]$/, "");
    const split = name.lastIndexOf(".");
    if (split > 0) paths.add(name.slice(0, split));
  }
  return [...paths]
    .map((path) => ({
      path,
      matches: graph.nets.filter(
        (net) => waveformCandidates(net, signals, path).length === 1,
      ).length,
    }))
    .filter((scope) => scope.matches > 0)
    .sort((a, b) => b.matches - a.matches || a.path.localeCompare(b.path));
}

/** Reconstruct destination lanes from numeric identities, including slices/reversals. */
export function connectionValue(
  edge: HardwareEdge,
  bits: Map<number, { value: string; changed: boolean }>,
) {
  if (!edge.width || edge.connections.length !== edge.width) return undefined;
  const lanes = new Map<number, { value: string; changed: boolean }>();
  for (const connection of edge.connections) {
    if (typeof connection.bit !== "number" || lanes.has(connection.toIndex))
      return undefined;
    const value = bits.get(connection.bit);
    if (!value) return undefined;
    lanes.set(connection.toIndex, value);
  }
  const ordered = [...lanes.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, value]) => value);
  return {
    value: ordered.map((lane) => lane.value).join(""),
    changed: ordered.some((lane) => lane.changed),
  };
}
