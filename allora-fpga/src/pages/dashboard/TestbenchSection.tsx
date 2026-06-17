import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { BoardDefinition } from "../../data/boards";
import {
  createTauriChannel,
  hasTauriInvoke,
  invokeTauri,
} from "../../lib/tauri";
import InfoCard, { InfoRow } from "./InfoCard";
import {
  createSuggestedMappings,
  findPorts,
  type HdlPort,
} from "./pinMappingUtils";
import VirtualBoard, {
  type BoardSignalStates,
} from "../../components/VirtualBoard";
import type { ProjectFile } from "./types";

type SimulateTestbenchResponse = {
  logs: string[];
  topModule: string;
  waveformName: string;
  waveformPath?: string | null;
  vcd: string;
};

type WaveSignal = {
  id: string;
  name: string;
  shortName: string;
  width: number;
  values: { time: number; value: string }[];
};

type Waveform = {
  timescale: string;
  endTime: number;
  signals: WaveSignal[];
};

type TestbenchSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
  projectPath?: string;
  topLevelFileName: string | null;
  onCreateTestbench: (fileName: string, content: string) => void;
  onOpenFile: (fileName: string) => void;
  onAddArtifact?: (artifact: {
    fileName: string;
    content: string;
    path?: string;
  }) => Promise<void> | void;
};

