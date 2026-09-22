import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { SynthesisDiagramResponse } from "../pages/dashboard/SynthesisSection";

type Viewport = { x: number; y: number; scale: number };
type LayoutNode = SynthesisDiagramResponse["nodes"][number] & {
  x: number;
  y: number;
  width: number;
  height: number;
};
type LayoutEdge = {
  id: string;
  path: string;
  count: number;
  labels: string[];
};
type SchematicLayout = {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
};

const elk = new ELK();
const MIN_SCALE = 0.04;
const MAX_SCALE = 4;
const NAVIGATION_SENSITIVITY_KEY = "allora-schematic-navigation-sensitivity";
const DEFAULT_NAVIGATION_SENSITIVITY = 1.35;

export default function HardwareSchematicCanvas({
  diagram,
}: {
  diagram: SynthesisDiagramResponse;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<SchematicLayout | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [layout, setLayout] = useState<SchematicLayout | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [navigationSensitivity, setNavigationSensitivity] = useState(
    readNavigationSensitivity,
  );

  useEffect(() => {
    window.localStorage.setItem(
      NAVIGATION_SENSITIVITY_KEY,
      String(navigationSensitivity),
    );
  }, [navigationSensitivity]);

  const fitToWindow = useCallback(
    (nextLayout?: SchematicLayout | null) => {
      const host = hostRef.current;
      const resolvedLayout = nextLayout ?? layoutRef.current;
      if (!host || !resolvedLayout) return;
      const padding = 64;
      const scale = clamp(
        Math.min(
          (host.clientWidth - padding * 2) / resolvedLayout.width,
          (host.clientHeight - padding * 2) / resolvedLayout.height,
          1.25,
        ),
        MIN_SCALE,
        MAX_SCALE,
      );
      setViewport({
        scale,
        x: (host.clientWidth - resolvedLayout.width * scale) / 2,
        y: (host.clientHeight - resolvedLayout.height * scale) / 2,
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    layoutRef.current = null;
    setLayout(null);
    createElkLayout(diagram).then((nextLayout) => {
      if (cancelled) return;
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
      requestAnimationFrame(() => fitToWindow(nextLayout));
    });
    return () => {
      cancelled = true;
    };
  }, [diagram, fitToWindow]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => fitToWindow());
    observer.observe(host);
    return () => observer.disconnect();
  }, [fitToWindow]);

  const selectedNode = useMemo(
    () => layout?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [layout, selectedNodeId],
  );

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const bounds = hostRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const cursorX = clientX - bounds.left;
    const cursorY = clientY - bounds.top;
    setViewport((current) => {
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      return {
        scale,
        x: cursorX - (cursorX - current.x) * (scale / current.scale),
        y: cursorY - (cursorY - current.y) * (scale / current.scale),
      };
    });
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomAt(
      event.clientX,
      event.clientY,
      Math.exp(-event.deltaY * 0.0014 * navigationSensitivity),
    );
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    setIsDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setViewport((current) => ({
      ...current,
      x:
        drag.originX +
        (event.clientX - drag.startX) * navigationSensitivity,
      y:
        drag.originY +
        (event.clientY - drag.startY) * navigationSensitivity,
    }));
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
  }

  return (
    <div className="schematic-workspace">
      <div className="schematic-topbar">
        <div>
          <span className="schematic-eyebrow">Technology-independent schematic</span>
          <strong>{diagram.topModule}</strong>
          <small>
            {diagram.nodes.length} elements · {diagram.edges.length} nets
          </small>
        </div>
        <div className="schematic-help">Drag to pan · Wheel to zoom · Double-click to fit</div>
        <div className="schematic-controls" aria-label="Schematic zoom controls">
          <label className="schematic-sensitivity">
            <span>Sensitivity</span>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={navigationSensitivity}
              onChange={(event) =>
                setNavigationSensitivity(Number(event.target.value))
              }
            />
            <output className="schematic-sensitivity-value">
              {navigationSensitivity.toFixed(1)}×
            </output>
          </label>
          <button type="button" onClick={() => zoomFromCenter(1.25, hostRef, setViewport)}>+</button>
          <button type="button" onClick={() => zoomFromCenter(0.8, hostRef, setViewport)}>−</button>
          <button type="button" onClick={() => fitToWindow()}>Fit</button>
          <output className="schematic-zoom-value">
            {Math.round(viewport.scale * 100)}%
          </output>
        </div>
      </div>

      <div
        ref={hostRef}
        className={`schematic-canvas${isDragging ? " is-dragging" : ""}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onDoubleClick={() => fitToWindow()}
      >
        {!layout ? (
          <div className="schematic-loading">Laying out schematic…</div>
        ) : (
          <svg
            className="schematic-svg"
            width="100%"
            height="100%"
            role="img"
            aria-label={`Interactive hardware schematic for ${diagram.topModule}`}
          >
            <defs>
              <pattern id="schematic-grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(100,116,139,0.1)" strokeWidth="1" />
              </pattern>
              <pattern id="schematic-grid" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect width="100" height="100" fill="url(#schematic-grid-small)" />
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(100,116,139,0.16)" strokeWidth="1" />
              </pattern>
              <filter id="schematic-node-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.14" />
              </filter>
            </defs>
            <rect width="100%" height="100%" fill="url(#schematic-grid)" />
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
              <g className="schematic-nets">
                {layout.edges.map((edge) => (
                  <path
                    key={edge.id}
                    d={edge.path}
                    className={edge.count > 1 ? "schematic-net bus" : "schematic-net"}
                  >
                    <title>{edge.labels.join(", ")}</title>
                  </path>
                ))}
              </g>
              <g className="schematic-elements">
                {layout.nodes.map((node) => (
                  <g
                    key={node.id}
                    transform={`translate(${node.x} ${node.y})`}
                    className={`schematic-element${selectedNodeId === node.id ? " selected" : ""}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <SchematicSymbol node={node} />
                    <title>{`${node.label} — ${node.detail}`}</title>
                  </g>
                ))}
              </g>
            </g>
          </svg>
        )}

        {selectedNode ? (
          <aside
            className="schematic-inspector"
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedNodeId(null);
              }}
              aria-label="Close inspector"
            >
              ×
            </button>
            <span>Selected element</span>
            <strong>{selectedNode.label}</strong>
            <small>{friendlyCellName(selectedNode.detail)}</small>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

