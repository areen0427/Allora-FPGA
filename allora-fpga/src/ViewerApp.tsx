import { publishExplorer } from "./lib/explorerBridge";
import { useEffect, useMemo, useState } from "react";
import SignalWaveformPanel from "./components/SignalWaveformPanel";
import HardwareSchematicCanvas from "./components/HardwareSchematicCanvas";
import { getSettings } from "./data/settings";
import type { SynthesisDiagramResponse } from "./pages/dashboard/SynthesisSection";
import TimingAnalysis, {
  type TimingAnalysisResult,
} from "./pages/dashboard/TimingAnalysis";
import { buildTestbenchWaveTraces, formatWaveTick, parseVcd } from "./lib/vcd";
import {
  readViewerEnvelope,
  type ViewerEnvelope,
  type ViewerKind,
} from "./lib/viewerWindow";
import "./App.css";

type WaveformViewerPayload = {
  vcd: string;
  waveformName: string;
  projectKey?: string;
  recordingId?: string;
  selectedSignalName?: string;
  initialTime?: number;
};

export default function ViewerApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const kind = params.get("viewer") as ViewerKind | null;
  const storageKey = params.get("key") ?? "";
  const [waveTime, setWaveTime] = useState(0);
  const [selectedSignals, setSelectedSignals] = useState<string[]>([]);
  const [synthesisEnvelope, setSynthesisEnvelope] =
    useState<ViewerEnvelope<SynthesisDiagramResponse> | null>(null);
  const [waveformEnvelope, setWaveformEnvelope] =
    useState<ViewerEnvelope<WaveformViewerPayload> | null>(null);
  const [timingEnvelope, setTimingEnvelope] =
    useState<ViewerEnvelope<TimingAnalysisResult> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const settings = getSettings();
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.background = settings.background;
    document.documentElement.dataset.reduceMotion = String(
      settings.reduceMotion,
    );
  }, []);

  useEffect(() => {
    async function loadPayload() {
      try {
        if (kind === "synthesis") {
          setSynthesisEnvelope(
            await readViewerEnvelope<SynthesisDiagramResponse>(storageKey),
          );
        } else if (kind === "waveform") {
          setWaveformEnvelope(
            await readViewerEnvelope<WaveformViewerPayload>(storageKey),
          );
        } else if (kind === "timing") {
          setTimingEnvelope(
            await readViewerEnvelope<TimingAnalysisResult>(storageKey),
          );
        }
      } catch {
        setSynthesisEnvelope(null);
        setWaveformEnvelope(null);
        setTimingEnvelope(null);
      } finally {
        setIsLoading(false);
      }
    }

    void loadPayload();
  }, [kind, storageKey]);

  const waveform = useMemo(
    () =>
      parseVcd(
        waveformEnvelope?.payload.vcd ?? "",
        waveformEnvelope?.payload.recordingId
          ? { preserveAliases: true, initialUnknown: false }
          : {},
      ),
    [waveformEnvelope?.payload.vcd, waveformEnvelope?.payload.recordingId],
  );
  const traces = useMemo(() => buildTestbenchWaveTraces(waveform), [waveform]);

  useEffect(() => {
    if (kind !== "waveform") return;
    const wanted = waveformEnvelope?.payload.selectedSignalName;
    const match = traces.find((trace) => trace.fullName === wanted);
    setSelectedSignals(
      match ? [match.id] : traces.slice(0, 12).map((trace) => trace.id),
    );
    setWaveTime(waveformEnvelope?.payload.initialTime ?? 0);
  }, [kind, traces, waveformEnvelope]);

  if (kind === "synthesis" && synthesisEnvelope) {
    return (
      <main className="viewer-page viewer-page-schematic">
        <HardwareSchematicCanvas diagram={synthesisEnvelope.payload} />
      </main>
    );
  }

  if (kind === "timing" && timingEnvelope) {
    return (
      <main className="viewer-page viewer-page-timing">
        <header className="viewer-header">
          <div>
            <span>Build analysis</span>
            <h1>{timingEnvelope.title}</h1>
          </div>
        </header>
        <TimingAnalysis timing={timingEnvelope.payload} />
      </main>
    );
  }

  if (kind === "waveform" && waveformEnvelope && waveform) {
    return (
      <main className="viewer-page">
        <header className="viewer-header">
          <div>
            <span>Simulation waveform</span>
            <h1>{waveformEnvelope.title}</h1>
          </div>
          <div className="viewer-summary">
            {waveform.signals.length} signals ·{" "}
            {formatWaveTick(waveform.endTime, waveform.timescale)}
          </div>
        </header>
        <section className="viewer-surface viewer-waveform">
          {waveformEnvelope.payload.recordingId ? (
            <div className="explorer-waveform">
              <label>
                Explorer time{" "}
                <input
                  aria-label="Synthesis Explorer waveform time"
                  type="range"
                  min={0}
                  max={waveform.endTime}
                  step={1}
                  value={waveTime}
                  onChange={(event) => {
                    const time = Number(event.target.value);
                    setWaveTime(time);
                    void publishExplorer({
                      type: "waveform-time",
                      projectKey: waveformEnvelope.payload.projectKey ?? "",
                      recordingId: waveformEnvelope.payload.recordingId!,
                      time,
                    }).catch(() => {});
                  }}
                />
              </label>
              <output>{formatWaveTick(waveTime, waveform.timescale)}</output>
              <span>
                Signal selection highlights exact aliases in the open Synthesis
                Explorer.
              </span>
            </div>
          ) : null}
          <SignalWaveformPanel
            title={waveformEnvelope.payload.waveformName}
            subtitle="Select signals to add or remove them from the large waveform view"
            traces={traces}
            selectedSignalIds={selectedSignals}
            onToggleSignal={(signalId) => {
              setSelectedSignals((current) =>
                current.includes(signalId)
                  ? current.filter((item) => item !== signalId)
                  : [...current, signalId],
              );
              const signal = waveform.signals.find(
                (signal) => signal.id === signalId,
              );
              if (signal && waveformEnvelope.payload.recordingId)
                void publishExplorer({
                  type: "waveform-select",
                  projectKey: waveformEnvelope.payload.projectKey ?? "",
                  recordingId: waveformEnvelope.payload.recordingId,
                  signalName: signal.name,
                }).catch(() => {});
            }}
            emptyMessage="No signal data was found in this waveform."
            formatTime={(time) =>
              formatWaveTick(Math.round(time), waveform.timescale)
            }
          />
        </section>
      </main>
    );
  }

  return (
    <main className="viewer-page viewer-error">
      <h1>{isLoading ? "Opening viewer…" : "Viewer data is unavailable"}</h1>
      {!isLoading ? <p>Close this window and open the report again.</p> : null}
    </main>
  );
}
