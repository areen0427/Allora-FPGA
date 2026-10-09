import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type {
  HardwareNode,
  HardwareGraph,
  HardwareEdge,
} from "./synthesisGraph";
export type LayoutNode = HardwareNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  layoutPins: {
    name: string;
    x: number;
    y: number;
    direction: string;
    width: number;
    role: string;
  }[];
};
type LayoutEdge = HardwareEdge & {
  x: number;
  y: number;
  bounds: { x: number; y: number; width: number; height: number };
  id: string;
  path: string;
  count: number;
  labels: string[];
  labelVisible: boolean;
};
export type SchematicLayout = {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  notice?: string;
};

export async function createElkLayout(
  diagram: HardwareGraph,
  elk: { layout: (graph: ElkNode) => Promise<ElkNode> },
): Promise<SchematicLayout> {
  const aggregatedEdges = diagram.edges;
  const sourceNodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=42,left=48,bottom=42,right=48]",
      "elk.spacing.nodeNode": "52",
      "elk.layered.spacing.nodeNodeBetweenLayers": "130",
      "elk.layered.spacing.edgeNodeBetweenLayers": "28",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.thoroughness": "12",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    },
    children: diagram.nodes.map((node) => {
      const size = symbolSize(node.kind, node.label, node.detail);
      return {
        id: node.id,
        width: size.width,
        height: Math.max(size.height, node.pins.length * 22 + 28),
        layoutOptions: {
          "elk.portConstraints": "FIXED_ORDER",
          "elk.portLabels.placement": "OUTSIDE",
        },
        ports: node.pins.map((pin) => ({
          id: JSON.stringify([node.id, pin.name]),
          width: 4,
          height: 4,
          labels: [
            {
              id: JSON.stringify([node.id, pin.name, "label"]),
              text: pin.name,
              width:
                (pin.name.length +
                  (pin.bits.length > 1
                    ? String(pin.bits.length).length + 2
                    : 0)) *
                  6 +
                14,
              height: 14,
            },
          ],
          layoutOptions: {
            "elk.port.side":
              pin.direction === "output"
                ? "EAST"
                : pin.direction === "inout"
                  ? "SOUTH"
                  : "WEST",
          },
        })),
      };
    }),
    edges: aggregatedEdges.map((edge, index) => ({
      id: `edge-${index}`,
      labels: [
        {
          id: `label-${index}`,
          text: edge.label,
          width: Math.min(26, edge.label.length) * 6 + 64,
          height: 18,
          layoutOptions: { "elk.edgeLabels.placement": "CENTER" },
        },
      ],
      sources: [
        sourceNodes
          .get(edge.from)
          ?.pins.some((pin) => pin.name === edge.fromPort)
          ? JSON.stringify([edge.from, edge.fromPort])
          : edge.from,
      ],
      targets: [
        sourceNodes.get(edge.to)?.pins.some((pin) => pin.name === edge.toPort)
          ? JSON.stringify([edge.to, edge.toPort])
          : edge.to,
      ],
    })),
  };

  let result: ElkNode;
  let notice: string | undefined;
  try {
    result = await elk.layout(graph);
  } catch (error) {
    // ELK's recursive layered heuristics can exhaust the worker stack on
    // mapped graphs. Retry with simpler heuristics on a fresh graph object.
    if (!/maximum call stack|stack overflow/i.test(String(error))) throw error;
    try {
      const retry = structuredClone(graph);
      retry.layoutOptions = {
        ...retry.layoutOptions,
        "elk.layered.nodePlacement.strategy": "SIMPLE",
        "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
        "elk.layered.thoroughness": "1",
      };
      result = await elk.layout(retry);
    } catch (retryError) {
      if (!/maximum call stack|stack overflow/i.test(String(retryError)))
        throw retryError;
      return createBasicLayout(diagram);
    }
    notice = "Simplified routing is active for this design.";
  }
  const nodes = (result.children ?? []).flatMap((node) => {
    const source = sourceNodes.get(node.id);
    if (!source) return [];
    return [
      {
        ...source,
        x: node.x ?? 0,
        y: node.y ?? 0,
        width: node.width ?? 96,
        height: node.height ?? 62,
        layoutPins: (node.ports ?? []).map((port) => {
          const pin = source.pins.find(
            (pin) => JSON.stringify([source.id, pin.name]) === port.id,
          )!;
          return {
            name: pin.name,
            x: (port.x ?? 0) + 2,
            y: (port.y ?? 0) + 2,
            direction: pin.direction,
            width: pin.bits.length,
            role: pin.role,
          };
        }),
      },
    ];
  });
  const edges = (result.edges ?? []).map((edge) => {
    const source = aggregatedEdges[Number(edge.id.slice(5))];
    const points = (edge.sections ?? []).flatMap((section) => [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]);
    const bounds = pointBounds(points);
    const label = edge.labels?.[0];
    return {
      ...source,
      path: edgePath(edge),
      count: source.width,
      labels: [source.label],
      x: (label?.x ?? 0) + (label?.width ?? 0) / 2,
      y: (label?.y ?? 0) + 12,
      labelVisible: !!label && label.x !== undefined && label.y !== undefined,
      bounds,
    };
  });

  return {
    width: result.width ?? 1200,
    height: result.height ?? 800,
    notice,
    nodes,
    edges,
  };
}