async function createElkLayout(
  diagram: SynthesisDiagramResponse,
): Promise<SchematicLayout> {
  const aggregatedEdges = aggregateEdges(diagram.edges);
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=42,left=48,bottom=42,right=48]",
      "elk.spacing.nodeNode": "34",
      "elk.layered.spacing.nodeNodeBetweenLayers": "82",
      "elk.layered.spacing.edgeNodeBetweenLayers": "28",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.thoroughness": "12",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    },
    children: diagram.nodes.map((node) => {
      const size = symbolSize(node.kind, node.label, node.detail);
      return { id: node.id, width: size.width, height: size.height };
    }),
    edges: aggregatedEdges.map((edge, index) => ({
      id: `edge-${index}`,
      sources: [edge.from],
      targets: [edge.to],
    })),
  };

  const result = await elk.layout(graph);
  const sourceNodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const nodes = (result.children ?? []).flatMap((node) => {
    const source = sourceNodes.get(node.id);
    if (!source) return [];
    return [{
      ...source,
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width ?? 96,
      height: node.height ?? 62,
    }];
  });
  const edges = (result.edges ?? []).map((edge, index) => ({
    id: edge.id,
    path: edgePath(edge),
    count: aggregatedEdges[index]?.count ?? 1,
    labels: aggregatedEdges[index]?.labels ?? [],
  }));

  return {
    width: result.width ?? 1200,
    height: result.height ?? 800,
    nodes,
    edges,
  };
}

function edgePath(edge: ElkExtendedEdge) {
  return (edge.sections ?? [])
    .map((section) => {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      return points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");
    })
    .join(" ");
}

