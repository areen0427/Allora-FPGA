import { useEffect, useMemo, useState } from "react";

export type TimingPathElement = {
  kind: string;
  name: string;
  from?: string | null;
  to?: string | null;
  net?: string | null;
  delayNs: number;
  sources: string[];
};

export type TimingPath = {
  id: string;
  launchClock?: string | null;
  captureClock?: string | null;
  startpoint: string;
  endpoint: string;
  totalDelayNs: number;
  requiredTimeNs?: number | null;
  slackNs?: number | null;
  logicDelayNs: number;
  routingDelayNs: number;
  otherDelayNs: number;
  setupDelayNs: number;
  clockToQDelayNs: number;
  classification?: "logic-limited" | "routing-limited" | "mixed" | null;
  elements: TimingPathElement[];
};

export type TimingClock = {
  name: string;
  targetFrequencyMhz?: number | null;
  achievedFrequencyMhz?: number | null;
  status: "pass" | "fail" | "unconstrained";
  worstSlackNs?: number | null;
};

export type TimingAnalysisResult = {
  engine: string;
  device: string;
  status: "pass" | "fail" | "unconstrained" | "unavailable";
  targetClockName?: string | null;
  targetFrequencyMhz?: number | null;
  achievedFrequencyMhz?: number | null;
  worstSlackNs?: number | null;
  clocks: TimingClock[];
  paths: TimingPath[];
  violations: Array<{
    pathId: string;
    startpoint: string;
    endpoint: string;
    slackNs: number;
  }>;
  message?: string | null;
};

