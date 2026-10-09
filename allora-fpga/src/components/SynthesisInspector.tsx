import { useEffect, useMemo, useRef, useState } from "react";
import {
  sourceFile,
  parameterNumber,
  stageStats,
  logicDepth,
  category,
  waveformCandidates,
  type Abstraction,
  type Bit,
  type HardwareGraph,
  type SynthesisDiagramResponse,
} from "../lib/synthesisGraph";
import { publishExplorer } from "../lib/explorerBridge";
export default function SynthesisInspector({
  graph,
  diagram,
  selection,
  onSelect,
  onCategory,
  onClose,
  bit,
  onBit,
  values,
  waveformSignals,
  instancePath,
}: {
  graph: HardwareGraph;
  diagram: SynthesisDiagramResponse;
  selection: string | null;
  onSelect: (id: string) => void;
  onCategory: (category: string) => void;
  onClose: () => void;
  bit?: Bit;
  onBit: (bit?: Bit) => void;
  values?: Map<string, { value: string; changed: boolean }>;
  waveformSignals?: { id: string; name: string; width: number }[];
  instancePath?: string;
}) {
  const [message, setMessage] = useState("");
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollTo(0, 0);
    setMessage("");
  }, [selection, graph]);
  const node = graph.nodes.find((node) => node.id === selection);
  const edge = graph.edges.find((edge) => edge.id === selection);
  const net = graph.nets.find((net) => net.id === selection);
  const stages = useMemo(
    () =>
      Object.entries(diagram.artifacts ?? {}).map(([name, artifact]) => ({
        name,
        ...stageStats(artifact!, diagram.topModule),
      })),
    [diagram],
  );
  const depth = useMemo(() => logicDepth(graph), [graph]);
  const sources = node?.sources ?? net?.sources ?? [];
  const waveformReason = !waveformSignals
    ? "Attach a matching recorded simulation."
    : !instancePath
      ? "Choose the DUT scope to match signals."
      : net?.bits.some((bit) => typeof bit !== "number")
        ? "Constant-folded or mixed-constant signal; recorded RTL cannot be mapped safely."
        : net?.name.startsWith("$")
          ? "Internal synthesized signal has no original RTL alias."
          : net &&
              waveformCandidates(net, waveformSignals, instancePath).length > 1
            ? "Multiple recorded aliases match; mapping is ambiguous."
            : net &&
                waveformCandidates(net, waveformSignals, instancePath)
                  .length === 1
              ? "No recorded event at this time."
              : "No exact alias with the same width in this scope; check the scope or use another synthesis view.";
  const related = edge
    ? [edge]
    : net
      ? graph.edges.filter((edge) =>
          edge.bits.some((b) =>
            bit === undefined ? net.bits.includes(b) : b === bit,
          ),
        )
      : graph.edges.filter(
          (edge) => edge.from === selection || edge.to === selection,
        );
  return (
    <aside
      ref={panel}
      id="synthesis-inspector"
      className="explorer-inspector"
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <header>
        <strong>
          {node?.label ?? net?.name ?? (edge ? edge.label : "Design overview")}
        </strong>
        <button
          onClick={onClose}
          aria-label="Minimize inspector"
          title="Minimize to toolbar"
        >
          −
        </button>
      </header>
      {node || edge || net ? (
        <>
          <p>
            {node?.detail ??
              `${net ? "Signal" : "Connection"} · ${(net?.bits.length ?? edge?.width) || "unknown"} bits`}
          </p>
          <code>{selection}</code>
          {node ? (
            <>
              <p>
                {node.category}
                {node.module ? ` · module ${node.module}` : ""}
              </p>
              <div className="explorer-property">
                {[
                  "WIDTH",
                  "A_WIDTH",
                  "B_WIDTH",
                  "STATE_NUM",
                  "STATE_BITS",
                  "SIZE",
                  "ABITS",
                  "RD_PORTS",
                  "WR_PORTS",
                ].map((name) => {
                  const value = parameterNumber(node.parameters[name]);
                  return value === undefined ? null : (
                    <span key={name}>
                      {name.toLowerCase().replaceAll("_", " ")}: {value}
                    </span>
                  );
                })}
              </div>
              <p>
                Combinational depth:{" "}
                {depth.depths.get(node.id) ?? "Unavailable"}
              </p>
              <h3>Pins and controls</h3>
              {node.pins.length ? (
                node.pins.map((pin) => (
                  <div key={pin.name} className="explorer-property">
                    <strong>{pin.name}</strong>
                    <span>
                      {pin.direction} · {pin.bits.length} bits · {pin.role}
                    </span>
                    <code>{pin.bits.join(", ")}</code>
                    {(() => {
                      const alias = graph.nets.find(
                        (net) =>
                          net.bits.length === pin.bits.length &&
                          net.bits.every((bit, i) => bit === pin.bits[i]) &&
                          values?.has(net.id),
                      );
                      return alias ? (
                        <span>
                          Recorded RTL: {values!.get(alias.id)!.value}
                        </span>
                      ) : null;
                    })()}
                  </div>
                ))
              ) : (
                <p>Pin information unavailable.</p>
              )}
            </>
          ) : null}
          {net ? (
            <>
              <label>
                Trace bus / bit
                <select
                  value={bit === undefined ? "" : String(net.bits.indexOf(bit))}
                  onChange={(event) =>
                    onBit(
                      event.target.value === ""
                        ? undefined
                        : net.bits[Number(event.target.value)],
                    )
                  }
                >
                  <option value="">Entire bus</option>
                  {net.bits.map((b, i) => (
                    <option key={i} value={i}>
                      [
                      {net.upto
                        ? net.offset + net.bits.length - 1 - i
                        : net.offset + i}
                      ] · net bit {b}
                    </option>
                  ))}
                </select>
              </label>
              <code>LSB-first Yosys bits: {net.bits.join(", ")}</code>
              <p>
                Recorded RTL: {values?.get(net.id)?.value ?? waveformReason}
                {bit !== undefined && values?.has(net.id)
                  ? ` · selected bit: ${values.get(net.id)!.value.at(-1 - net.bits.indexOf(bit))}`
                  : ""}
              </p>
            </>
          ) : null}
          {edge ? (
            <>
              <h3>Bit connections</h3>
              <code>
                {edge.connections
                  .map(
                    (connection) =>
                      `${edge.fromPort}[${connection.fromIndex}] → ${edge.toPort}[${connection.toIndex}] (net ${connection.bit})`,
                  )
                  .join("; ") || "Bit metadata unavailable."}
              </code>
            </>
          ) : null}
          <h3>Drivers and destinations</h3>
          {related.length ? (
            related.slice(0, 100).map((connection) => (
              <div className="explorer-connection" key={connection.id}>
                <button onClick={() => onSelect(connection.from)}>
                  {connection.from.replace(/^(cell|port):/, "")}.
                  {connection.fromPort}
                </button>
                <span> → </span>
                <button onClick={() => onSelect(connection.to)}>
                  {connection.to.replace(/^(cell|port):/, "")}.
                  {connection.toPort}
                </button>
                <small>
                  {connection.width || "?"} bits · {connection.role}
                </small>
              </div>
            ))
          ) : (
            <p>No recorded connections.</p>
          )}
          {related.length > 100 ? (
            <p>
              {related.length - 100} further connections; select a bit to narrow
              the path.
            </p>
          ) : null}
          <h3>Source RTL</h3>
          {sources.length ? (
            sources.map((source, i) => {
              const file = sourceFile(source, diagram.sourceFiles ?? []);
              return (
                <div key={i}>
                  <small>
                    {source.file}:{source.line}.{source.column}–{source.endLine}
                    .{source.endColumn}
                  </small>
                  {file ? (
                    <>
                      <pre>
                        {file.content
                          .split(/\r?\n/)
                          .slice(
                            source.line - 1,
                            Math.min(source.endLine, source.line + 15),
                          )
                          .join("\n")}
                      </pre>
                      <button
                        onClick={() => {
                          void publishExplorer({
                            type: "rtl-navigate",
                            projectKey: diagram.projectKey ?? "",
                            fileName: file.name,
                            content: file.content,
                            start: source.line,
                            end: source.endLine,
                            startColumn: source.column,
                            endColumn: source.endColumn,
                          }).catch((error) => setMessage(String(error)));
                        }}
                      >
                        Open in editor
                      </button>
                    </>
                  ) : (
                    <p>Source text is unavailable.</p>
                  )}
                </div>
              );
            })
          ) : (
            <p>
              No source location preserved by Yosys. Optimized or generated
              cells may have no exact RTL correspondence.
            </p>
          )}
          <p>
            Source spans are Yosys provenance; merged spans do not prove a
            one-to-one RTL mapping.
          </p>
          {message ? <p role="status">{message}</p> : null}
          {node ? (
            <>
              <details>
                <summary>Synthesis attributes and parameters</summary>
                <pre>
                  {JSON.stringify(
                    {
                      attributes: node.attributes,
                      parameters: node.parameters,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <p>
                {node.category === "lut" || node.category === "primitive"
                  ? `Mapped resource: ${node.detail}`
                  : "Resource mapping is available in the technology view where supported."}
              </p>
            </>
          ) : null}
          <p>
            No timing data is attached to this netlist. Values require a matched
            recorded waveform.
          </p>
        </>
      ) : (
        <>
          <p>
            {graph.module} · {graph.nodes.length} elements · {graph.nets.length}{" "}
            signal aliases · {graph.edges.length} pin connections
          </p>
          <h3>Combinational logic depth</h3>
          <p>
            Longest resolved path: <strong>{depth.max} operator stages</strong>
          </p>
          <p>
            Module-local connectivity; each combinational cell counts as one
            stage. Storage and module interiors bound paths. This is not a delay
            measurement.
          </p>
          {depth.unresolved ? (
            <p>
              {depth.unresolved} elements have unresolved depth (feedback or
              paths downstream of it).
            </p>
          ) : null}
          <h3>Hardware categories</h3>
          {[
            ...new Set(
              graph.nodes
                .filter((node) => node.kind === "cell")
                .map((node) => node.category),
            ),
          ].map((category) => (
            <button
              className="explorer-stat"
              key={category}
              onClick={() => onCategory(category)}
            >
              {category}
              <strong>
                {
                  graph.nodes.filter((node) => node.category === category)
                    .length
                }
              </strong>
            </button>
          ))}
          <h3>Previous-build comparison</h3>
          {diagram.previousBuild ? (
            <>
              <p>
                Compared with the preceding successful synthesis for this top
                module and FPGA.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Previous</th>
                    <th>Current</th>
                    <th>Δ cells</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((stage) => {
                    const previous = diagram.previousBuild?.stages[stage.name];
                    return (
                      <tr key={stage.name}>
                        <td>{stage.name}</td>
                        <td>{previous?.total ?? "—"}</td>
                        <td>{stage.total}</td>
                        <td>{previous ? stage.total - previous.total : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <details>
                <summary>Changes by hardware category</summary>
                {stages.map((stage) => {
                  const previous = diagram.previousBuild?.stages[stage.name];
                  if (!previous) return null;
                  const counts: Record<string, number> = {};
                  for (const [type, count] of Object.entries(previous.types))
                    counts[category(type)] =
                      (counts[category(type)] ?? 0) + count;
                  const categories = [
                    ...new Set([
                      ...Object.keys(stage.counts),
                      ...Object.keys(counts),
                    ]),
                  ].sort();
                  return (
                    <div key={stage.name}>
                      <h3>{stage.name}</h3>
                      {categories.map((category) => (
                        <div className="explorer-stat" key={category}>
                          <span>{category}</span>
                          <span>
                            {counts[category] ?? 0} →{" "}
                            {stage.counts[category] ?? 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </details>
            </>
          ) : (
            <p>
              No preceding compatible build. Run synthesis again to compare.
            </p>
          )}
          <h3>Optimization checkpoints</h3>
          {diagram.optimizationHistory?.length ? (
            <>
              <p>
                Measured counts after synthesis pass groups. Deltas do not
                establish cell equivalence or explain every transformation.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Checkpoint</th>
                    <th>Cells</th>
                    <th>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {diagram.optimizationHistory.map((step, i, steps) => (
                    <tr key={step.name}>
                      <td>{step.name}</td>
                      <td>{step.stats.total}</td>
                      <td>
                        {i ? step.stats.total - steps[i - 1].stats.total : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p>Re-run synthesis to collect optimization checkpoints.</p>
          )}
          <h3>Synthesis stage comparison</h3>
          <p>
            Measured snapshots show count changes, not a complete transformation
            history. Mapping and memory expansion can increase cell counts.
          </p>
          <table>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Leaf cells</th>
                <th>Instances</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => (
                <tr key={stage.name}>
                  <td>{stage.name as Abstraction}</td>
                  <td>{stage.total}</td>
                  <td>{stage.instances}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stages.some((stage) => stage.name === "logic") &&
          stages.some((stage) => stage.name === "functional") ? (
            <p>
              Functional → logic leaf-cell change:{" "}
              {stages.find((stage) => stage.name === "logic")!.total -
                stages.find((stage) => stage.name === "functional")!.total}
              . This alone does not identify which optimization removed or
              transformed a cell.
            </p>
          ) : null}
          <p>
            Functional preserves process-lowered operations and collected
            memories. Logic includes optimization, FSM and memory passes.
            Technology uses the target's Yosys synth pass.
          </p>
        </>
      )}
    </aside>
  );
}
