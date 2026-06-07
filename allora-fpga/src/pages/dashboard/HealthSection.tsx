import type { BoardDefinition } from "../../data/boards";
import { getBoardCapabilities } from "../../data/boardCapabilities";
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

export default function HealthSection({
  board,
  files,
  topLevelFileName,
}: HealthSectionProps) {
  const capabilities = getBoardCapabilities(board);
  const hdlFiles = files.filter((file) => isHdlFile(file.name));
  const constraintFile = files.find((file) =>
    file.name.toLowerCase().endsWith(`.${board.constraintsFile}`)
  );
  const bitstreamFile = files.find((file) => /\.(bit|bin|fs|svf|jed)$/i.test(file.name));
  const buildReport = parseBuildReports(files);
  const bitstreamSize = bitstreamFile
    ? formatBytes(bitstreamFile.isBinary ? bitstreamFile.content.length : byteLength(bitstreamFile.content))
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
      detail: topLevelFileName ? "Ready for analysis" : "Set a top-level HDL file",
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
        ? buildReport.timing.toLowerCase().includes("fail") ? "warn" : "good"
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
        <div style={{ color: "#0f172a", fontSize: "14px", fontWeight: 900 }}>{label}</div>
        <div style={{ marginTop: "4px", color: "#64748b", fontSize: "12px", fontWeight: 750 }}>
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

function parseBuildReports(files: ProjectFile[]) {
  const reportText = files
    .filter((file) => /\.(log|rpt|report|txt|json)$/i.test(file.name))
    .map((file) => file.content)
    .join("\n");

  if (!reportText.trim()) {
    return {};
  }

  const timingMet = /timing\s+(?:met|passed|pass)|timing\s+constraints\s+are\s+met/i.test(reportText);
  const timingFailed = /timing\s+(?:failed|fail|not\s+met)|violated\s+timing|slack\s*[:=]\s*-\d/i.test(reportText);
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
    utilization: utilizationParts.length > 0 ? utilizationParts.join(" / ") : undefined,
    utilizationDetail: utilizationParts.length > 0 ? "Parsed from utilization report" : undefined,
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
      new RegExp(`\\b${escaped}\\b\\s*[:=]\\s*([0-9,]+(?:\\s*/\\s*[0-9,]+)?)`, "i"),
      new RegExp(`\\b([0-9,]+)\\s+${escaped}\\b`, "i"),
    ];
    const match = findFirstMatch(text, patterns);

    if (match) return match;
  }

  return null;
}
