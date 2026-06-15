import type { BoardDefinition } from "../../data/boards";
import { getBoardCapabilities } from "../../data/boardCapabilities";
import {
  getDisplayUtilization,
  readBuildHistory,
  type BuildRecord,
} from "../../lib/buildHistory";
import InfoCard from "./InfoCard";
import type { ProjectFile } from "./types";

type HealthSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  topLevelFileName: string | null;
};

type HealthMetric = {
  label: string;
  value: string;
  state: "good" | "warn" | "pending";
  detail: string;
};

type ParsedBuildReport = {
  timing?: string;
  timingDetail?: string;
  maxFrequency?: string;
  maxFrequencyDetail?: string;
  utilization?: string;
  utilizationDetail?: string;
};

export default function HealthSection({
  board,
  files,
  topLevelFileName,
}: HealthSectionProps) {
  const capabilities = getBoardCapabilities(board);
  const hdlFiles = files.filter((file) => isHdlFile(file.name));
  const constraintFile = files.find((file) =>
    file.name.toLowerCase().endsWith(`.${board.constraintsFile}`),
  );
  const bitstreamFile = files.find((file) =>
    /\.(bit|bin|fs|svf|jed)$/i.test(file.name),
  );
  const buildRecords = readBuildHistory(files);
  const buildReport = combineBuildReports(
    getLatestBuildHistoryReport(buildRecords),
    parseBuildReports(files),
  );
  const bitstreamSize = bitstreamFile
    ? formatBytes(
        bitstreamFile.isBinary
          ? bitstreamFile.content.length
          : byteLength(bitstreamFile.content),
      )
    : "Pending";
  const reportState = bitstreamFile ? "warn" : "pending";
  const reportFallback = bitstreamFile ? "Not reported" : "Pending";
  const reportDetail = bitstreamFile
    ? "No parsed build report metric found"
    : "Available after bitstream generation";

  const metrics: HealthMetric[] = [
    {
      label: "Top Module",
      value: topLevelFileName ?? "Missing",
      state: topLevelFileName ? "good" : "warn",
      detail: topLevelFileName
        ? "Ready for analysis"
        : "Set a top-level HDL file",
    },
    {
      label: "Constraints",
      value: constraintFile?.name ?? "Auto",
      state: constraintFile ? "good" : "pending",
      detail: constraintFile
        ? board.constraintsFile.toUpperCase()
        : "Pins can generate constraints during build",
    },
    {
      label: "Bitstream Size",
      value: bitstreamSize,
      state: bitstreamFile ? "good" : "pending",
      detail: bitstreamFile?.name ?? "No generated artifact yet",
    },
    {
      label: "Timing",
      value: buildReport.timing ?? reportFallback,
      state: buildReport.timing
        ? buildReport.timing.toLowerCase().includes("fail")
          ? "warn"
          : "good"
        : reportState,
      detail: buildReport.timingDetail ?? reportDetail,
    },
    {
      label: "Max Frequency",
      value: buildReport.maxFrequency ?? reportFallback,
      state: buildReport.maxFrequency ? "good" : reportState,
      detail: buildReport.maxFrequencyDetail ?? reportDetail,
    },
    {
      label: "LUT / FF / BRAM / DSP",
      value: buildReport.utilization ?? reportFallback,
      state: buildReport.utilization ? "good" : reportState,
      detail: buildReport.utilizationDetail ?? reportDetail,
    },
  ];

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <InfoCard title="Build Health">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          {metrics.map((metric) => (
            <HealthMetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      </InfoCard>

      <BuildHistoryCard files={files} />

      <InfoCard title="Readiness">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          <ReadinessItem
            label="HDL Sources"
            value={`${hdlFiles.length} files`}
            ready={hdlFiles.length > 0}
          />
          <ReadinessItem
            label="Board Support"
            value={capabilities.bitstream.label}
            ready={capabilities.bitstream.supported}
          />
          <ReadinessItem
            label="Pin Mapping"
            value={capabilities.pinMapping.label}
            ready={capabilities.pinMapping.supported}
          />
          <ReadinessItem
            label="Toolchain"
            value={capabilities.toolchain}
            ready={capabilities.bitstream.supported}
          />
        </div>
      </InfoCard>
    </div>
  );
}

function BuildHistoryCard({ files }: { files: ProjectFile[] }) {
  const records = readBuildHistory(files);
  if (records.length === 0) return null;

  const latest = records[records.length - 1];
  const latestWithMetrics = [...records]
    .reverse()
    .find((record) => (record.utilization?.length ?? 0) > 0);
  const utilization = getDisplayUtilization(
    latestWithMetrics?.utilization ?? [],
  );
  const fmaxSeries = records
    .filter((record) => typeof record.fmaxMhz === "number")
    .slice(-20);
  const recent = [...records].slice(-6).reverse();

  return (
    <InfoCard title="Build History">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <div>
          <div className="build-history-heading">
            Device Utilization
            {latestWithMetrics ? (
              <span className="build-history-subtle">
                {" "}
                · {formatRecordTime(latestWithMetrics.timestamp)}
              </span>
            ) : null}
          </div>
          {utilization.length === 0 ? (
            <div className="build-history-empty">
              No utilization metrics parsed yet. Generate a bitstream to
              populate this.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
              {utilization.map((entry) => {
                const percent = Math.min(100, (entry.used / entry.total) * 100);
                return (
                  <div key={entry.resource}>
                    <div className="build-history-bar-label">
                      <span>{entry.label}</span>
                      <span className="build-history-subtle">
                        {entry.used.toLocaleString()} /{" "}
                        {entry.total.toLocaleString()} (
                        {percent.toFixed(percent < 10 ? 1 : 0)}%)
                      </span>
                    </div>
                    <div className="build-history-bar-track">
                      <div
                        className={`build-history-bar-fill${percent > 90 ? " hot" : ""}`}
                        style={{ width: `${Math.max(percent, 1.5)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="build-history-heading">Max Frequency Trend</div>
          {fmaxSeries.length < 2 ? (
            <div className="build-history-empty">
              {fmaxSeries.length === 1
                ? `Latest: ${fmaxSeries[0].fmaxMhz?.toFixed(2)} MHz. Build again to see a trend.`
                : "Run at least two builds with timing analysis to see a trend."}
            </div>
          ) : (
            <FmaxSparkline records={fmaxSeries} />
          )}

          <div className="build-history-heading" style={{ marginTop: "16px" }}>
            Recent Builds
          </div>
          <div style={{ display: "grid", gap: "6px", marginTop: "10px" }}>
            {recent.map((record) => (
              <div key={record.id} className="build-history-row">
                <span
                  className={`build-history-dot${record.success ? " success" : " failure"}`}
                />
                <span className="build-history-row-time">
                  {formatRecordTime(record.timestamp)}
                </span>
                <span className="build-history-subtle">
                  {record.fmaxMhz
                    ? `${record.fmaxMhz.toFixed(1)} MHz`
                    : record.success
                      ? "—"
                      : "failed"}
                </span>
                <span
                  className="build-history-subtle"
                  style={{ marginLeft: "auto" }}
                >
                  {formatDuration(record.durationMs)}
                </span>
              </div>
            ))}
          </div>
          {latest && !latest.success && latest.message ? (
            <div className="build-history-failure-note">{latest.message}</div>
          ) : null}
        </div>
      </div>
    </InfoCard>
  );
}

function FmaxSparkline({ records }: { records: BuildRecord[] }) {
  const width = 280;
  const height = 64;
  const padding = 6;
  const values = records.map((record) => record.fmaxMhz ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.01);

  const points = values.map((value, index) => {
    const x =
      padding +
      (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y =
      height - padding - ((value - min) / range) * (height - padding * 2);
    return { x, y };
  });

  return (
    <div style={{ marginTop: "10px" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        aria-label="Max frequency trend"
      >
        <polyline
          className="build-history-sparkline"
          fill="none"
          strokeWidth={2}
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        {points.map((point, index) => (
          <circle
            key={index}
            className="build-history-sparkline-dot"
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 3.4 : 2.2}
          />
        ))}
      </svg>
      <div className="build-history-bar-label">
        <span className="build-history-subtle">{min.toFixed(1)} MHz min</span>
        <span className="build-history-subtle">{max.toFixed(1)} MHz max</span>
      </div>
    </div>
  );
}

function formatRecordTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "";
  if (durationMs < 1000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)} s`;
  return `${Math.floor(durationMs / 60_000)}m ${Math.round((durationMs % 60_000) / 1000)}s`;
}

function HealthMetricCard({ metric }: { metric: HealthMetric }) {
  const color = getStateColor(metric.state);

  return (
    <div
      className={`health-metric-card ${metric.state}`}
      style={{
        border: `1px solid ${color.border}`,
        borderRadius: "16px",
        background: color.background,
        padding: "15px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "11px",
          fontWeight: 900,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {metric.label}
      </div>
      <div
        style={{
          marginTop: "8px",
          color: "#0f172a",
          fontSize: "20px",
          fontWeight: 950,
          overflowWrap: "anywhere",
        }}
      >
        {metric.value}
      </div>
      <div
        style={{
          marginTop: "6px",
          color: color.text,
          fontSize: "12px",
          fontWeight: 800,
          lineHeight: 1.35,
        }}
      >
        {metric.detail}
      </div>
    </div>
  );
}

function ReadinessItem({
  label,
  value,
  ready,
}: {
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div
      className="health-readiness-item"
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        background: "#ffffff",
        padding: "13px",
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <div>
        <div style={{ color: "#0f172a", fontSize: "14px", fontWeight: 900 }}>
          {label}
        </div>
        <div
          style={{
            marginTop: "4px",
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 750,
          }}
        >
          {value}
        </div>
      </div>
      <span
        style={{
          flexShrink: 0,
          alignSelf: "center",
          borderRadius: "999px",
          background: ready ? "#dcfce7" : "#f1f5f9",
          color: ready ? "#15803d" : "#64748b",
          padding: "5px 8px",
          fontSize: "11px",
          fontWeight: 900,
        }}
      >
        {ready ? "Ready" : "Pending"}
      </span>
    </div>
  );
}

function getStateColor(state: HealthMetric["state"]) {
  if (state === "good") {
    return { background: "#f0fdf4", border: "#bbf7d0", text: "#15803d" };
  }

  if (state === "warn") {
    return { background: "#fff7ed", border: "#fed7aa", text: "#c2410c" };
  }

  return { background: "#f8fafc", border: "#e2e8f0", text: "#64748b" };
}

function isHdlFile(fileName: string) {
  return /\.(v|sv|vhd|vhdl)$/i.test(fileName);
}

function byteLength(content: string) {
  return new Blob([content]).size;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function combineBuildReports(
  historyReport: ParsedBuildReport,
  fileReport: ParsedBuildReport,
): ParsedBuildReport {
  return {
    timing: historyReport.timing ?? fileReport.timing,
    timingDetail: historyReport.timingDetail ?? fileReport.timingDetail,
    maxFrequency: historyReport.maxFrequency ?? fileReport.maxFrequency,
    maxFrequencyDetail:
      historyReport.maxFrequencyDetail ?? fileReport.maxFrequencyDetail,
    utilization: historyReport.utilization ?? fileReport.utilization,
    utilizationDetail:
      historyReport.utilizationDetail ?? fileReport.utilizationDetail,
  };
}

function getLatestBuildHistoryReport(records: BuildRecord[]): ParsedBuildReport {
  const record = [...records]
    .reverse()
    .find(
      (candidate) =>
        candidate.timingPass !== undefined ||
        typeof candidate.fmaxMhz === "number" ||
        (candidate.utilization?.length ?? 0) > 0,
    );

  if (!record) return {};

  const utilization = formatBuildUtilization(record.utilization ?? []);

  return {
    timing:
      record.timingPass === undefined
        ? undefined
        : record.timingPass
          ? "Met"
          : "Failed",
    timingDetail:
      record.timingPass === undefined
        ? undefined
        : "Parsed from latest bitstream build",
    maxFrequency:
      typeof record.fmaxMhz === "number"
        ? `${record.fmaxMhz.toFixed(2)} MHz`
        : undefined,
    maxFrequencyDetail:
      typeof record.fmaxMhz === "number"
        ? "Parsed from latest bitstream build"
        : undefined,
    utilization,
    utilizationDetail: utilization
      ? "Parsed from latest bitstream build"
      : undefined,
  };
}

function formatBuildUtilization(entries: BuildRecord["utilization"]) {
  const displayEntries = getDisplayUtilization(entries ?? []);
  if (displayEntries.length === 0) return undefined;

  return displayEntries
    .slice(0, 4)
    .map((entry) => {
      const percent = (entry.used / entry.total) * 100;
      const percentText = Number.isFinite(percent)
        ? ` (${percent.toFixed(percent < 10 ? 1 : 0)}%)`
        : "";
      return `${entry.label} ${entry.used.toLocaleString()}/${entry.total.toLocaleString()}${percentText}`;
    })
    .join(" / ");
}

function parseBuildReports(files: ProjectFile[]): ParsedBuildReport {
  const reportText = files
    .filter((file) => /\.(log|rpt|report|txt|json)$/i.test(file.name))
    .map((file) => file.content)
    .join("\n");

  if (!reportText.trim()) {
    return {};
  }

  const timingMet =
    /timing\s+(?:met|passed|pass)|timing\s+constraints\s+are\s+met/i.test(
      reportText,
    );
  const timingFailed =
    /timing\s+(?:failed|fail|not\s+met)|violated\s+timing|slack\s*[:=]\s*-\d/i.test(
      reportText,
    );
  const maxFrequency = findFirstMatch(reportText, [
    /(?:max(?:imum)?\s+frequency|fmax|max_freq)\s*[:=]?\s*([0-9.]+\s*(?:mhz|MHz|MHz\.|hz|kHz|MHz))/i,
    /([0-9.]+)\s*MHz\s+\(?.*?fmax/i,
  ]);
  const lut = findMetric(reportText, ["lut", "logic cells", "slice luts"]);
  const ff = findMetric(reportText, ["ff", "flip-flops", "registers"]);
  const bram = findMetric(reportText, ["bram", "block ram", "ebr"]);
  const dsp = findMetric(reportText, ["dsp", "multiplier"]);
  const utilizationParts = [
    lut ? `LUT ${lut}` : null,
    ff ? `FF ${ff}` : null,
    bram ? `BRAM ${bram}` : null,
    dsp ? `DSP ${dsp}` : null,
  ].filter(Boolean);

  return {
    timing: timingFailed ? "Failed" : timingMet ? "Met" : undefined,
    timingDetail: timingFailed
      ? "Timing violation detected in report"
      : timingMet
        ? "Timing passed in report"
        : undefined,
    maxFrequency: maxFrequency?.replace(/\s+/g, " "),
    maxFrequencyDetail: maxFrequency ? "Parsed from build report" : undefined,
    utilization:
      utilizationParts.length > 0 ? utilizationParts.join(" / ") : undefined,
    utilizationDetail:
      utilizationParts.length > 0
        ? "Parsed from utilization report"
        : undefined,
  };
}

function findFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function findMetric(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(
        `\\b${escaped}\\b\\s*[:=]\\s*([0-9,]+(?:\\s*/\\s*[0-9,]+)?)`,
        "i",
      ),
      new RegExp(`\\b([0-9,]+)\\s+${escaped}\\b`, "i"),
    ];
    const match = findFirstMatch(text, patterns);

    if (match) return match;
  }

  return null;
}
