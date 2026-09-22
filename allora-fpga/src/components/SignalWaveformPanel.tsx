import "../styles/virtual-fpga.css";

export type SignalWavePoint = {
  time: number;
  value: string;
};

export type SignalWaveTrace = {
  id: string;
  name: string;
  fullName?: string;
  width: number;
  direction?: "input" | "output" | "inout" | "unknown";
  values: SignalWavePoint[];
};

type Props = {
  title?: string;
  subtitle: string;
  traces: SignalWaveTrace[];
  selectedSignalIds: string[];
  onToggleSignal: (signalId: string) => void;
  emptyMessage: string;
  formatTime?: (time: number) => string;
};

const ROW_HEIGHT = 42;

export default function SignalWaveformPanel({
  title = "Live waveform",
  subtitle,
  traces,
  selectedSignalIds,
  onToggleSignal,
  emptyMessage,
  formatTime,
}: Props) {
  const visibleTraces = selectedSignalIds
    .map((signalId) => traces.find((trace) => trace.id === signalId))
    .filter((trace): trace is SignalWaveTrace => Boolean(trace));
  const height = Math.max(86, visibleTraces.length * ROW_HEIGHT + 12);
  const pointTimes = traces.flatMap((trace) =>
    trace.values.map((point) => point.time),
  );
  const startTime = pointTimes.length ? Math.min(...pointTimes) : 0;
  const endTime = pointTimes.length ? Math.max(...pointTimes) : 1;

  return (
    <section className="vfpga-panel vfpga-waveform signal-waveform-panel">
      <div className="vfpga-section-title">
        <WavesIcon />
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="vfpga-wave-picker" aria-label="Waveform signals">
          {traces.slice(0, 18).map((trace) => (
            <button
              type="button"
              key={trace.id}
              className={selectedSignalIds.includes(trace.id) ? "active" : ""}
              aria-pressed={selectedSignalIds.includes(trace.id)}
              onClick={() => onToggleSignal(trace.id)}
              title={trace.fullName ?? trace.name}
            >
              {trace.name}
            </button>
          ))}
        </div>
      </div>
      {visibleTraces.length ? (
        <div className="vfpga-wave-grid">
          <div className="vfpga-wave-labels" style={{ height }}>
            {visibleTraces.map((trace) => (
              <button
                type="button"
                key={trace.id}
                onClick={() => onToggleSignal(trace.id)}
                title={trace.fullName ?? trace.name}
              >
                <span className={`direction ${trace.direction ?? ""}`} />
                <strong>{trace.name}</strong>
                <small>
                  {trace.width > 1
                    ? `${trace.width}-bit · ${formatTraceValue(trace)}`
                    : trace.direction ?? formatTraceValue(trace)}
                </small>
              </button>
            ))}
          </div>
          <div className="vfpga-wave-stage" style={{ height }}>
            <svg
              className="vfpga-wave-canvas"
              viewBox={`0 0 1000 ${height}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${title} signal traces`}
              style={{ height }}
            >
              {visibleTraces.map((trace, index) => (
                <g key={trace.id}>
                  <line
                    className="wave-row-line"
                    x1="0"
                    x2="1000"
                    y1={(index + 1) * ROW_HEIGHT}
                    y2={(index + 1) * ROW_HEIGHT}
                  />
                  <path
                    className={`wave-trace trace-${index % 6}`}
                    d={buildWavePath(
                      trace,
                      index,
                      ROW_HEIGHT,
                      startTime,
                      endTime,
                    )}
                  />
                </g>
              ))}
              {visibleTraces.some((trace) => trace.values.length) ? (
                <line
                  className="wave-cursor"
                  x1="984"
                  x2="984"
                  y1="0"
                  y2={height}
                />
              ) : null}
            </svg>
            {formatTime ? (
              <span className="vfpga-wave-time">{formatTime(endTime)}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="vfpga-wave-empty">{emptyMessage}</div>
      )}
    </section>
  );
}

function WavesIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 12h3l2-6 4 12 3-9 2 3h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function buildWavePath(
  trace: SignalWaveTrace,
  row: number,
  rowHeight: number,
  startTime: number,
  endTime: number,
) {
  if (!trace.values.length) return "";
  const top = row * rowHeight + 9;
  const middle = row * rowHeight + rowHeight / 2;
  const bottom = row * rowHeight + rowHeight - 9;
  const width = 968;
  const duration = Math.max(1, endTime - startTime);
  const xFor = (time: number) =>
    ((Math.max(startTime, time) - startTime) / duration) * width;
  const yFor = (value: string) => {
    const normalized = value.toLowerCase();
    if (normalized.includes("x") || normalized.includes("z")) return middle;
    return /^[0]+$/.test(normalized) ? bottom : top;
  };

  let path = `M ${xFor(trace.values[0].time)} ${yFor(trace.values[0].value)}`;
  for (let index = 1; index < trace.values.length; index += 1) {
    const point = trace.values[index];
    path += ` H ${xFor(point.time)} V ${yFor(point.value)}`;
  }
  path += ` H ${width}`;
  return path;
}

function formatTraceValue(trace: SignalWaveTrace) {
  const value = trace.values.at(-1)?.value ?? "—";
  const normalized = value.toLowerCase();
  if (normalized.includes("x")) return "X";
  if (normalized.includes("z")) return "Z";
  if (trace.width > 3 && /^[01]+$/.test(value)) {
    return `0x${Number.parseInt(value, 2).toString(16).toUpperCase()}`;
  }
  return value;
}