function SchematicSymbol({ node }: { node: LayoutNode }) {
  const symbol = classifySymbol(node.label, node.detail, node.kind);
  const w = node.width;
  const h = node.height;
  const cy = h / 2;
  const stroke = node.kind === "input"
    ? "#2563eb"
    : node.kind === "output"
      ? "#0f766e"
      : node.kind === "constant"
        ? "#ea580c"
        : "#334155";
  const fill = node.kind === "input"
    ? "#dbeafe"
    : node.kind === "output"
      ? "#ccfbf1"
      : node.kind === "constant"
        ? "#ffedd5"
        : "#ffffff";
  const common = { fill, stroke, strokeWidth: 2 };

  if (symbol.shape === "port") {
    const direction = node.kind === "output" ? "output" : "input";
    const d = direction === "output"
      ? `M 0 0 H ${w - 14} L ${w} ${cy} L ${w - 14} ${h} H 0 Z`
      : `M 14 0 H ${w} V ${h} H 14 L 0 ${cy} Z`;
    return (
      <>
        <path d={d} {...common} filter="url(#schematic-node-shadow)" />
        <text x={w / 2} y={cy + 5} textAnchor="middle" className="schematic-port-label">
          {truncate(node.label, 18)}
        </text>
      </>
    );
  }

  if (symbol.shape === "not" || symbol.shape === "buffer") {
    return (
      <>
        <path d={`M 8 8 L ${w - 14} ${cy} L 8 ${h - 8} Z`} {...common} />
        {symbol.shape === "not" ? <circle cx={w - 7} cy={cy} r={6} fill="#fff" stroke={stroke} strokeWidth={2} /> : null}
      </>
    );
  }

  if (symbol.shape === "and" || symbol.shape === "nand") {
    const flat = w * 0.46;
    return (
      <>
        <path d={`M 6 7 H ${flat} A ${w * 0.42} ${cy - 7} 0 0 1 ${flat} ${h - 7} H 6 Z`} {...common} />
        {symbol.shape === "nand" ? <circle cx={w - 6} cy={cy} r={6} fill="#fff" stroke={stroke} strokeWidth={2} /> : null}
      </>
    );
  }

  if (["or", "nor", "xor", "xnor"].includes(symbol.shape)) {
    const bubbled = symbol.shape === "nor" || symbol.shape === "xnor";
    const xor = symbol.shape === "xor" || symbol.shape === "xnor";
    const right = bubbled ? w - 13 : w - 5;
    return (
      <>
        {xor ? <path d={`M 1 7 Q ${w * 0.27} ${cy} 1 ${h - 7}`} fill="none" stroke={stroke} strokeWidth={2} /> : null}
        <path d={`M 7 7 Q ${w * 0.3} ${cy} 7 ${h - 7} Q ${w * 0.58} ${h - 7} ${right} ${cy} Q ${w * 0.58} 7 7 7`} {...common} />
        {bubbled ? <circle cx={w - 7} cy={cy} r={6} fill="#fff" stroke={stroke} strokeWidth={2} /> : null}
      </>
    );
  }

  if (symbol.shape === "mux") {
    return (
      <>
        <path d={`M 14 4 H ${w - 14} L ${w - 5} ${h - 4} H 5 Z`} {...common} filter="url(#schematic-node-shadow)" />
        <text x={w / 2} y={cy + 5} textAnchor="middle" className="schematic-symbol-mark">MUX</text>
        <text x={w / 2} y={h + 13} textAnchor="middle" className="schematic-pin-hint">S</text>
      </>
    );
  }

  if (symbol.shape === "register") {
    return (
      <>
        <rect x={3} y={3} width={w - 6} height={h - 6} rx={3} {...common} filter="url(#schematic-node-shadow)" />
        <text x={14} y={cy - 5} className="schematic-pin-hint">D</text>
        <text x={w - 17} y={cy - 5} className="schematic-pin-hint">Q</text>
        <path d={`M 3 ${h - 19} L 13 ${h - 13} L 3 ${h - 7}`} fill="none" stroke={stroke} strokeWidth={2} />
        <text x={w / 2} y={cy + 6} textAnchor="middle" className="schematic-symbol-mark">FF</text>
      </>
    );
  }

  if (symbol.shape === "arithmetic" || symbol.shape === "compare") {
    return (
      <>
        <circle cx={w / 2} cy={cy} r={Math.min(w, h) / 2 - 4} {...common} filter="url(#schematic-node-shadow)" />
        <text x={w / 2} y={cy + 8} textAnchor="middle" className="schematic-operator-mark">{symbol.mark}</text>
      </>
    );
  }

  return (
    <>
      <rect x={3} y={3} width={w - 6} height={h - 6} rx={7} {...common} filter="url(#schematic-node-shadow)" />
      <text x={w / 2} y={cy + 4} textAnchor="middle" className="schematic-symbol-mark">
        {truncate(symbol.mark, 9)}
      </text>
    </>
  );
}