export default function TimingAnalysis({ timing }: { timing: TimingAnalysisResult }) {
  const [selectedClock, setSelectedClock] = useState<string | null>(
    timing.clocks[0]?.name ?? null,
  );
  const visiblePaths = useMemo(() => {
    if (timing.clocks.length <= 1 || !selectedClock) return timing.paths;
    return timing.paths.filter(
      (path) =>
        path.captureClock === selectedClock || path.launchClock === selectedClock,
    );
  }, [selectedClock, timing.clocks.length, timing.paths]);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(
    visiblePaths[0]?.id ?? null,
  );

  useEffect(() => {
    if (!timing.clocks.some((clock) => clock.name === selectedClock)) {
      setSelectedClock(timing.clocks[0]?.name ?? null);
    }
  }, [selectedClock, timing.clocks]);

  useEffect(() => {
    if (!visiblePaths.some((path) => path.id === selectedPathId)) {
      setSelectedPathId(visiblePaths[0]?.id ?? null);
    }
  }, [selectedPathId, visiblePaths]);

  const selectedPath =
    visiblePaths.find((path) => path.id === selectedPathId) ??
    visiblePaths[0] ??
    null;
  const statusLabel = {
    pass: "PASS",
    fail: "FAIL",
    unconstrained: "NO CONSTRAINT",
    unavailable: "UNAVAILABLE",
  }[timing.status];

  return (
    <section className={`timing-analysis timing-${timing.status}`}>
      <header className="timing-heading">
        <div>
          <span className="timing-eyebrow">Post-route static timing</span>
          <h3>Timing Analysis</h3>
        </div>
        <span className="timing-status" aria-label={`Timing status: ${statusLabel}`}>
          {statusLabel}
        </span>
      </header>

      {timing.message ? <p className="timing-message">{timing.message}</p> : null}

      <dl className="timing-summary">
        <SummaryMetric label="Device" value={timing.device} />
        <SummaryMetric
          label="Target clock"
          value={formatFrequency(timing.targetFrequencyMhz)}
          detail={timing.targetClockName ?? undefined}
        />
        <SummaryMetric
          label="Max frequency"
          value={formatFrequency(timing.achievedFrequencyMhz)}
        />
        <SummaryMetric
          label="Worst slack"
          value={formatSlack(timing.worstSlackNs)}
          tone={timing.worstSlackNs !== null && timing.worstSlackNs !== undefined
            ? timing.worstSlackNs < 0
              ? "negative"
              : "positive"
            : undefined}
        />
      </dl>

      {timing.clocks.length > 1 ? (
        <div className="timing-clock-section">
          <div className="timing-section-label">Clock domains</div>
          <div className="timing-clock-table" role="list">
            <div className="timing-clock-row head" aria-hidden="true">
              <span>Clock</span><span>Target</span><span>Achieved</span><span>Status</span>
            </div>
            {timing.clocks.map((clock) => (
              <button
                type="button"
                className={`timing-clock-row${selectedClock === clock.name ? " selected" : ""}`}
                key={clock.name}
                onClick={() => setSelectedClock(clock.name)}
              >
                <span title={clock.name}>{clock.name}</span>
                <span>{formatFrequency(clock.targetFrequencyMhz)}</span>
                <span>{formatFrequency(clock.achievedFrequencyMhz)}</span>
                <span className={`timing-clock-status ${clock.status}`}>
                  {clock.status === "unconstrained" ? "—" : clock.status.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selectedPath ? (
        <div className="timing-path-workspace">
          {visiblePaths.length > 1 ? (
            <div className="timing-path-list">
              <div className="timing-section-label">Critical paths</div>
              {visiblePaths.map((path, index) => (
                <button
                  type="button"
                  key={path.id}
                  className={path.id === selectedPath.id ? "selected" : ""}
                  onClick={() => setSelectedPathId(path.id)}
                >
                  <span className="timing-path-rank">{index + 1}</span>
                  <span className="timing-path-route">
                    <strong>{shortPoint(path.startpoint)}</strong>
                    <small>→ {shortPoint(path.endpoint)}</small>
                  </span>
                  <span className={path.slackNs !== null && path.slackNs !== undefined && path.slackNs < 0 ? "negative" : ""}>
                    {formatSlack(path.slackNs)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="timing-path-detail">
            <div className="timing-path-title">
              <div>
                <span className="timing-section-label">Critical path</span>
                <strong>{shortPoint(selectedPath.startpoint)} → {shortPoint(selectedPath.endpoint)}</strong>
              </div>
              {selectedPath.classification ? (
                <span className="timing-cause">{selectedPath.classification.replace("-", " ")}</span>
              ) : null}
            </div>

            <div className="timing-signal-path" aria-label="Critical path stages">
              <PathTerminal label="Startpoint" value={selectedPath.startpoint} />
              {selectedPath.elements.map((element, index) => (
                <PathStage key={`${selectedPath.id}-${index}`} element={element} />
              ))}
              <PathTerminal label="Endpoint" value={selectedPath.endpoint} />
            </div>

            <dl className="timing-breakdown">
              <SummaryMetric label="Logic delay" value={formatNs(selectedPath.logicDelayNs)} />
              <SummaryMetric label="Routing delay" value={formatNs(selectedPath.routingDelayNs)} />
              <SummaryMetric label="Other delay" value={formatNs(selectedPath.otherDelayNs)} />
              <SummaryMetric label="Total delay" value={formatNs(selectedPath.totalDelayNs)} />
              <SummaryMetric label="Required" value={formatNs(selectedPath.requiredTimeNs)} />
              <SummaryMetric
                label="Slack"
                value={formatSlack(selectedPath.slackNs)}
                tone={selectedPath.slackNs !== null && selectedPath.slackNs !== undefined
                  ? selectedPath.slackNs < 0 ? "negative" : "positive"
                  : undefined}
              />
              {selectedPath.clockToQDelayNs > 0 ? (
                <SummaryMetric label="Clock-to-Q" value={formatNs(selectedPath.clockToQDelayNs)} />
              ) : null}
              {selectedPath.setupDelayNs > 0 ? (
                <SummaryMetric label="Setup" value={formatNs(selectedPath.setupDelayNs)} />
              ) : null}
            </dl>
          </div>
        </div>
      ) : timing.status !== "unavailable" ? (
        <p className="timing-empty-path">No sequential critical path was reported for this design.</p>
      ) : null}
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={tone}>{value}</dd>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function PathTerminal({ label, value }: { label: string; value: string }) {
  return (
    <div className="timing-terminal">
      <span>{label}</span>
      <strong title={value}>{shortPoint(value)}</strong>
    </div>
  );
}

function PathStage({ element }: { element: TimingPathElement }) {
  const label = {
    logic: "Logic",
    routing: "Routing",
    setup: "Setup",
    "clk-to-q": "Clock-to-Q",
    source: "Source",
  }[element.kind] ?? element.kind;

  return (
    <div className={`timing-stage stage-${element.kind}`} title={element.name}>
      <span className="timing-stage-line" />
      <span className="timing-stage-kind">{label}</span>
      <strong>{formatNs(element.delayNs)}</strong>
      <small>{shortPoint(element.name)}</small>
    </div>
  );
}

function formatFrequency(value?: number | null) {
  return value === null || value === undefined ? "—" : `${value.toFixed(2)} MHz`;
}

function formatNs(value?: number | null) {
  return value === null || value === undefined ? "—" : `${value.toFixed(2)} ns`;
}

function formatSlack(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} ns`;
}

function shortPoint(value: string) {
  const compact = value.replace(/\$SB_[A-Z0-9_$]+/gi, "").replace(/_LC\.[A-Z0-9_]+$/i, "");
  return compact.length > 38 ? `…${compact.slice(-37)}` : compact;
}
