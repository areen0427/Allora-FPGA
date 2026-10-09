import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import ELK from "elkjs/lib/elk-api.js";
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker";
import {
  createElkLayout,
  classifySymbol,
  type LayoutNode,
  type SchematicLayout,
} from "../lib/synthesisLayout";
import {
  buildHardwareGraph,
  legacyGraph,
  projectGraph,
  traceGraph,
  sourceMatches,
  sourceAssociations,
  reconcileSelection,
  recordedValue,
  waveformCandidates,
  waveformScopes,
  connectionValue,
  type Abstraction,
  type Bit,
  type HardwareNode,
  type HardwareEdge,
  type SynthesisDiagramResponse,
} from "../lib/synthesisGraph";
import {
  listenExplorer,
  publishExplorer,
  type ExplorerMessage,
} from "../lib/explorerBridge";
import { sameSources } from "../lib/savedProjectResults";
import { parseVcd, formatWaveTick } from "../lib/vcd";
import { openViewerWindow } from "../lib/viewerWindow";
import SynthesisInspector from "./SynthesisInspector";

type Viewport = { x: number; y: number; scale: number };
const elk = new ELK({ workerFactory: () => new ElkWorker() });
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
  const [level, setLevel] = useState<Abstraction>("logic");
  const [hierarchy, setHierarchy] = useState([
    { module: diagram.topModule, instance: "" },
  ]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState(800);
  const [layoutFocus, setLayoutFocus] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"forward" | "backward" | null>(
    null,
  );
  const [stopAtRegisters, setStopAtRegisters] = useState(true);
  const [isolate, setIsolate] = useState(false);
  const [selectedBit, setSelectedBit] = useState<Bit | undefined>();
  const [inspector, setInspector] = useState(true);
  const [rtlSelection, setRtlSelection] = useState<{
    fileName: string;
    start: number;
    end: number;
    startColumn?: number;
    endColumn?: number;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [layoutError, setLayoutError] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [recording, setRecording] = useState<Extract<
    ExplorerMessage,
    { type: "waveform" }
  > | null>(null);
  const [time, setTime] = useState(0);
  const [dutPath, setDutPath] = useState("");
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 850 });
  const artifact = diagram.artifacts?.[level];
  const moduleName = hierarchy.at(-1)!.module;
  const graph = useMemo(() => {
    if (!artifact) return legacyGraph(diagram);
    try {
      return buildHardwareGraph(
        artifact,
        artifact.modules?.[moduleName] ? moduleName : diagram.topModule,
      );
    } catch (error) {
      const legacy = legacyGraph(diagram);
      return {
        ...legacy,
        warnings: [
          `${level} artifact unavailable: ${String(error)}. Showing legacy logic.`,
          ...legacy.warnings,
        ],
      };
    }
  }, [artifact, moduleName, diagram, level]);
  const rtlHighlights = useMemo(
    () =>
      rtlSelection
        ? sourceMatches(
            graph,
            diagram.sourceFiles ?? [],
            rtlSelection.fileName,
            rtlSelection.start,
            rtlSelection.end,
            rtlSelection.startColumn,
            rtlSelection.endColumn,
          )
        : [],
    [graph, diagram.sourceFiles, rtlSelection],
  );
  const rtlAssociations = useMemo(
    () => sourceAssociations(graph, rtlHighlights),
    [graph, rtlHighlights],
  );
  const previousGraph = useRef(graph);
  useEffect(() => {
    setSelectedNodeId((current) =>
      reconcileSelection(previousGraph.current, graph, current),
    );
    previousGraph.current = graph;
    setSelectedBit(undefined);
    setLayoutFocus(undefined);
    if (graph.nodes.length > 800)
      setCollapsed(
        new Set(
          graph.nodes
            .filter((node) => node.kind === "cell")
            .map((node) => node.category),
        ),
      );
  }, [graph]);
  const projection = useMemo(
    () => projectGraph(graph, collapsed, budget, layoutFocus),
    [graph, collapsed, budget, layoutFocus],
  );
  const trace = useMemo(
    () =>
      direction && selectedNodeId
        ? traceGraph(
            graph,
            selectedNodeId,
            direction,
            stopAtRegisters,
            selectedBit,
          )
        : null,
    [graph, direction, selectedNodeId, stopAtRegisters, selectedBit],
  );
  const waveform = useMemo(() => {
    const parsed = parseVcd(recording?.vcd ?? "", {
      preserveAliases: true,
      initialUnknown: false,
    });
    return parsed && Number.isSafeInteger(parsed.endTime) ? parsed : null;
  }, [recording]);
  const instancePath = [
    dutPath,
    ...hierarchy.slice(1).map((item) => item.instance),
  ]
    .filter(Boolean)
    .join(".");
  const values = useMemo(() => {
    const result = new Map<string, { value: string; changed: boolean }>();
    if (!waveform) return result;
    for (const net of graph.nets) {
      const candidates = waveformCandidates(
        net,
        waveform.signals,
        instancePath,
      );
      if (candidates.length !== 1) continue;
      const value = recordedValue(candidates[0].values, time);
      if (value !== null)
        result.set(net.id, {
          value: value.padStart(
            net.bits.length,
            /^[xz]/i.test(value) ? value[0] : "0",
          ),
          changed:
            time > 0 && recordedValue(candidates[0].values, time - 1) !== value,
        });
    }
    return result;
  }, [waveform, graph, instancePath, time]);
  const scopes = useMemo(() => {
    if (!waveform) return [];
    try {
      return waveformScopes(
        artifact ? buildHardwareGraph(artifact, diagram.topModule) : graph,
        waveform.signals,
      );
    } catch {
      return [];
    }
  }, [artifact, diagram.topModule, graph, waveform]);
  const bitValues = useMemo(() => {
    const result = new Map<number, { value: string; changed: boolean }>();
    const conflicts = new Set<number>();
    for (const net of graph.nets) {
      const value = values.get(net.id);
      if (!value) continue;
      net.bits.forEach((bit, i) => {
        if (typeof bit !== "number" || conflicts.has(bit)) return;
        const lane = value.value.at(-1 - i)!;
        const prior = result.get(bit);
        if (prior && prior.value !== lane) {
          result.delete(bit);
          conflicts.add(bit);
        } else
          result.set(bit, {
            value: lane,
            changed: value.changed || !!prior?.changed,
          });
      });
    }
    return result;
  }, [graph, values]);
  useEffect(
    () =>
      listenExplorer((message) => {
        if (message.projectKey !== diagram.projectKey) return;
        if (message.type === "rtl-selection") {
          const snapshot = diagram.sourceFiles?.find(
            (file) => file.name === message.fileName,
          );
          if (snapshot?.content !== message.content) {
            setRtlSelection(null);
            setNotice(
              "Editor source differs from this synthesis snapshot. Re-run synthesis for cross-highlighting.",
            );
            return;
          }
          const matches = sourceMatches(
            graph,
            diagram.sourceFiles ?? [],
            message.fileName,
            message.start,
            message.end,
            message.startColumn,
            message.endColumn,
          );
          setRtlSelection({
            fileName: message.fileName,
            start: message.start,
            end: message.end,
            startColumn: message.startColumn,
            endColumn: message.endColumn,
          });
          setNotice(
            matches.length
              ? `${matches.length} source spans or signal declarations mapped by Yosys.`
              : "No preserved source mapping in this module. Open the relevant module or another synthesis stage.",
          );
        } else if (
          message.type === "waveform-time" &&
          message.recordingId === recording?.recordingId
        )
          setTime(
            Math.max(
              0,
              Math.min(
                waveform?.endTime ?? 0,
                Number.isSafeInteger(message.time) ? message.time : 0,
              ),
            ),
          );
        else if (
          message.type === "waveform-select" &&
          message.recordingId === recording?.recordingId
        ) {
          const matches = graph.nets.filter((net) =>
            waveformCandidates(net, waveform?.signals ?? [], instancePath).some(
              (signal) => signal.name === message.signalName,
            ),
          );
          if (matches.length === 1) {
            setSelectedNodeId(matches[0].id);
            setDirection("forward");
            setInspector(true);
          } else
            setNotice(
              "Waveform selection has no unique exact alias in this module.",
            );
        } else if (message.type === "navigation-result")
          setNotice(message.message);
        else if (message.type === "waveform") {
          if (
            sameSources(message.files, diagram.sourceFiles ?? []) &&
            sameSources(message.memories, diagram.memoryFiles ?? [])
          ) {
            setRecording(message);
            setTime(0);
            setNotice(
              "Recorded waveform attached. Enter the exact DUT scope to match signals; no short-name matching.",
            );
          } else
            setNotice(
              "Waveform sources differ from this synthesis snapshot; values are unavailable.",
            );
        }
      }),
    [diagram, graph, recording, waveform, instancePath],
  );
  const [navigationSensitivity, setNavigationSensitivity] = useState(
    readNavigationSensitivity,
  );

  useEffect(() => {
    window.localStorage.setItem(
      NAVIGATION_SENSITIVITY_KEY,
      String(navigationSensitivity),
    );
  }, [navigationSensitivity]);

  const fitToWindow = useCallback((nextLayout?: SchematicLayout | null) => {
    const host = hostRef.current;
    const resolvedLayout = nextLayout ?? layoutRef.current;
    if (!host || !resolvedLayout) return;
    const padding = 64;
    const availableWidth =
      host.clientWidth -
      (host.querySelector(".explorer-inspector")?.clientWidth ?? 0);
    const scale = clamp(
      Math.min(
        (availableWidth - padding * 2) / resolvedLayout.width,
        (host.clientHeight - padding * 2) / resolvedLayout.height,
        1.25,
      ),
      MIN_SCALE,
      MAX_SCALE,
    );
    setViewport({
      scale,
      x: (availableWidth - resolvedLayout.width * scale) / 2,
      y: (host.clientHeight - resolvedLayout.height * scale) / 2,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    layoutRef.current = null;
    setLayout(null);
    setLayoutError("");
    createElkLayout(projection, elk)
      .then((nextLayout) => {
        if (cancelled) return;
        layoutRef.current = nextLayout;
        setLayout(nextLayout);
        requestAnimationFrame(() => fitToWindow(nextLayout));
      })
      .catch((error) => {
        if (!cancelled) setLayoutError(`Layout failed: ${String(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [projection, fitToWindow]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      setCanvasSize({ width: host.clientWidth, height: host.clientHeight });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [fitToWindow]);

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const selectedNet = graph.nets.find((net) => net.id === selectedNodeId);
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const term = search.toLowerCase();
    return [
      ...graph.nodes,
      ...graph.nets.map((net) => ({
        id: net.id,
        label: net.name,
        detail: `${net.bits.length} bits`,
      })),
    ]
      .filter((item) =>
        `${item.id} ${item.label} ${item.detail}`.toLowerCase().includes(term),
      )
      .slice(0, 40);
  }, [graph, search]);
  function select(id: string) {
    setSelectedNodeId(id);
    setSelectedBit(undefined);
    setInspector(true);
    const node = graph.nodes.find((node) => node.id === id);
    if (node && !projection.nodes.some((item) => item.id === id))
      setLayoutFocus(id);
    if (node && collapsed.has(node.category))
      setCollapsed(
        (current) =>
          new Set(
            [...current].filter((category) => category !== node.category),
          ),
      );
    const positioned = layout?.nodes.find((node) => node.id === id);
    if (positioned)
      setViewport((current) => ({
        ...current,
        scale: Math.max(current.scale, 0.75),
        x:
          canvasSize.width / 2 -
          (positioned.x + positioned.width / 2) * Math.max(current.scale, 0.75),
        y:
          canvasSize.height / 2 -
          (positioned.y + positioned.height / 2) *
            Math.max(current.scale, 0.75),
      }));
  }
  function clear() {
    setSelectedNodeId(null);
    setDirection(null);
    setIsolate(false);
    setSelectedBit(undefined);
    setRtlSelection(null);
    setNotice("");
  }
  function toggleCategory(category: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }
  const nodeHighlighted = (node: HardwareNode) =>
    node.id === selectedNodeId ||
    rtlAssociations.nodes.has(node.id) ||
    trace?.nodes.has(node.id) ||
    node.members?.some(
      (id) => trace?.nodes.has(id) || rtlAssociations.nodes.has(id),
    );
  const edgeHighlighted = (edge: HardwareEdge) =>
    edge.id === selectedNodeId ||
    rtlAssociations.edges.has(edge.id) ||
    trace?.edges.has(edge.id) ||
    edge.members?.some(
      (id) => trace?.edges.has(id) || rtlAssociations.edges.has(id),
    );
  const inViewport = (box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) =>
    box.x + box.width >= (-viewport.x - 80) / viewport.scale &&
    box.y + box.height >= (-viewport.y - 80) / viewport.scale &&
    box.x <= (canvasSize.width - viewport.x + 80) / viewport.scale &&
    box.y <= (canvasSize.height - viewport.y + 80) / viewport.scale;

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
    if (
      (event.target as Element).closest(
        ".explorer-inspector, .explorer-enter-module",
      )
    )
      return;
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
      x: drag.originX + (event.clientX - drag.startX) * navigationSensitivity,
      y: drag.originY + (event.clientY - drag.startY) * navigationSensitivity,
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
          <span className="schematic-eyebrow">
            Synthesis Explorer · {level}
          </span>
          <strong>{moduleName}</strong>
          <small>
            {graph.nodes.length} elements · {graph.edges.length} pin connections
          </small>
        </div>
        <div
          className="explorer-tools"
          role="toolbar"
          aria-label="Synthesis exploration"
        >
          <div
            className="explorer-tool-section"
            role="group"
            aria-label="View and search"
          >
            <label>
              View{" "}
              <select
                value={level}
                onChange={(event) => {
                  setLevel(event.target.value as Abstraction);
                  setHierarchy([{ module: diagram.topModule, instance: "" }]);
                  setDirection(null);
                }}
              >
                {(["functional", "logic", "technology"] as const).map(
                  (view) => (
                    <option
                      key={view}
                      value={view}
                      disabled={view !== "logic" && !diagram.artifacts?.[view]}
                    >
                      {view === "functional"
                        ? "RTL / Functional"
                        : view === "logic"
                          ? "Logic"
                          : "Technology mapped"}
                      {!diagram.artifacts?.[view] && view !== "logic"
                        ? " (unavailable)"
                        : ""}
                    </option>
                  ),
                )}
              </select>
            </label>
            {hierarchy.length > 1 ? (
              <nav aria-label="Module hierarchy">
                {hierarchy.map((item, i) =>
                  i === hierarchy.length - 1 ? (
                    <span key={i} aria-current="page">
                      › {item.instance}
                    </span>
                  ) : (
                    <button
                      key={i}
                      onClick={() => {
                        setHierarchy((current) => current.slice(0, i + 1));
                        clear();
                      }}
                    >
                      {item.instance || item.module}
                    </button>
                  ),
                )}
              </nav>
            ) : null}
            <div className="explorer-search">
              <input
                aria-label="Search hardware and signals"
                placeholder="Search signals, registers, modules…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search ? (
                <div className="explorer-search-results">
                  {searchResults.length ? (
                    searchResults.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          select(item.id);
                          setSearch("");
                        }}
                      >
                        {item.label}
                        <small>{item.detail}</small>
                      </button>
                    ))
                  ) : (
                    <small>No matching hardware in this module.</small>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <div
            className="explorer-tool-section"
            role="group"
            aria-label="Trace connections"
          >
            <span className="explorer-section-label">Trace</span>
            <button
              disabled={!selectedNodeId}
              aria-pressed={direction === "backward"}
              title="Follow drivers into the selection"
              onClick={() => {
                if (direction === "backward") setIsolate(false);
                setDirection(direction === "backward" ? null : "backward");
              }}
            >
              Fan-in
            </button>
            <button
              disabled={!selectedNodeId}
              aria-pressed={direction === "forward"}
              title="Follow destinations from the selection"
              onClick={() => {
                if (direction === "forward") setIsolate(false);
                setDirection(direction === "forward" ? null : "forward");
              }}
            >
              Fan-out
            </button>
            <label>
              <input
                type="checkbox"
                checked={stopAtRegisters}
                onChange={(event) => setStopAtRegisters(event.target.checked)}
              />
              Stop at storage
            </label>
            <label>
              <input
                type="checkbox"
                disabled={!selectedNodeId}
                checked={isolate}
                onChange={(event) => {
                  setIsolate(event.target.checked);
                  if (!direction) setDirection("forward");
                }}
              />
              Isolate path
            </label>
          </div>
          <div
            className="explorer-tool-section"
            role="group"
            aria-label="Panels and display"
          >
            <button
              aria-expanded={inspector}
              aria-controls="synthesis-inspector"
              onClick={() => setInspector((current) => !current)}
            >
              {selectedNodeId ? "Inspector" : "Overview"}
            </button>
            <details>
              <summary>Groups</summary>
              <div className="explorer-group-menu">
                {[
                  ...new Set(
                    graph.nodes
                      .filter((node) => node.kind === "cell")
                      .map((node) => node.category),
                  ),
                ].map((category) => (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                  >
                    {collapsed.has(category) ? "Expand" : "Collapse"} {category}
                  </button>
                ))}
                <p>
                  Categories summarize real cells; expand to see individual
                  connections.
                </p>
              </div>
            </details>
          </div>
          <div
            className="schematic-controls"
            aria-label="Schematic zoom controls"
          >
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
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => zoomFromCenter(1.25, hostRef, setViewport)}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => zoomFromCenter(0.8, hostRef, setViewport)}
            >
              −
            </button>
            <button type="button" onClick={() => fitToWindow()}>
              Fit
            </button>
            <button
              type="button"
              onClick={() => setViewport({ x: 40, y: 40, scale: 1 })}
            >
              1:1
            </button>
            <output className="schematic-zoom-value">
              {Math.round(viewport.scale * 100)}%
            </output>
          </div>
        </div>
      </div>
      <div className="explorer-status" role="status">
        {notice ||
          layout?.notice ||
          projection.warnings[0] ||
          "Drag to pan · Wheel to zoom · Click a wire to trace · Search includes signal aliases"}
        {projection.warnings
          .slice(notice || layout?.notice ? 0 : 1)
          .map((warning, i) => (
            <span key={i}>{warning}</span>
          ))}
        {projection.nodes.length >= budget ? (
          <button
            onClick={() =>
              setBudget((current) =>
                Math.min(graph.nodes.length, current + 800),
              )
            }
            disabled={budget >= graph.nodes.length}
          >
            Increase detail budget ({budget})
          </button>
        ) : null}
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
        tabIndex={0}
        onKeyDown={(event) => {
          if (
            (event.target as Element).closest(
              "input, select, textarea, .explorer-inspector",
            )
          )
            return;
          if (event.key === "Escape") clear();
          if (event.key === "f") fitToWindow();
        }}
      >
        {!layout ? (
          <div className="schematic-loading" role="status">
            {layoutError || "Laying out schematic…"}
          </div>
        ) : (
          <svg
            className="schematic-svg"
            width="100%"
            height="100%"
            role="img"
            aria-label={`Interactive hardware schematic for ${diagram.topModule}`}
          >
            <defs>
              <pattern
                id="schematic-grid-small"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  stroke="rgba(100,116,139,0.1)"
                  strokeWidth="1"
                />
              </pattern>
              <pattern
                id="schematic-grid"
                width="100"
                height="100"
                patternUnits="userSpaceOnUse"
              >
                <rect
                  width="100"
                  height="100"
                  fill="url(#schematic-grid-small)"
                />
                <path
                  d="M 100 0 L 0 0 0 100"
                  fill="none"
                  stroke="rgba(100,116,139,0.16)"
                  strokeWidth="1"
                />
              </pattern>
              <marker
                id="explorer-direction"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
              <filter
                id="schematic-node-shadow"
                x="-30%"
                y="-30%"
                width="160%"
                height="160%"
              >
                <feDropShadow
                  dx="0"
                  dy="3"
                  stdDeviation="4"
                  floodColor="#0f172a"
                  floodOpacity="0.14"
                />
              </filter>
            </defs>
            <rect width="100%" height="100%" fill="url(#schematic-grid)" />
            <g
              transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
            >
              <g className="schematic-nets">
                {layout.edges
                  .filter(
                    (edge) =>
                      inViewport(edge.bounds) &&
                      (!isolate || !trace || edgeHighlighted(edge)),
                  )
                  .map((edge) => {
                    const value = edge.members
                      ? undefined
                      : connectionValue(edge, bitValues);
                    return (
                      <g
                        key={edge.id}
                        opacity={trace && !edgeHighlighted(edge) ? 0.18 : 1}
                      >
                        <path
                          d={edge.path}
                          markerEnd="url(#explorer-direction)"
                          className={`schematic-net ${edge.width > 1 ? "bus" : ""} ${edge.role} ${edgeHighlighted(edge) || hover === edge.id ? "highlighted" : ""} ${value?.changed ? "transition" : ""}`}
                        />
                        <path
                          d={edge.path}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={14}
                          vectorEffect="non-scaling-stroke"
                          className="explorer-wire-hit"
                          tabIndex={0}
                          aria-label={`${edge.label}: ${edge.fromPort} to ${edge.toPort}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => {
                            select(edge.members?.[0] ?? edge.id);
                            setDirection("forward");
                            if (edge.members)
                              setNotice(
                                `Selected the first of ${edge.members.length} grouped connections. Expand the category to select other paths.`,
                              );
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              select(edge.members?.[0] ?? edge.id);
                              setDirection("forward");
                              if (edge.members)
                                setNotice(
                                  `Selected the first of ${edge.members.length} grouped connections. Expand the category to select other paths.`,
                                );
                            }
                          }}
                          onMouseEnter={() => setHover(edge.id)}
                          onMouseLeave={() => setHover(null)}
                        >
                          <title>
                            {edge.label} · {edge.width || "?"} bits ·{" "}
                            {edge.fromPort} → {edge.toPort} · {edge.role}
                          </title>
                        </path>
                        {(viewport.scale > 0.8 || edgeHighlighted(edge)) &&
                        edge.labelVisible ? (
                          <text
                            x={edge.x}
                            y={edge.y}
                            textAnchor="middle"
                            className="explorer-net-label"
                          >
                            {truncate(edge.label, 26)}
                            {edge.members
                              ? ` (${edge.members.length} links)`
                              : ""}
                            {edge.width > 1 ? ` /${edge.width}` : ""}
                            {value ? ` = ${truncate(value.value, 8)}` : ""}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
              </g>
              <g className="schematic-elements">
                {layout.nodes
                  .filter(
                    (node) =>
                      inViewport(node) &&
                      (!isolate || !trace || nodeHighlighted(node)),
                  )
                  .map((node) => (
                    <g
                      key={node.id}
                      transform={`translate(${node.x} ${node.y})`}
                      className={`schematic-element category-${node.category}${nodeHighlighted(node) ? " selected" : ""}`}
                      opacity={trace && !nodeHighlighted(node) ? 0.18 : 1}
                      tabIndex={0}
                      role="button"
                      aria-label={`${node.label} ${node.detail}`}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") select(node.id);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => {
                        if (node.members) {
                          toggleCategory(node.category);
                          select(node.members[0]);
                        } else select(node.id);
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        if (node.module) {
                          setHierarchy((current) => [
                            ...current,
                            {
                              module: node.module!,
                              instance: node.id.slice(5),
                            },
                          ]);
                          clear();
                        }
                      }}
                    >
                      {viewport.scale < 0.22 ? (
                        <>
                          <rect
                            width={node.width}
                            height={node.height}
                            rx={8}
                            fill="var(--ui-control-bg)"
                            stroke="#64748b"
                          />
                          <text
                            x={node.width / 2}
                            y={node.height / 2}
                            textAnchor="middle"
                            className="schematic-symbol-mark"
                          >
                            {node.category}
                          </text>
                        </>
                      ) : (
                        <SchematicSymbol node={node} />
                      )}
                      {viewport.scale > 0.7 ? (
                        <text
                          x={node.width / 2}
                          y={node.height + 14}
                          textAnchor="middle"
                          className="explorer-net-label"
                        >
                          {truncate(node.label, 24)}
                          {node.members ? ` (${node.members.length})` : ""}
                        </text>
                      ) : null}
                      {trace?.boundaries.has(node.id) ? (
                        <text
                          x={node.width / 2}
                          y={-8}
                          textAnchor="middle"
                          className="explorer-net-label"
                        >
                          {node.module ? "Module boundary" : "Storage boundary"}
                        </text>
                      ) : null}
                      {viewport.scale > 0.65
                        ? node.layoutPins.map((pin) => (
                            <g key={pin.name}>
                              <circle
                                cx={pin.x}
                                cy={pin.y}
                                r={3}
                                fill={
                                  pin.role === "clock"
                                    ? "#d97706"
                                    : pin.role === "reset"
                                      ? "#dc2626"
                                      : "#64748b"
                                }
                              />
                              <text
                                x={
                                  pin.x +
                                  (pin.direction === "output" ? 10 : -10)
                                }
                                y={pin.y + 3}
                                textAnchor={
                                  pin.direction === "output" ? "start" : "end"
                                }
                                className="schematic-pin-hint"
                              >
                                {pin.name}
                                {pin.width > 1 ? ` /${pin.width}` : ""}
                              </text>
                            </g>
                          ))
                        : null}
                      <title>{`${node.label} — ${node.detail}`}</title>
                    </g>
                  ))}
              </g>
            </g>
          </svg>
        )}

        {selectedNode?.module ? (
          <button
            className="explorer-enter-module"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              setHierarchy((current) => [
                ...current,
                {
                  module: selectedNode.module!,
                  instance: selectedNode.id.slice(5),
                },
              ]);
              clear();
            }}
          >
            Enter {selectedNode.module}
          </button>
        ) : null}
        {inspector ? (
          <SynthesisInspector
            graph={graph}
            diagram={diagram}
            selection={selectedNodeId}
            onSelect={select}
            onCategory={(category) => {
              setCollapsed(
                new Set(
                  graph.nodes
                    .filter(
                      (node) =>
                        node.kind === "cell" && node.category !== category,
                    )
                    .map((node) => node.category),
                ),
              );
              const first = graph.nodes.find(
                (node) => node.category === category,
              );
              if (first) select(first.id);
            }}
            onClose={() => setInspector(false)}
            bit={selectedBit}
            onBit={setSelectedBit}
            values={values}
            waveformSignals={waveform?.signals}
            instancePath={instancePath}
          />
        ) : null}
      </div>
      <div className="explorer-waveform">
        <button
          onClick={() => {
            void publishExplorer({
              type: "waveform-request",
              projectKey: diagram.projectKey ?? "",
            }).catch((error) => setNotice(String(error)));
            setNotice(
              "Requesting the most recent recorded Testbench run. Run simulation in the main window if none is attached.",
            );
          }}
        >
          Attach recorded simulation
        </button>
        {waveform ? (
          <>
            <label>
              DUT scope{" "}
              <input
                list="explorer-dut-scopes"
                value={dutPath}
                onChange={(event) => setDutPath(event.target.value)}
                placeholder="e.g. counter_tb.dut"
              />
            </label>
            <datalist id="explorer-dut-scopes">
              {scopes.map((scope) => (
                <option key={scope.path} value={scope.path}>
                  {scope.matches} matching signals
                </option>
              ))}
            </datalist>
            {scopes.length === 1 && !dutPath ? (
              <button onClick={() => setDutPath(scopes[0].path)}>
                Use {scopes[0].path}
              </button>
            ) : null}
            <input
              aria-label="Recorded simulation time"
              type="range"
              min={0}
              max={waveform.endTime}
              step={1}
              value={time}
              onChange={(event) => setTime(Number(event.target.value))}
            />
            <output>{formatWaveTick(time, waveform.timescale)}</output>
            <span>
              {values.size} exact scoped aliases matched
              {selectedNet
                ? ` · ${values.get(selectedNet.id)?.value ?? "selected signal unmapped"}`
                : ""}
            </span>
            <button
              onClick={() => {
                void openViewerWindow("waveform", "Recorded simulation", {
                  vcd: recording!.vcd,
                  waveformName: recording!.waveformName,
                  projectKey: diagram.projectKey,
                  recordingId: recording!.recordingId,
                  selectedSignalName: selectedNet
                    ? waveformCandidates(
                        selectedNet,
                        waveform.signals,
                        instancePath,
                      )[0]?.name
                    : undefined,
                  initialTime: time,
                }).catch((error) => setNotice(String(error)));
              }}
            >
              Open waveform
            </button>
          </>
        ) : (
          <span>
            Recorded values only · No timing or simulated activity is inferred
            from connectivity.
          </span>
        )}
      </div>
    </div>
  );
}