export default function TestbenchSection({
  board,
  files,
  projectName,
  projectPath,
  topLevelFileName,
  onCreateTestbench,
  onOpenFile,
  onAddArtifact,
}: TestbenchSectionProps) {
  const [selectedTestbenchName, setSelectedTestbenchName] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [waveformText, setWaveformText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const hdlFiles = files.filter(
    (file) => isHdlFile(file.name) && !isVhdlFile(file.name),
  );
  const inferredTopLevel =
    topLevelFileName && hdlFiles.some((file) => file.name === topLevelFileName)
      ? topLevelFileName
      : inferDesignFileName(hdlFiles);
  const selectedTopLevel = inferredTopLevel
    ? (hdlFiles.find((file) => file.name === inferredTopLevel) ?? null)
    : null;
  const topModule = useMemo(
    () => findTopModule(selectedTopLevel ? [selectedTopLevel] : hdlFiles),
    [hdlFiles, selectedTopLevel],
  );
  const testbenchFiles = hdlFiles.filter((file) =>
    isTestbenchFile(file, topModule),
  );
  const vcdFiles = files.filter(
    (file) => file.name.toLowerCase().endsWith(".vcd") && !file.isBinary,
  );
  const inferredTestbench = inferTestbenchFile(
    testbenchFiles,
    topModule,
    selectedTopLevel?.name,
  );
  const selectedTestbench =
    testbenchFiles.find((file) => file.name === selectedTestbenchName) ??
    inferredTestbench ??
    null;
  const designFiles = hdlFiles.filter(
    (file) => file.name !== selectedTestbench?.name,
  );
  const testbenchTopModule = useMemo(
    () => findTopModule(selectedTestbench ? [selectedTestbench] : []),
    [selectedTestbench],
  );
  const topLevelPorts = useMemo(
    () =>
      findPorts(
        selectedTopLevel && !isVhdlFile(selectedTopLevel.name)
          ? [selectedTopLevel]
          : [],
      ),
    [selectedTopLevel],
  );
  const waveform = useMemo(
    () => parseVcd(waveformText || vcdFiles[0]?.content || ""),
    [vcdFiles, waveformText],
  );
  const canRun = Boolean(selectedTestbench && designFiles.length > 0);

  function createTestbench() {
    const moduleName = topModule ?? "top";
    const extension = projectName.toLowerCase().endsWith("sv") ? "sv" : "sv";
    const baseName = `${moduleName}_tb.${extension}`;
    const fileName = uniqueFileName(baseName, files);
    const content = createTestbenchTemplate(
      moduleName,
      board.name,
      topLevelPorts,
    );
    onCreateTestbench(fileName, content);
    setSelectedTestbenchName(fileName);
  }

  async function runSimulation() {
    if (!selectedTestbench) {
      setErrorMessage("Create or select a testbench first.");
      return;
    }

    if (designFiles.length === 0) {
      setErrorMessage(
        "No Verilog/SystemVerilog design files found to simulate.",
      );
      return;
    }

    if (!hasTauriInvoke()) {
      setErrorMessage(
        "Launch the Tauri desktop app to run the real simulator.",
      );
      return;
    }

    setIsRunning(true);
    setErrorMessage("");
    setLogs([
      "[simulation] Starting",
      `Board context: ${board.name}`,
      `Testbench: ${selectedTestbench.name}`,
    ]);

    const logChannel = createTauriChannel<string>((line) => {
      setLogs((current) => [...current, line]);
    });

    try {
      const result = await invokeTauri<SimulateTestbenchResponse>(
        "simulate_testbench",
        {
          onLog: logChannel,
          request: {
            projectName,
            sourceFiles: designFiles.map((file) => ({
              name: file.name,
              content: file.content,
            })),
            testbenchFile: {
              name: selectedTestbench.name,
              content: selectedTestbench.content,
            },
            topModule: testbenchTopModule,
            projectPath,
          },
        },
      );

      setLogs(result.logs);
      setWaveformText(result.vcd);
      await onAddArtifact?.({
        fileName: result.waveformName,
        content: result.vcd,
        path: result.waveformPath ?? undefined,
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setLogs((current) => [
        ...current,
        "[simulation] Failed",
        getErrorMessage(error),
      ]);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 250px",
        gap: "18px",
        height: "calc(100vh - 48px)",
        boxSizing: "border-box",
        padding: "8px",
        margin: "-8px",
        minHeight: 0,
        overflow: "visible",
      }}
    >
      <InfoCard
        title="Testbench"
        style={{
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "visible",
        }}
      >
        <div className="testbench-toolbar">
          <label className="synthesis-top-level-field">
            <span>Testbench</span>
            <select
              className="synthesis-top-level-select"
              value={selectedTestbench?.name ?? ""}
              onChange={(event) => setSelectedTestbenchName(event.target.value)}
            >
              {testbenchFiles.length === 0 ? (
                <option value="">No testbench files</option>
              ) : null}
              {testbenchFiles.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="synthesis-secondary-button"
            onClick={createTestbench}
          >
            New Testbench
          </button>

          <button
            type="button"
            className="primary-action synthesis-generate-button"
            disabled={!canRun || isRunning}
            onClick={() => void runSimulation()}
          >
            {isRunning ? "Running..." : "Run Simulation"}
          </button>
        </div>

        {errorMessage ? (
          <div className="testbench-status error">{errorMessage}</div>
        ) : (
          <div className="testbench-status">
            Real simulation uses local `iverilog` and `vvp`, then renders the
            generated VCD waveform.
          </div>
        )}

        <WaveformViewer waveform={waveform} />

        <BoardPlayback
          board={board}
          waveform={waveform}
          ports={topLevelPorts}
        />
      </InfoCard>

      <div className="testbench-side">
        <InfoCard
          title="Setup"
          style={{ padding: "14px", borderRadius: "16px" }}
          compact
        >
          <InfoRow
            label="Design Top"
            value={topModule ?? "Not found"}
            compact
          />
          <InfoRow
            label="TB Top"
            value={testbenchTopModule ?? "Not found"}
            compact
          />
          <InfoRow
            label="Design Files"
            value={String(designFiles.length)}
            compact
          />
          <InfoRow
            label="Testbenches"
            value={String(testbenchFiles.length)}
            compact
          />
          <InfoRow
            label="Waveforms"
            value={String(vcdFiles.length + (waveformText ? 1 : 0))}
            compact
          />
        </InfoCard>

        <InfoCard
          title="Files"
          style={{ padding: "14px", borderRadius: "16px" }}
          compact
        >
          <div className="testbench-file-list">
            {[...testbenchFiles, ...vcdFiles].map((file) => (
              <button
                key={file.name}
                type="button"
                onClick={() => onOpenFile(file.name)}
              >
                {file.name}
              </button>
            ))}
            {testbenchFiles.length === 0 && vcdFiles.length === 0 ? (
              <div className="testbench-empty">
                No testbench or waveform files yet.
              </div>
            ) : null}
          </div>
        </InfoCard>

        <InfoCard
          title="Simulator Log"
          style={{
            padding: "14px",
            borderRadius: "16px",
            minHeight: 0,
            overflow: "hidden",
          }}
          compact
        >
          <pre className="testbench-log" ref={logRef}>
            {logs.length
              ? logs.join("\n")
              : "Run a simulation to see compiler and runtime output."}
          </pre>
        </InfoCard>
      </div>
    </div>
  );
}

const PLAYBACK_SECONDS = 10;

/**
 * Replays the simulated waveform onto the virtual board: LEDs light up with
 * the values their mapped top-level signals had at the playback cursor.
 */
function BoardPlayback({
  board,
  waveform,
  ports,
}: {
  board: BoardDefinition;
  waveform: Waveform | null;
  ports: HdlPort[];
}) {
  const [fraction, setFraction] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const resolvers = useMemo(
    () => buildPinResolvers(board, waveform, ports),
    [board, waveform, ports],
  );

  useEffect(() => {
    if (!isPlaying) return;

    let last = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setFraction((current) => {
        const next = current + (delta * speed) / PLAYBACK_SECONDS;
        return next >= 1 ? next - Math.floor(next) : next;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, speed]);

  if (!waveform || resolvers.size === 0) return null;

  const endTime = Math.max(waveform.endTime, 1);
  const time = fraction * endTime;
  const signalStates: BoardSignalStates = {};
  for (const [pinName, resolve] of resolvers) {
    signalStates[pinName] = resolve(time);
  }

  return (
    <div className="board-playback">
      <div className="board-playback-controls">
        <button
          type="button"
          className="synthesis-secondary-button"
          onClick={() => setIsPlaying((current) => !current)}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <input
          className="board-playback-slider"
          type="range"
          min={0}
          max={1000}
          value={Math.round(fraction * 1000)}
          onChange={(event) => {
            setFraction(Number(event.target.value) / 1000);
          }}
          aria-label="Playback position"
        />
        <select
          className="board-playback-speed"
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
          aria-label="Playback speed"
        >
          <option value={0.25}>0.25x</option>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
        <span className="board-playback-time">
          {formatWaveTick(Math.round(time), waveform.timescale)}
        </span>
      </div>
      <VirtualBoard board={board} signalStates={signalStates} maxHeight={230} />
    </div>
  );
}

function buildPinResolvers(
  board: BoardDefinition,
  waveform: Waveform | null,
  ports: HdlPort[],
) {
  const resolvers = new Map<string, (time: number) => boolean | undefined>();
  if (!waveform) return resolvers;

  const suggested = createSuggestedMappings(ports, board.pins, board.clocks);

  for (const port of ports) {
    const mappingKey = suggested[port.name];
    if (!mappingKey?.startsWith("pin:")) continue;

    const pinName = mappingKey.split(":")[1];
    if (!pinName || resolvers.has(pinName)) continue;

    const baseName = port.baseName ?? port.name;
    const signal = findWaveSignal(waveform.signals, baseName);
    if (!signal) continue;

    const bitIndex = port.index;
    resolvers.set(pinName, (time) => {
      const value = getSignalValueAt(signal.values, time);
      if (!value) return undefined;
      return interpretSignalBit(value, signal.width, bitIndex);
    });
  }

  return resolvers;
}

function findWaveSignal(signals: WaveSignal[], baseName: string) {
  const candidates = signals.filter((signal) => signal.shortName === baseName);
  if (candidates.length === 0) return null;

  // Prefer the shallowest scope (the testbench-level wire over dut internals).
  return candidates.reduce((best, candidate) =>
    candidate.name.split(".").length < best.name.split(".").length
      ? candidate
      : best,
  );
}

function getSignalValueAt(
  values: WaveSignal["values"],
  time: number,
): string | null {
  if (values.length === 0) return null;

  let low = 0;
  let high = values.length - 1;
  let result = values[0].value;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle].time <= time) {
      result = values[middle].value;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}

function interpretSignalBit(
  value: string,
  width: number,
  bitIndex: number | undefined,
): boolean | undefined {
  const normalized = value.toLowerCase();

  let bit: string;
  if (bitIndex === undefined || width <= 1) {
    bit = normalized[normalized.length - 1] ?? "";
  } else {
    // VCD bus values are msb-first and may omit leading zeros.
    const position = normalized.length - 1 - bitIndex;
    bit = position >= 0 ? normalized[position] : "0";
  }

  if (bit === "1") return true;
  if (bit === "0") return false;
  return undefined;
}

function WaveformViewer({ waveform }: { waveform: Waveform | null }) {
  const [zoom, setZoom] = useState(1);
  const visibleSignals = waveform?.signals.slice(0, 18) ?? [];
  const endTime = Math.max(waveform?.endTime ?? 1, 1);
  const clockPeriod = waveform ? inferClockPeriod(waveform.signals) : null;
  const defaultWindow = clockPeriod
    ? Math.min(endTime, clockPeriod * 20)
    : endTime;
  const autoScale = Math.max(1, endTime / Math.max(defaultWindow, 1));
  const timeWidth = Math.round(980 * autoScale * zoom);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
    Math.round(endTime * ratio),
  );
  const zoomLabel = `${Math.round(autoScale * zoom * 100)}%`;

  if (!waveform || visibleSignals.length === 0) {
    return (
      <div className="waveform-shell waveform-empty">
        <div>
          <strong>No waveform loaded</strong>
          <span>
            Run a testbench or import a `.vcd` file with `$dumpvars` data.
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="waveform-controls">
        <div className="waveform-scale-readout">
          <span>{clockPeriod ? `20 cycles/window` : "Full timeline"}</span>
          <strong>{zoomLabel}</strong>
        </div>
        <button
          type="button"
          onClick={() => setZoom((current) => Math.max(0.25, current / 1.35))}
        >
          Zoom Out
        </button>
        <button type="button" onClick={() => setZoom(1)}>
          Reset
        </button>
        <button
          type="button"
          onClick={() => setZoom((current) => Math.min(12, current * 1.35))}
        >
          Zoom In
        </button>
      </div>

      <div
        className="waveform-shell"
        style={{ "--wave-time-width": `${timeWidth}px` } as CSSProperties}
        onWheel={(event) => {
          // Only zoom when a modifier is held (Ctrl/Cmd), so a plain wheel
          // gesture scrolls the page/signal list as expected.
          if (!event.ctrlKey && !event.metaKey) {
            return;
          }

          event.preventDefault();
          setZoom((current) => {
            const next = event.deltaY < 0 ? current * 1.007 : current / 1.007;
            return Math.min(12, Math.max(0.25, next));
          });
        }}
      >
        <div className="waveform-header">
          <div>Signal</div>
          <div className="waveform-ticks">
            {ticks.map((tick) => (
              <span key={tick}>{formatWaveTick(tick, waveform.timescale)}</span>
            ))}
          </div>
        </div>

        <div className="waveform-rows">
          {visibleSignals.map((signal) => (
            <div className="waveform-row" key={signal.id}>
              <div className="waveform-signal-name">
                <span title={signal.name}>{signal.shortName}</span>
                {signal.name !== signal.shortName ? (
                  <em>{signal.name}</em>
                ) : null}
                <small>
                  {signal.width > 1 ? `${signal.width} bits` : "1 bit"}
                </small>
              </div>
              <SignalWave
                signal={signal}
                endTime={endTime}
                timeWidth={timeWidth}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SignalWave({
  signal,
  endTime,
  timeWidth,
}: {
  signal: WaveSignal;
  endTime: number;
  timeWidth: number;
}) {
  const segments = signal.values
    .map((value, index) => {
      const nextTime = signal.values[index + 1]?.time ?? endTime;
      const widthPercent = Math.max(
        ((nextTime - value.time) / endTime) * 100,
        0,
      );
      const widthPx = (widthPercent / 100) * timeWidth;
      const displayValue = formatSignalValue(signal, value.value);
      return {
        ...value,
        displayValue,
        left: `${(value.time / endTime) * 100}%`,
        width: `${widthPercent}%`,
        leftPx: (value.time / endTime) * timeWidth,
        widthPx,
        showLabel:
          signal.width > 1 &&
          widthPx >= Math.max(8, 4 * Math.max(1, displayValue.length) + 2),
      };
    })
    .filter((segment) => Number.parseFloat(segment.width) > 0.05);
  const transitions =
    signal.width === 1
      ? segments
          .slice(1)
          .filter((segment, index) => segment.value !== segments[index]?.value)
          .map((segment) => ({ left: segment.left, time: segment.time }))
      : [];
  const busTransitions =
    signal.width > 1
      ? segments
          .slice(1)
          .filter(
            (segment, index) =>
              segment.value !== segments[index]?.value &&
              segment.leftPx - segments[index].leftPx >= 12,
          )
          .map((segment) => ({ left: segment.left, time: segment.time }))
      : [];

  return (
    <div
      className={`waveform-lane ${signal.width > 1 ? "bus-lane" : "bit-lane"}`}
    >
      {transitions.map((transition) => (
        <span
          className="waveform-transition"
          key={`transition-${transition.time}`}
          style={{ left: transition.left }}
        />
      ))}
      {busTransitions.map((transition) => (
        <span
          className="waveform-bus-transition"
          key={`bus-transition-${transition.time}`}
          style={{ left: transition.left }}
        />
      ))}
      {segments.map((segment, index) => {
        const normalized = segment.value.toLowerCase();
        const high = normalized === "1";
        const unknown = normalized.includes("x") || normalized.includes("z");
        return (
          <div
            className={[
              "waveform-segment",
              high ? "high" : "",
              unknown ? "unknown" : "",
              signal.width > 1 ? "bus" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={`${segment.time}-${index}`}
            style={{ left: segment.left, width: segment.width }}
            title={`${signal.name} = ${segment.value} @ ${segment.time}`}
          >
            {segment.showLabel ? segment.displayValue : ""}
          </div>
        );
      })}
    </div>
  );
}

function formatWaveTick(value: number, unit: string) {
  if (value === 0) return `0 ${unit}`;
  if (Math.abs(value) >= 1000) {
    const compact = value / 1000;
    return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}k ${unit}`;
  }

  return `${value} ${unit}`;
}

function formatSignalValue(signal: WaveSignal, value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("x")) return "X";
  if (normalized.includes("z")) return "Z";
  if (signal.width > 3 && /^[01]+$/.test(value)) {
    return `0x${Number.parseInt(value, 2).toString(16).toUpperCase()}`;
  }

  return value;
}

function inferClockPeriod(signals: WaveSignal[]) {
  const clockSignal = signals.find(
    (signal) =>
      signal.width === 1 && /(^|[._])(clk|clock|sysclk)$/i.test(signal.name),
  );
  if (!clockSignal) return null;

  const risingEdges: number[] = [];
  const toggles: number[] = [];

  for (let index = 1; index < clockSignal.values.length; index++) {
    const previous = clockSignal.values[index - 1];
    const current = clockSignal.values[index];
    if (previous.value === current.value) continue;
    if (/^[01]$/.test(previous.value) && /^[01]$/.test(current.value)) {
      toggles.push(current.time);
    }
    if (previous.value === "0" && current.value === "1") {
      risingEdges.push(current.time);
    }
  }

  const periods = risingEdges
    .slice(1)
    .map((time, index) => time - risingEdges[index])
    .filter((period) => period > 0);

  if (periods.length > 0) {
    return median(periods);
  }

  const halfPeriods = toggles
    .slice(1)
    .map((time, index) => time - toggles[index])
    .filter((period) => period > 0);

  return halfPeriods.length > 0 ? median(halfPeriods) * 2 : null;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function parseVcd(content: string): Waveform | null {
  if (!content.trim()) return null;

  const variables = new Map<string, { name: string; width: number }>();
  const values = new Map<string, { time: number; value: string }[]>();
  const scopes: string[] = [];
  let currentTime = 0;
  let endTime = 0;
  let timescale = "ns";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("$timescale")) {
      timescale = line
        .replace("$timescale", "")
        .replace("$end", "")
        .trim()
        .replace(/\s+/g, "");
      continue;
    }

    if (line.startsWith("$scope")) {
      const parts = line.split(/\s+/);
      if (parts[2]) scopes.push(parts[2]);
      continue;
    }

    if (line.startsWith("$upscope")) {
      scopes.pop();
      continue;
    }

    if (line.startsWith("$var")) {
      const parts = line.split(/\s+/);
      const width = Number(parts[2]) || 1;
      const id = parts[3];
      const shortName = parts.slice(4, -1).join(" ");
      const scopedName = [...scopes, shortName].filter(Boolean).join(".");
      variables.set(id, { name: scopedName || shortName, width });
      values.set(id, [
        { time: 0, value: width > 1 ? "x".repeat(Math.min(width, 8)) : "x" },
      ]);
      continue;
    }

    if (line.startsWith("#")) {
      currentTime = Number(line.slice(1)) || 0;
      endTime = Math.max(endTime, currentTime);
      continue;
    }

    if (line[0] === "b") {
      const [value, id] = line.slice(1).split(/\s+/);
      pushValue(values, id, currentTime, value);
      continue;
    }

    if (/^[01xz]/i.test(line)) {
      pushValue(values, line.slice(1), currentTime, line[0]);
    }
  }

  const signals = [...variables.entries()].map(([id, variable]) => ({
    id,
    name: variable.name,
    shortName: variable.name.split(".").pop() ?? variable.name,
    width: variable.width,
    values: compactValues(mergeSameTimeValues(values.get(id) ?? [])),
  }));

  return { timescale, endTime, signals: dedupeSignalAliases(signals) };
}

function dedupeSignalAliases(signals: WaveSignal[]) {
  const unique = new Map<string, WaveSignal>();

  for (const signal of signals) {
    const key = `${signal.shortName}|${signal.width}|${valueSignature(signal.values)}`;
    const existing = unique.get(key);

    if (!existing || preferSignalAlias(signal, existing)) {
      unique.set(key, signal);
    }
  }

  return [...unique.values()];
}

function valueSignature(values: WaveSignal["values"]) {
  return values.map((value) => `${value.time}:${value.value}`).join(",");
}

function preferSignalAlias(candidate: WaveSignal, current: WaveSignal) {
  const candidateIsDut = candidate.name.includes(".dut.");
  const currentIsDut = current.name.includes(".dut.");
  if (candidateIsDut !== currentIsDut) return !candidateIsDut;
  return candidate.name.length < current.name.length;
}

function pushValue(
  values: Map<string, { time: number; value: string }[]>,
  id: string | undefined,
  time: number,
  value: string,
) {
  if (!id || !values.has(id)) return;
  values.get(id)?.push({ time, value });
}

function compactValues(values: { time: number; value: string }[]) {
  return values.filter(
    (value, index) => index === 0 || values[index - 1].value !== value.value,
  );
}

function mergeSameTimeValues(values: { time: number; value: string }[]) {
  const merged: { time: number; value: string }[] = [];

  for (const value of values) {
    const previous = merged[merged.length - 1];
    if (previous?.time === value.time) {
      previous.value = value.value;
    } else {
      merged.push({ ...value });
    }
  }

  return merged;
}

function createTestbenchTemplate(
  moduleName: string,
  boardName: string,
  ports: HdlPort[],
) {
  const signals = createTestbenchSignals(ports);
  const declarations = signals.length
    ? signals
        .map((signal) =>
          `  ${signal.direction === "input" ? "reg" : "wire"}${signal.range ? ` ${signal.range}` : ""} ${signal.name} = ${signal.direction === "input" ? `${signal.width}'d0` : ""};`.replace(
            " = ;",
            ";",
          ),
        )
        .join("\n")
    : "  reg clk = 0;\n  reg rst = 1;";
  const connections = signals.length
    ? signals.map((signal) => `    .${signal.name}(${signal.name})`).join(",\n")
    : "    .clk(clk),\n    .rst(rst)";
  const clockSignal = signals.find((signal) =>
    /^(clk|clock|sysclk)$/i.test(signal.name),
  );
  const resetSignal = signals.find((signal) =>
    /^(rst|reset|rst_n|reset_n)$/i.test(signal.name),
  );
  const resetAssert = resetSignal
    ? `    #20 ${resetSignal.name} = ${resetSignal.name.endsWith("_n") ? "1" : "0"};`
    : "    #20;";

  return `\`timescale 1ns / 1ps

module ${moduleName}_tb;
${declarations}

  ${moduleName} dut (
${connections}
  );

${clockSignal ? `  always #5 ${clockSignal.name} = ~${clockSignal.name};` : "  // Add a clock generator here if your DUT needs one."}

  initial begin
    $dumpfile("waveform.vcd");
    $dumpvars(0, ${moduleName}_tb);

    // ${boardName} simulation stimulus
${resetAssert}
    #200;
    $finish;
  end
endmodule
`;
}

function createTestbenchSignals(ports: HdlPort[]) {
  const grouped = new Map<
    string,
    { direction: HdlPort["direction"]; indexes: number[] }
  >();

  for (const port of ports) {
    const name = port.baseName ?? port.name;
    const current = grouped.get(name) ?? {
      direction: port.direction,
      indexes: [],
    };
    if (port.index !== undefined) {
      current.indexes.push(port.index);
    }
    grouped.set(name, current);
  }

  return [...grouped.entries()].map(([name, info]) => {
    const min = info.indexes.length ? Math.min(...info.indexes) : 0;
    const max = info.indexes.length ? Math.max(...info.indexes) : 0;
    const width = info.indexes.length ? Math.abs(max - min) + 1 : 1;
    return {
      name,
      direction: info.direction,
      width,
      range: width > 1 ? `[${max}:${min}]` : "",
    };
  });
}

function uniqueFileName(fileName: string, files: ProjectFile[]) {
  if (!files.some((file) => file.name === fileName)) return fileName;
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
  const extension = dotIndex === -1 ? "" : fileName.slice(dotIndex);
  let index = 2;

  while (files.some((file) => file.name === `${stem}-${index}${extension}`)) {
    index++;
  }

  return `${stem}-${index}${extension}`;
}

function findTopModule(files: ProjectFile[]) {
  for (const file of files) {
    const match = file.content.match(/\bmodule\s+([a-zA-Z_][a-zA-Z0-9_$]*)/);
    if (match) return match[1];
  }

  return null;
}

function isHdlFile(fileName: string) {
  return /\.(v|sv|vhd|vhdl)$/i.test(fileName);
}

function isVhdlFile(fileName: string) {
  return /\.(vhd|vhdl)$/i.test(fileName);
}

function inferDesignFileName(files: ProjectFile[]) {
  return (
    files.find((file) => !isLikelyTestbenchName(file.name))?.name ??
    files[0]?.name ??
    null
  );
}

function inferTestbenchFile(
  files: ProjectFile[],
  topModule: string | null,
  designFileName?: string,
) {
  if (files.length === 0) return null;

  const normalizedTop = topModule ? normalizeName(topModule) : "";
  const designStem = designFileName
    ? normalizeName(stripExtension(designFileName))
    : "";

  return (
    files.find((file) => {
      const stem = normalizeName(stripExtension(file.name));
      return Boolean(
        normalizedTop &&
        (stem === `${normalizedTop}tb` || stem === `tb${normalizedTop}`),
      );
    }) ??
    files.find((file) => {
      const stem = normalizeName(stripExtension(file.name));
      return Boolean(
        designStem &&
        (stem === `${designStem}tb` || stem === `tb${designStem}`),
      );
    }) ??
    files.find((file) =>
      /(^|[_\-.])(tb|testbench)([_\-.]|$)/i.test(file.name),
    ) ??
    files[0]
  );
}

function isTestbenchFile(file: ProjectFile, topModule: string | null) {
  if (isLikelyTestbenchName(file.name)) return true;

  const moduleName = findTopModule([file]);
  if (!moduleName) return false;

  const normalizedModule = normalizeName(moduleName);
  const normalizedTop = topModule ? normalizeName(topModule) : "";
  return (
    normalizedModule.includes("testbench") ||
    normalizedModule.endsWith("tb") ||
    normalizedModule.startsWith("tb") ||
    Boolean(normalizedTop && normalizedModule === `${normalizedTop}tb`)
  );
}

function isLikelyTestbenchName(fileName: string) {
  return /(^|[_\-.])(tb|testbench)([_\-.]|$)/i.test(fileName);
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.(v|sv|vhd|vhdl)$/i, "");
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "Simulation failed.";
}
