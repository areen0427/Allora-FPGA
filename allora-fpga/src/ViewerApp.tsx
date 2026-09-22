import { useEffect, useMemo, useState } from "react";
import SignalWaveformPanel from "./components/SignalWaveformPanel";
import HardwareSchematicCanvas from "./components/HardwareSchematicCanvas";
import { getSettings } from "./data/settings";
import type { SynthesisDiagramResponse } from "./pages/dashboard/SynthesisSection";
import {
  buildTestbenchWaveTraces,
  formatWaveTick,
  parseVcd,
} from "./lib/vcd";
import {
  readViewerEnvelope,
  type ViewerEnvelope,
  type ViewerKind,
} from "./lib/viewerWindow";
import "./App.css";

type WaveformViewerPayload = {
  vcd: string;
  waveformName: string;
};

export default function ViewerApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const kind = params.get("viewer") as ViewerKind | null;
  const storageKey = params.get("key") ?? "";
  const [selectedSignals, setSelectedSignals] = useState<string[]>([]);
  const [synthesisEnvelope, setSynthesisEnvelope] =
    useState<ViewerEnvelope<SynthesisDiagramResponse> | null>(null);
  const [waveformEnvelope, setWaveformEnvelope] =
    useState<ViewerEnvelope<WaveformViewerPayload> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = getSettings().theme;
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
        }
      } catch {
        setSynthesisEnvelope(null);
        setWaveformEnvelope(null);
      } finally {
        setIsLoading(false);
      }
    }

    void loadPayload();
  }, [kind, storageKey]);

  const waveform = useMemo(
    () => parseVcd(waveformEnvelope?.payload.vcd ?? ""),
    [waveformEnvelope?.payload.vcd],
  );
  const traces = useMemo(
    () => buildTestbenchWaveTraces(waveform),
    [waveform],
  );

  useEffect(() => {
    if (kind !== "waveform") return;
    setSelectedSignals(traces.slice(0, 12).map((trace) => trace.id));
  }, [kind, traces]);

  if (kind === "synthesis" && synthesisEnvelope) {
    return (
      <main className="viewer-page viewer-page-schematic">
        <HardwareSchematicCanvas diagram={synthesisEnvelope.payload} />
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
            {waveform.signals.length} signals · {formatWaveTick(waveform.endTime, waveform.timescale)}
          </div>
        </header>
        <section className="viewer-surface viewer-waveform">
          <SignalWaveformPanel
            title={waveformEnvelope.payload.waveformName}
            subtitle="Select signals to add or remove them from the large waveform view"
            traces={traces}
            selectedSignalIds={selectedSignals}
            onToggleSignal={(signalId) =>
              setSelectedSignals((current) =>
                current.includes(signalId)
                  ? current.filter((item) => item !== signalId)
                  : [...current, signalId],
              )
            }
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
      {!isLoading ? (
        <p>Close this window and open the diagram or waveform again.</p>
      ) : null}
    </main>
  );
}
