import { useEffect, useMemo, useState } from "react";
import type { BoardDefinition } from "../../data/boards";
import { getBoardCapabilities } from "../../data/boardCapabilities";
import { hasTauriInvoke, invokeTauri } from "../../lib/tauri";
import InfoCard, { InfoRow } from "./InfoCard";
import type { ProjectFile } from "./types";
import { findTopModule, isHdlFile, isTestbenchFile } from "../../hooks/utils";

type SynthesisStatus = "idle" | "ready" | "blocked" | "unsupported";

type SynthesisDiagramNode = {
  id: string;
  label: string;
  kind: "input" | "output" | "cell" | "constant" | string;
  detail: string;
};

type SynthesisDiagramEdge = {
  from: string;
  to: string;
  label: string;
};

type AggregatedDiagramEdge = {
  from: string;
  to: string;
  labels: string[];
  count: number;
};

type SynthesisDiagramResponse = {
  logs: string[];
  topModule: string;
  outputName: string;
  nodes: SynthesisDiagramNode[];
  edges: SynthesisDiagramEdge[];
};

type SynthesisSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
  topLevelFileName: string | null;
  onTopLevelFileNameChange: (fileName: string | null) => void;
};

export default function SynthesisSection({
  board,
  files,
  projectName,
  topLevelFileName,
  onTopLevelFileNameChange,
}: SynthesisSectionProps) {
  const [log, setLog] = useState<string[]>([]);
  const [diagram, setDiagram] = useState<SynthesisDiagramResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showAdvancedLog, setShowAdvancedLog] = useState(false);

  const hdlFiles = files.filter((file) => isHdlFile(file.name));
  const selectedTopLevelFile = topLevelFileName
    ? (hdlFiles.find((file) => file.name === topLevelFileName) ?? null)
    : null;
  const topModule = useMemo(
    () => findTopModule(selectedTopLevelFile ? [selectedTopLevelFile] : []),
    [selectedTopLevelFile],
  );
  // Synthesize only the design sources: the selected top level always comes
  // first, and testbench files (which contain `$finish`/`initial` blocks that
  // Yosys rejects) are excluded.
  const synthesisFiles = useMemo(() => {
    const designFiles = hdlFiles.filter(
      (file) =>
        file.name === topLevelFileName || !isTestbenchFile(file, topModule),
    );
    if (!selectedTopLevelFile) return designFiles;
    return [
      selectedTopLevelFile,
      ...designFiles.filter((file) => file.name !== selectedTopLevelFile.name),
    ];
  }, [hdlFiles, topLevelFileName, topModule, selectedTopLevelFile]);
  const capabilities = getBoardCapabilities(board);
  const status: SynthesisStatus = !capabilities.synthesisDiagram.supported
    ? "unsupported"
    : hdlFiles.length > 0
      ? "ready"
      : "blocked";
  const outputName = sanitizeName(projectName || "allora_project");
  const logSummary = log.find((line) => line.trim().length > 0) ?? "";

  useEffect(() => {
    if (hdlFiles.length === 0) {
      onTopLevelFileNameChange(null);
      return;
    }

    if (
      !topLevelFileName ||
      !hdlFiles.some((file) => file.name === topLevelFileName)
    ) {
      onTopLevelFileNameChange(hdlFiles[0]?.name ?? null);
    }
  }, [hdlFiles, onTopLevelFileNameChange, topLevelFileName]);

  async function runSynthesis() {
    if (status === "unsupported") {
      setDiagram(null);
      setLog(["[synthesis] Unsupported", capabilities.synthesisDiagram.detail]);
      return;
    }

    if (status === "blocked") {
      setDiagram(null);
      setLog([
        "[synthesis] Blocked",
        "No HDL files found. Create or import a .v or .sv file first.",
      ]);
      return;
    }

    if (!hasTauriInvoke()) {
      setDiagram(null);
      setLog([
        "[synthesis] Tauri runtime unavailable",
        "Launch the desktop app to generate a real synthesized hardware diagram.",
      ]);
      return;
    }

    setIsRunning(true);
    setDiagram(null);
    setLog([
      "[synthesis] Starting real synthesis run",
      `Target board: ${board.name}`,
      `Device: ${board.fpgaId}`,
      `Input files: ${synthesisFiles.map((file) => file.name).join(", ")}`,
    ]);

    try {
      const result = await invokeTauri<SynthesisDiagramResponse>(
        "generate_synthesis_diagram",
        {
          request: {
            projectName,
            boardName: board.name,
            boardFamily: board.family,
            fpgaId: board.fpgaId,
            synthesisFlow: board.synthesisFlow,
            topModule,
            files: synthesisFiles,
          },
        },
      );

      setDiagram(result);
      setLog(result.logs);
      setShowAdvancedLog(false);
    } catch (error) {
      setDiagram(null);
      setLog(["[synthesis] Failed", getErrorMessage(error)]);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 205px",
        gap: "22px",
        alignItems: "start",
        minWidth: 0,
      }}
    >
      <InfoCard title="Synthesis">
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "16px",
            lineHeight: 1.55,
          }}
        >
          Run real synthesis through the local Tauri tool runner and inspect the
          generated hardware graph.
        </p>

        <div
          className="dashboard-glass-card synthesis-control-bar"
          style={{
            marginTop: "24px",
          }}
        >
          <label className="synthesis-top-level-field">
            <span>Top level</span>
            <select
              className="synthesis-top-level-select"
              value={topLevelFileName ?? ""}
              onChange={(event) =>
                onTopLevelFileNameChange(event.target.value || null)
              }
            >
              {hdlFiles.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="primary-action synthesis-generate-button"
            type="button"
            onClick={runSynthesis}
            disabled={status !== "ready" || isRunning}
          >
            {isRunning ? "Generating Diagram..." : "Generate Hardware Diagram"}
          </button>

          {log.length > 0 ? (
            <button
              className="synthesis-secondary-button"
              type="button"
              onClick={() => setShowAdvancedLog((current) => !current)}
            >
              {showAdvancedLog ? "Hide Advanced Log" : "Show Advanced Log"}
            </button>
          ) : null}
        </div>

        <div
          style={{
            marginTop: "24px",
            border: "1px solid #e2e8f0",
            borderRadius: "20px",
            background: "#f8fafc",
            minHeight: "420px",
            padding: "20px",
          }}
        >
          {diagram ? (
            <HardwareDiagram diagram={diagram} />
          ) : (
            <div
              style={{
                minHeight: "378px",
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                color: "#64748b",
                padding: "28px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  No synthesized diagram yet
                </div>
                <div style={{ marginTop: "10px", lineHeight: 1.6 }}>
                  {status === "unsupported"
                    ? capabilities.synthesisDiagram.detail
                    : "Run synthesis to generate the actual hardware structure for the current HDL files."}
                </div>
              </div>
            </div>
          )}
        </div>

        {log.length > 0 ? (
          <div style={{ marginTop: "18px" }}>
            <div
              style={{
                color: "#64748b",
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              {logSummary}
            </div>

            {showAdvancedLog ? (
              <div
                style={{
                  marginTop: "14px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  background: "#f8fafc",
                  color: "#334155",
                  minHeight: "220px",
                  padding: "18px",
                  fontFamily:
                    "JetBrains Mono, SFMono-Regular, Consolas, monospace",
                  fontSize: "13px",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  overflow: "auto",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
                }}
              >
                {log.join("\n")}
              </div>
            ) : null}
          </div>
        ) : null}
      </InfoCard>

      <div
        style={{
          display: "grid",
          gap: "22px",
          minWidth: 0,
        }}
      >
        <InfoCard
          title="Target"
          style={{ padding: "20px", borderRadius: "20px" }}
          compact
        >
          <InfoRow label="Board" value={board.name} compact />
          <InfoRow label="Device" value={board.fpgaId} compact />
          <InfoRow label="Toolchain" value={capabilities.toolchain} compact />
          <InfoRow
            label="Status"
            value={capabilities.synthesisDiagram.label}
            compact
          />
        </InfoCard>

        <InfoCard
          title="Inputs"
          style={{ padding: "20px", borderRadius: "20px" }}
          compact
        >
          <InfoRow label="HDL Files" value={String(hdlFiles.length)} compact />
          <InfoRow
            label="Top Module"
            value={diagram?.topModule ?? topModule ?? "Not found"}
            compact
          />
          <InfoRow
            label="Output Netlist"
            value={`${diagram?.outputName ?? outputName}.json`}
            compact
          />
        </InfoCard>
      </div>
    </div>
  );
}

function HardwareDiagram({ diagram }: { diagram: SynthesisDiagramResponse }) {
  const layout = useMemo(() => createDiagramLayout(diagram), [diagram]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            {diagram.topModule}
          </div>
          <div
            style={{
              marginTop: "4px",
              color: "#64748b",
              fontSize: "14px",
            }}
          >
            {diagram.nodes.length} nodes · {diagram.edges.length} connections
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          <LegendDot color="#2563eb" label="Inputs" />
          <LegendDot color="#7c3aed" label="Gates" />
          <LegendDot color="#0f766e" label="Outputs" />
          <LegendDot color="#ea580c" label="Constants" />
        </div>
      </div>

      <div
        className="dashboard-glass-card"
        style={{
          borderRadius: "16px",
          border: "1px solid #dbe4f0",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.98) 100%)",
          overflow: "auto",
          maxHeight: "420px",
        }}
      >
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{
            display: "block",
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            minWidth: "100%",
          }}
          role="img"
          aria-label={`Synthesized hardware diagram for ${diagram.topModule}`}
        >
          {layout.edges.map((edge, index) => (
            <path
              key={`${edge.from}-${edge.to}-${index}`}
              d={edge.path}
              fill="none"
              stroke="rgba(100,116,139,0.48)"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          ))}

          {layout.nodes.map((node) => (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <GateNode node={node} />
              <title>{`${node.label} — ${node.detail}`}</title>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function GateNode({
  node,
}: {
  node: {
    width: number;
    height: number;
    fill: string;
    stroke: string;
    label: string;
    detail: string;
    id: string;
  };
}) {
  const gate = classifyGate(node.label, node.detail);
  const centerX = node.width / 2;
  const centerY = node.height / 2;

  if (
    gate.kind === "input" ||
    gate.kind === "output" ||
    gate.kind === "constant"
  ) {
    return (
      <>
        <rect
          x={0}
          y={0}
          rx={12}
          ry={12}
          width={node.width}
          height={node.height}
          fill={node.fill}
          stroke={node.stroke}
          strokeWidth={1.5}
        />
        <text
          x={centerX}
          y={centerY + 4}
          textAnchor="middle"
          fill="#0f172a"
          fontSize={13}
          fontWeight={800}
        >
          {truncateLabel(node.label, 18)}
        </text>
      </>
    );
  }

  if (gate.shape === "triangle") {
    const left = 18;
    const right = node.width - 18;
    const top = 11;
    const bottom = node.height - 11;
    const points = `${left},${top} ${left},${bottom} ${right - 10},${centerY}`;

    return (
      <>
        <polygon
          points={points}
          fill={node.fill}
          stroke={node.stroke}
          strokeWidth={1.8}
        />
        {gate.bubbled ? (
          <circle
            cx={right - 5}
            cy={centerY}
            r={5}
            fill="#ffffff"
            stroke={node.stroke}
            strokeWidth={1.6}
          />
        ) : null}
        <text
          x={centerX - 6}
          y={centerY + 4}
          textAnchor="middle"
          fill="#0f172a"
          fontSize={13}
          fontWeight={800}
        >
          {gate.text}
        </text>
      </>
    );
  }

  if (gate.shape === "and") {
    const d = `M 18 10 L 76 10 A 18 18 0 0 1 76 ${node.height - 10} L 18 ${node.height - 10} Z`;
    return (
      <>
        <path d={d} fill={node.fill} stroke={node.stroke} strokeWidth={1.8} />
        {gate.bubbled ? (
          <circle
            cx={97}
            cy={centerY}
            r={5}
            fill="#ffffff"
            stroke={node.stroke}
            strokeWidth={1.6}
          />
        ) : null}
        <text
          x={52}
          y={centerY + 4}
          textAnchor="middle"
          fill="#0f172a"
          fontSize={13}
          fontWeight={800}
        >
          {gate.text}
        </text>
        <text
          x={node.width - 26}
          y={centerY + 4}
          textAnchor="middle"
          fill="#475569"
          fontSize={11}
          fontWeight={700}
        >
          {truncateLabel(node.label, 8)}
        </text>
      </>
    );
  }

  if (gate.shape === "or") {
    const d = `M 18 10 Q 42 ${centerY} 18 ${node.height - 10} Q 54 ${node.height - 10} 88 ${centerY} Q 54 10 18 10`;
    return (
      <>
        <path d={d} fill={node.fill} stroke={node.stroke} strokeWidth={1.8} />
        {gate.xor ? (
          <path
            d={`M 11 10 Q 35 ${centerY} 11 ${node.height - 10}`}
            fill="none"
            stroke={node.stroke}
            strokeWidth={1.4}
          />
        ) : null}
        {gate.bubbled ? (
          <circle
            cx={94}
            cy={centerY}
            r={5}
            fill="#ffffff"
            stroke={node.stroke}
            strokeWidth={1.6}
          />
        ) : null}
        <text
          x={52}
          y={centerY + 4}
          textAnchor="middle"
          fill="#0f172a"
          fontSize={13}
          fontWeight={800}
        >
          {gate.text}
        </text>
        <text
          x={node.width - 26}
          y={centerY + 4}
          textAnchor="middle"
          fill="#475569"
          fontSize={11}
          fontWeight={700}
        >
          {truncateLabel(node.label, 8)}
        </text>
      </>
    );
  }

  return (
    <>
      <rect
        x={10}
        y={8}
        rx={10}
        ry={10}
        width={node.width - 20}
        height={node.height - 16}
        fill={node.fill}
        stroke={node.stroke}
        strokeWidth={1.6}
      />
      <text
        x={centerX}
        y={centerY - 3}
        textAnchor="middle"
        fill="#0f172a"
        fontSize={13}
        fontWeight={800}
      >
        {gate.text}
      </text>
      <text
        x={centerX}
        y={centerY + 14}
        textAnchor="middle"
        fill="#475569"
        fontSize={10}
        fontWeight={700}
      >
        {truncateLabel(node.label, 14)}
      </text>
    </>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "999px",
          background: color,
        }}
      />
      {label}
    </span>
  );
}

function createDiagramLayout(diagram: SynthesisDiagramResponse) {
  const nodeWidth = 150;
  const nodeHeight = 50;
  const rowGap = 14;
  const zoneGap = 54;
  const columnGap = 18;
  const marginX = 24;
  const marginY = 24;
  const aggregatedEdges = aggregateEdges(diagram.edges);

  const inputNodes = diagram.nodes
    .filter((node) => node.kind === "input" || node.kind === "constant")
    .sort((a, b) => a.label.localeCompare(b.label));
  const outputNodes = diagram.nodes
    .filter((node) => node.kind === "output")
    .sort((a, b) => a.label.localeCompare(b.label));
  const gateNodes = diagram.nodes
    .filter((node) => node.kind === "cell")
    .sort((a, b) => gateSortKey(a).localeCompare(gateSortKey(b)));

  const inputs = reorderZoneNodes(
    inputNodes,
    gateNodes,
    aggregatedEdges,
    "left",
  );
  const gates = reorderZoneNodes(
    gateNodes,
    [...inputs, ...outputNodes],
    aggregatedEdges,
    "middle",
  );
  const outputs = reorderZoneNodes(
    outputNodes,
    gates,
    aggregatedEdges,
    "right",
  );

  const leftZone = buildZoneLayout(
    inputs,
    nodeWidth,
    nodeHeight,
    rowGap,
    columnGap,
    6,
  );
  const middleZone = buildZoneLayout(
    gates,
    nodeWidth,
    nodeHeight,
    rowGap,
    columnGap,
    gates.length > 12 ? 5 : 6,
  );
  const rightZone = buildZoneLayout(
    outputs,
    nodeWidth,
    nodeHeight,
    rowGap,
    columnGap,
    6,
  );

  const width =
    marginX * 2 +
    leftZone.width +
    zoneGap +
    middleZone.width +
    zoneGap +
    rightZone.width;
  const height =
    marginY * 2 +
    Math.max(
      leftZone.height,
      middleZone.height,
      rightZone.height,
      nodeHeight,
      360,
    );

  const positions = new Map<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      stroke: string;
      label: string;
      detail: string;
    }
  >();

  const zones = [
    { layout: leftZone, startX: marginX },
    { layout: middleZone, startX: marginX + leftZone.width + zoneGap },
    {
      layout: rightZone,
      startX: marginX + leftZone.width + zoneGap + middleZone.width + zoneGap,
    },
  ];

  zones.forEach(({ layout, startX }) => {
    const startY = Math.max(marginY, (height - layout.height) / 2);
    layout.items.forEach((item) => {
      positions.set(item.node.id, {
        x: startX + item.x,
        y: startY + item.y,
        width: nodeWidth,
        height: nodeHeight,
        fill: nodeFill(item.node.kind),
        stroke: nodeStroke(item.node.kind),
        label: item.node.label,
        detail: item.node.detail,
      });
    });
  });

  const laidOutNodes = diagram.nodes
    .map((node) => {
      const position = positions.get(node.id);
      if (!position) return null;
      return { id: node.id, ...position };
    })
    .filter((node): node is NonNullable<typeof node> => node !== null);

  const laidOutEdges = [];

  for (const edge of aggregatedEdges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;

    const startX = from.x + from.width;
    const startY = from.y + from.height / 2;
    const endX = to.x;
    const endY = to.y + to.height / 2;
    const laneOffset = Math.min(34, 10 + edge.count * 4);
    const midX = startX + Math.max(26, (endX - startX) / 2) - laneOffset;

    laidOutEdges.push({
      ...edge,
      path: `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`,
    });
  }

  return {
    width,
    height,
    nodes: laidOutNodes,
    edges: laidOutEdges,
  };
}

function aggregateEdges(
  edges: SynthesisDiagramEdge[],
): AggregatedDiagramEdge[] {
  const grouped = new Map<string, AggregatedDiagramEdge>();

  for (const edge of edges) {
    const key = `${edge.from}=>${edge.to}`;
    const current = grouped.get(key);

    if (current) {
      if (!current.labels.includes(edge.label)) {
        current.labels.push(edge.label);
      }
      current.count += 1;
      continue;
    }

    grouped.set(key, {
      from: edge.from,
      to: edge.to,
      labels: [edge.label],
      count: 1,
    });
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    return a.to.localeCompare(b.to);
  });
}

function nodeFill(kind: string) {
  if (kind === "input") return "#dbeafe";
  if (kind === "output") return "#ccfbf1";
  if (kind === "constant") return "#ffedd5";
  return "#ede9fe";
}

function nodeStroke(kind: string) {
  if (kind === "input") return "#60a5fa";
  if (kind === "output") return "#2dd4bf";
  if (kind === "constant") return "#fb923c";
  return "#a78bfa";
}

function truncateLabel(label: string, maxLength: number) {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1)}…`;
}

function buildZoneLayout(
  nodes: SynthesisDiagramNode[],
  nodeWidth: number,
  nodeHeight: number,
  rowGap: number,
  columnGap: number,
  maxRows: number,
) {
  const rowCount = Math.max(1, Math.min(maxRows, nodes.length || 1));
  const columnCount = Math.max(1, Math.ceil((nodes.length || 1) / rowCount));
  const items = nodes.map((node, index) => {
    const columnIndex = Math.floor(index / rowCount);
    const rowIndex = index % rowCount;

    return {
      node,
      x: columnIndex * (nodeWidth + columnGap),
      y: rowIndex * (nodeHeight + rowGap),
    };
  });

  return {
    items,
    width: columnCount * nodeWidth + Math.max(columnCount - 1, 0) * columnGap,
    height: rowCount * nodeHeight + Math.max(rowCount - 1, 0) * rowGap,
  };
}

function reorderZoneNodes(
  primaryNodes: SynthesisDiagramNode[],
  referenceNodes: SynthesisDiagramNode[],
  edges: AggregatedDiagramEdge[],
  side: "left" | "middle" | "right",
) {
  const referenceIndex = new Map<string, number>();
  referenceNodes.forEach((node, index) => {
    referenceIndex.set(node.id, index);
  });

  return [...primaryNodes].sort((a, b) => {
    const aScore = averageReferenceIndex(a.id, referenceIndex, edges, side);
    const bScore = averageReferenceIndex(b.id, referenceIndex, edges, side);
    if (aScore !== bScore) return aScore - bScore;
    return a.label.localeCompare(b.label);
  });
}

function averageReferenceIndex(
  nodeId: string,
  referenceIndex: Map<string, number>,
  edges: AggregatedDiagramEdge[],
  side: "left" | "middle" | "right",
) {
  const related = edges
    .map((edge) => {
      if (side === "left" && edge.from === nodeId)
        return referenceIndex.get(edge.to);
      if (side === "right" && edge.to === nodeId)
        return referenceIndex.get(edge.from);
      if (side === "middle") {
        if (edge.from === nodeId) return referenceIndex.get(edge.to);
        if (edge.to === nodeId) return referenceIndex.get(edge.from);
      }
      return undefined;
    })
    .filter((value): value is number => value !== undefined);

  if (related.length === 0) return Number.MAX_SAFE_INTEGER;
  return related.reduce((sum, value) => sum + value, 0) / related.length;
}

function gateSortKey(node: SynthesisDiagramNode) {
  const gate = classifyGate(node.label, node.detail);
  return `${gate.text}-${node.label}`;
}

function classifyGate(label: string, detail: string) {
  const source = `${label} ${detail}`.toLowerCase();

  if (source.includes("input port"))
    return { kind: "input", shape: "port", text: label };
  if (source.includes("output port"))
    return { kind: "output", shape: "port", text: label };
  if (source.includes("constant"))
    return { kind: "constant", shape: "port", text: label };
  if (source.includes("not") || source.includes("inv")) {
    return { kind: "gate", shape: "triangle", text: "NOT", bubbled: true };
  }
  if (source.includes("buf")) {
    return { kind: "gate", shape: "triangle", text: "BUF", bubbled: false };
  }
  if (source.includes("nand")) {
    return { kind: "gate", shape: "and", text: "NAND", bubbled: true };
  }
  if (source.includes("and")) {
    return { kind: "gate", shape: "and", text: "AND", bubbled: false };
  }
  if (source.includes("xnor")) {
    return {
      kind: "gate",
      shape: "or",
      text: "XNOR",
      bubbled: true,
      xor: true,
    };
  }
  if (source.includes("xor")) {
    return {
      kind: "gate",
      shape: "or",
      text: "XOR",
      bubbled: false,
      xor: true,
    };
  }
  if (source.includes("nor")) {
    return {
      kind: "gate",
      shape: "or",
      text: "NOR",
      bubbled: true,
      xor: false,
    };
  }
  if (source.includes("or")) {
    return {
      kind: "gate",
      shape: "or",
      text: "OR",
      bubbled: false,
      xor: false,
    };
  }
  if (source.includes("mux")) {
    return { kind: "gate", shape: "rect", text: "MUX" };
  }
  if (source.includes("dff") || source.includes("ff")) {
    return { kind: "gate", shape: "rect", text: "DFF" };
  }
  if (source.includes("latch")) {
    return { kind: "gate", shape: "rect", text: "LATCH" };
  }
  if (source.includes("add")) {
    return { kind: "gate", shape: "rect", text: "ADD" };
  }
  if (source.includes("sub")) {
    return { kind: "gate", shape: "rect", text: "SUB" };
  }

  return {
    kind: "gate",
    shape: "rect",
    text: label.toUpperCase().slice(0, 8) || "LOGIC",
  };
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Synthesis failed with an unknown error.";
}

function sanitizeName(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "allora_project"
  );
}