function pointBounds(points: { x: number; y: number }[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return points.length
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : { x: 0, y: 0, width: 0, height: 0 };
}

/** Nonrecursive last resort: retain every displayed cell, pin and connection.
 * Basic routing may cross other circuitry; selection/inspector still expose
 * exact connectivity, and labels appear in the inspector instead of overlapping.
 */
function createBasicLayout(diagram: HardwareGraph): SchematicLayout {
  const columns = Math.max(1, Math.ceil(Math.sqrt(diagram.nodes.length)));
  let rowHeight = 140,
    columnWidth = 320;
  for (const node of diagram.nodes) {
    const size = symbolSize(node.kind, node.label, node.detail);
    rowHeight = Math.max(
      rowHeight,
      node.pins.length * 22 + 100,
      size.height + 80,
    );
    columnWidth = Math.max(columnWidth, size.width + 160);
  }
  const nodes: LayoutNode[] = diagram.nodes.map((node, index) => {
    const size = symbolSize(node.kind, node.label, node.detail);
    const height = Math.max(size.height, node.pins.length * 22 + 28);
    const input = node.pins.filter((pin) => pin.direction !== "output");
    const output = node.pins.filter((pin) => pin.direction === "output");
    return {
      ...node,
      ...size,
      height,
      x: 80 + (index % columns) * columnWidth,
      y: 60 + Math.floor(index / columns) * rowHeight,
      layoutPins: node.pins.map((pin) => {
        const side = pin.direction === "output" ? output : input;
        return {
          name: pin.name,
          direction: pin.direction,
          width: pin.bits.length,
          role: pin.role,
          x: pin.direction === "output" ? size.width : 0,
          y: ((side.indexOf(pin) + 1) * height) / (side.length + 1),
        };
      }),
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: LayoutEdge[] = diagram.edges.map((edge, index) => {
    const from = byId.get(edge.from)!,
      to = byId.get(edge.to)!;
    const start = from.layoutPins.find((pin) => pin.name === edge.fromPort);
    const end = to.layoutPins.find((pin) => pin.name === edge.toPort);
    const a = {
      x: from.x + (start?.x ?? from.width),
      y: from.y + (start?.y ?? from.height / 2),
    };
    const b = { x: to.x + (end?.x ?? 0), y: to.y + (end?.y ?? to.height / 2) };
    const lane = 20 + (index % 8) * 4;
    const points =
      a.x < b.x
        ? [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b]
        : [
            a,
            { x: a.x + lane, y: a.y },
            { x: a.x + lane, y: from.y - lane },
            { x: b.x - lane, y: from.y - lane },
            { x: b.x - lane, y: b.y },
            b,
          ];
    return {
      ...edge,
      path: points
        .map((point, i) => `${i ? "L" : "M"} ${point.x} ${point.y}`)
        .join(" "),
      bounds: pointBounds(points),
      count: edge.width,
      labels: [edge.label],
      x: 0,
      y: 0,
      labelVisible: false,
    };
  });
  return {
    width: columns * columnWidth + 160,
    height: Math.ceil(nodes.length / columns) * rowHeight + 120,
    nodes,
    edges,
    notice:
      "Basic routing is active because automatic layout exceeded its stack limit. Connections are preserved; inspect a wire for its label.",
  };
}

function edgePath(edge: ElkExtendedEdge) {
  return (edge.sections ?? [])
    .map((section) => {
      const points = [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ];
      return points
        .map(
          (point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
        )
        .join(" ");
    })
    .join(" ");
}

export function classifySymbol(label: string, detail: string, kind: string) {
  if (["input", "output", "inout", "constant"].includes(kind))
    return { shape: "port", mark: label };
  const value = detail.toLowerCase();
  if (/xnor/.test(value)) return { shape: "xnor", mark: "" };
  if (/xor/.test(value)) return { shape: "xor", mark: "" };
  if (/nand/.test(value)) return { shape: "nand", mark: "" };
  if (/nor/.test(value)) return { shape: "nor", mark: "" };
  if (/(^|[^a-z])not|logic_not|_inv|\binv\b/.test(value))
    return { shape: "not", mark: "" };
  if (/\bbuf\b|_buf/.test(value)) return { shape: "buffer", mark: "" };
  if (/(^|[^a-z])and|logic_and/.test(value)) return { shape: "and", mark: "" };
  if (/(^|[^a-z])or|logic_or/.test(value)) return { shape: "or", mark: "" };
  if (/mux|pmux/.test(value)) return { shape: "mux", mark: "MUX" };
  if (/dff|adff|sdff|(^|_)ff|latch/.test(value))
    return { shape: "register", mark: "FF" };
  if (/add|alu|ccu2|carry/.test(value))
    return { shape: "arithmetic", mark: "+" };
  if (/sub|neg/.test(value)) return { shape: "arithmetic", mark: "−" };
  if (/mul/.test(value)) return { shape: "arithmetic", mark: "×" };
  if (/\$(ne|nex)/.test(value)) return { shape: "compare", mark: "≠" };
  if (/\$le$/.test(value)) return { shape: "compare", mark: "≤" };
  if (/\$ge$/.test(value)) return { shape: "compare", mark: "≥" };
  if (/eq|equiv/.test(value)) return { shape: "compare", mark: "=" };
  if (/lt|less/.test(value)) return { shape: "compare", mark: "<" };
  if (/gt|greater/.test(value)) return { shape: "compare", mark: ">" };
  if (/fsm/.test(value)) return { shape: "block", mark: "FSM" };
  if (/lut/.test(value)) return { shape: "block", mark: "LUT" };
  if (/mem|ram|rom/.test(value)) return { shape: "block", mark: "MEM" };
  return { shape: "block", mark: friendlyCellName(label) };
}

function symbolSize(kind: string, label: string, detail: string) {
  if (kind !== "cell") return { width: 150, height: 52 };
  const symbol = classifySymbol(label, detail, kind);
  if (symbol.shape === "register") return { width: 82, height: 72 };
  if (symbol.shape === "block") return { width: 98, height: 60 };
  return { width: 86, height: 58 };
}

function friendlyCellName(value: string) {
  return (
    value
      .replace(/^[$\\]+/, "")
      .replaceAll("_TECHMAP_REPLACE_", "")
      .replaceAll("_", " ")
      .trim()
      .toUpperCase() || "LOGIC"
  );
}