function SchematicSymbol({ node }: { node: LayoutNode }) {
  const symbol = classifySymbol(node.label, node.detail, node.kind);
  const w = node.width;
  const h = node.height;
  const cy = h / 2;
  const stroke =
    node.kind === "input"
      ? "#2563eb"
      : node.kind === "output"
        ? "#0f766e"
        : node.kind === "constant"
          ? "#ea580c"
          : "#334155";
  const fill =
    node.kind === "input"
      ? "#dbeafe"
      : node.kind === "output"
        ? "#ccfbf1"
        : node.kind === "constant"
          ? "#ffedd5"
          : "#ffffff";
  const common = { fill, stroke, strokeWidth: 2 };
  if (node.kind === "group")
    return (
      <>
        <rect width={w} height={h} rx={12} {...common} strokeDasharray="6 3" />
        <text
          x={w / 2}
          y={cy - 3}
          textAnchor="middle"
          className="schematic-symbol-mark"
        >
          {node.category.toUpperCase()}
        </text>
        <text
          x={w / 2}
          y={cy + 16}
          textAnchor="middle"
          className="schematic-pin-hint"
        >
          {node.members?.length} cells · expand
        </text>
      </>
    );

  if (symbol.shape === "port") {
    const direction = node.kind === "output" ? "output" : "input";
    const d =
      node.kind === "inout"
        ? `M 14 0 H ${w - 14} L ${w} ${cy} L ${w - 14} ${h} H 14 L 0 ${cy} Z`
        : direction === "output"
          ? `M 0 0 H ${w - 14} L ${w} ${cy} L ${w - 14} ${h} H 0 Z`
          : `M 14 0 H ${w} V ${h} H 14 L 0 ${cy} Z`;
    return (
      <>
        <path d={d} {...common} filter="url(#schematic-node-shadow)" />
        <text
          x={w / 2}
          y={cy + 5}
          textAnchor="middle"
          className="schematic-port-label"
        >
          {truncate(node.label, 18)}
        </text>
      </>
    );
  }

  if (node.category === "memory")
    return (
      <>
        <rect x={3} y={3} width={w - 6} height={h - 6} rx={3} {...common} />
        <path
          d={`M 8 16 H ${w - 8} M 8 ${h - 16} H ${w - 8}`}
          stroke={stroke}
        />
        <text
          x={w / 2}
          y={cy + 4}
          textAnchor="middle"
          className="schematic-symbol-mark"
        >
          MEM
        </text>
      </>
    );
  if (node.category === "fsm")
    return (
      <>
        <circle cx={w / 2} cy={cy} r={Math.min(w, h) / 2 - 5} {...common} />
        <circle
          cx={w / 2}
          cy={cy}
          r={Math.min(w, h) / 2 - 10}
          fill="none"
          stroke={stroke}
        />
        <text
          x={w / 2}
          y={cy + 4}
          textAnchor="middle"
          className="schematic-symbol-mark"
        >
          FSM
        </text>
      </>
    );
  if (node.module)
    return (
      <>
        <rect x={3} y={3} width={w - 6} height={h - 6} rx={6} {...common} />
        <rect
          x={8}
          y={8}
          width={w - 16}
          height={h - 16}
          rx={4}
          fill="none"
          stroke={stroke}
        />
        <text
          x={w / 2}
          y={cy + 4}
          textAnchor="middle"
          className="schematic-symbol-mark"
        >
          {truncate(node.module, 12)}
        </text>
      </>
    );
  if (symbol.shape === "not" || symbol.shape === "buffer") {
    return (
      <>
        <path d={`M 8 8 L ${w - 14} ${cy} L 8 ${h - 8} Z`} {...common} />
        {symbol.shape === "not" ? (
          <circle
            cx={w - 7}
            cy={cy}
            r={6}
            fill="#fff"
            stroke={stroke}
            strokeWidth={2}
          />
        ) : null}
      </>
    );
  }

  if (symbol.shape === "and" || symbol.shape === "nand") {
    const flat = w * 0.46;
    return (
      <>
        <path
          d={`M 6 7 H ${flat} A ${w * 0.42} ${cy - 7} 0 0 1 ${flat} ${h - 7} H 6 Z`}
          {...common}
        />
        {symbol.shape === "nand" ? (
          <circle
            cx={w - 6}
            cy={cy}
            r={6}
            fill="#fff"
            stroke={stroke}
            strokeWidth={2}
          />
        ) : null}
      </>
    );
  }

  if (["or", "nor", "xor", "xnor"].includes(symbol.shape)) {
    const bubbled = symbol.shape === "nor" || symbol.shape === "xnor";
    const xor = symbol.shape === "xor" || symbol.shape === "xnor";
    const right = bubbled ? w - 13 : w - 5;
    return (
      <>
        {xor ? (
          <path
            d={`M 1 7 Q ${w * 0.27} ${cy} 1 ${h - 7}`}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
          />
        ) : null}
        <path
          d={`M 7 7 Q ${w * 0.3} ${cy} 7 ${h - 7} Q ${w * 0.58} ${h - 7} ${right} ${cy} Q ${w * 0.58} 7 7 7`}
          {...common}
        />
        {bubbled ? (
          <circle
            cx={w - 7}
            cy={cy}
            r={6}
            fill="#fff"
            stroke={stroke}
            strokeWidth={2}
          />
        ) : null}
      </>
    );
  }

  if (symbol.shape === "mux") {
    return (
      <>
        <path
          d={`M 14 4 H ${w - 14} L ${w - 5} ${h - 4} H 5 Z`}
          {...common}
          filter="url(#schematic-node-shadow)"
        />
        <text
          x={w / 2}
          y={cy + 5}
          textAnchor="middle"
          className="schematic-symbol-mark"
        >
          MUX
        </text>
        <text
          x={w / 2}
          y={h + 13}
          textAnchor="middle"
          className="schematic-pin-hint"
        >
          S
        </text>
      </>
    );
  }

  if (symbol.shape === "register") {
    return (
      <>
        <rect
          x={3}
          y={3}
          width={w - 6}
          height={h - 6}
          rx={3}
          {...common}
          filter="url(#schematic-node-shadow)"
        />
        {node.pins.some((pin) => pin.role === "clock") ? (
          <path
            d={`M 3 ${h - 19} L 13 ${h - 13} L 3 ${h - 7}`}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
          />
        ) : null}
        <text
          x={w / 2}
          y={cy + 6}
          textAnchor="middle"
          className="schematic-symbol-mark"
        >
          {node.pins.find((pin) => pin.name === "Q")?.bits.length ?? ""} FF
        </text>
      </>
    );
  }

  if (symbol.shape === "arithmetic" || symbol.shape === "compare") {
    return (
      <>
        <circle
          cx={w / 2}
          cy={cy}
          r={Math.min(w, h) / 2 - 4}
          {...common}
          filter="url(#schematic-node-shadow)"
        />
        <text
          x={w / 2}
          y={cy + 8}
          textAnchor="middle"
          className="schematic-operator-mark"
        >
          {symbol.mark}
        </text>
      </>
    );
  }

  return (
    <>
      <rect
        x={3}
        y={3}
        width={w - 6}
        height={h - 6}
        rx={7}
        {...common}
        filter="url(#schematic-node-shadow)"
      />
      <text
        x={w / 2}
        y={cy + 4}
        textAnchor="middle"
        className="schematic-symbol-mark"
      >
        {truncate(symbol.mark, 9)}
      </text>
    </>
  );
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
  return stored !== 0 && Number.isFinite(stored)
    ? clamp(stored, 0.5, 2.5)
    : DEFAULT_NAVIGATION_SENSITIVITY;
}