function classifySymbol(label: string, detail: string, kind: string) {
  if (kind !== "cell") return { shape: "port", mark: label };
  const value = `${label} ${detail}`.toLowerCase();
  if (/xnor/.test(value)) return { shape: "xnor", mark: "" };
  if (/xor/.test(value)) return { shape: "xor", mark: "" };
  if (/nand/.test(value)) return { shape: "nand", mark: "" };
  if (/nor/.test(value)) return { shape: "nor", mark: "" };
  if (/(^|[^a-z])not|logic_not|_inv|\binv\b/.test(value)) return { shape: "not", mark: "" };
  if (/\bbuf\b|_buf/.test(value)) return { shape: "buffer", mark: "" };
  if (/(^|[^a-z])and|logic_and/.test(value)) return { shape: "and", mark: "" };
  if (/(^|[^a-z])or|logic_or/.test(value)) return { shape: "or", mark: "" };
  if (/mux|pmux/.test(value)) return { shape: "mux", mark: "MUX" };
  if (/dff|adff|sdff|ff|latch/.test(value)) return { shape: "register", mark: "FF" };
  if (/add|alu|ccu2|carry/.test(value)) return { shape: "arithmetic", mark: "+" };
  if (/sub|neg/.test(value)) return { shape: "arithmetic", mark: "−" };
  if (/mul/.test(value)) return { shape: "arithmetic", mark: "×" };
  if (/eq|equiv/.test(value)) return { shape: "compare", mark: "=" };
  if (/lt|less/.test(value)) return { shape: "compare", mark: "<" };
  if (/gt|greater/.test(value)) return { shape: "compare", mark: ">" };
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

function aggregateEdges(edges: SynthesisDiagramResponse["edges"]) {
  const grouped = new Map<string, { from: string; to: string; labels: string[]; count: number }>();
  for (const edge of edges) {
    const key = `${edge.from}=>${edge.to}`;
    const current = grouped.get(key);
    if (current) {
      current.count += 1;
      if (!current.labels.includes(edge.label)) current.labels.push(edge.label);
    } else {
      grouped.set(key, { from: edge.from, to: edge.to, labels: [edge.label], count: 1 });
    }
  }
  return [...grouped.values()];
}

function zoomFromCenter(
  factor: number,
  hostRef: { current: HTMLDivElement | null },
  setViewport: (updater: (current: Viewport) => Viewport) => void,
) {
  const host = hostRef.current;
  if (!host) return;
  const x = host.clientWidth / 2;
  const y = host.clientHeight / 2;
  setViewport((current) => {
    const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
    return {
      scale,
      x: x - (x - current.x) * (scale / current.scale),
      y: y - (y - current.y) * (scale / current.scale),
    };
  });
}

function friendlyCellName(value: string) {
  return value
    .replace(/^[$\\]+/, "")
    .replaceAll("_TECHMAP_REPLACE_", "")
    .replaceAll("_", " ")
    .trim()
    .toUpperCase() || "LOGIC";
}

function truncate(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readNavigationSensitivity() {
  const stored = Number(
    window.localStorage.getItem(NAVIGATION_SENSITIVITY_KEY),
  );
  return Number.isFinite(stored)
    ? clamp(stored, 0.5, 2.5)
    : DEFAULT_NAVIGATION_SENSITIVITY;
}
