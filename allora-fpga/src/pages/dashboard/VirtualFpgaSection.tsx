import { TroubleshootButton, useProjectDiagnostic } from "../../components/ProjectDiagnostics";
import { WorkspaceTitle } from "../../components/ui/WorkspaceTitle";
import { getMemorySources, matchesSavedSimulator, readSavedResult } from "../../lib/savedProjectResults";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleStop,
  Gauge,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  Wrench,
} from "lucide-react";
import type { ProjectFile } from "./types";
import type { AppSettings } from "../../data/settings";
import type { BoardDefinition } from "../../data/boardTypes";
import { getVirtualBoardResources } from "../../lib/virtualBoardResources";
import { saveSimulationSummary } from "../../data/projects";
import SignalWaveformPanel, {
  type SignalWaveTrace,
} from "../../components/SignalWaveformPanel";
import VirtualPcbDiagram from "../../components/VirtualPcbDiagram";
import {
  formatSignalValue,
  getConfiguredTopModule,
  getHdlSources,
  getMappingOptions,
  getPeripheralDriveValue,
  isPeripheralActive,
  mappingKey,
  parseMappingKey,
  readVirtualFpgaConfig,
  virtualFpgaApi,
  type RtlPort,
  type SimulationSnapshot,
  type SimulationTools,
  type VirtualFpgaConfig,
  type VirtualPeripheral,
} from "../../lib/virtualFpga";
import "../../styles/virtual-fpga.css";

type Props = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectPath?: string;
  projectId?: string;
  topLevelFileName: string | null;
  settings: AppSettings;
  onConfigChange: (config: VirtualFpgaConfig) => void;
  guidedTemplate?: "blank" | "counter" | "pwm";
};

type WaveSample = {
  simTimePs: number;
  values: Record<string, string>;
};

type SimulationStatus =
  | "idle"
  | "compiling"
  | "ready"
  | "running"
  | "paused"
  | "error";

const FREQUENCIES = [
  1_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000,
];
const RUN_CYCLES_PER_TICK = 1;

export default function VirtualFpgaSection({
  board,
  files,
  projectPath,
  projectId,
  topLevelFileName,
  settings,
  onConfigChange,
  guidedTemplate,
}: Props) {
  const inferredTop = getConfiguredTopModule(files, topLevelFileName);
  const physicalBoard = board.id !== "allora-virtual";
  const boardResources = useMemo(() => getVirtualBoardResources(board), [board]);
  const [config, setConfig] = useState(() =>
    readVirtualFpgaConfig(files, inferredTop, board),
  );
  const [ports, setPorts] = useState<RtlPort[]>([]);
  const [tools, setTools] = useState<SimulationTools | null>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [status, setStatus] = useState<SimulationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const diagnosticDetails = useMemo(() => errorMessage
    ? logs.slice(-40).join("\n").slice(-8_000)
    : undefined, [errorMessage, logs]);
  useProjectDiagnostic("virtual-fpga", errorMessage, diagnosticDetails);
  const [radix, setRadix] = useState(settings.simulatorDefaultRadix);
  const [selectedSignals, setSelectedSignals] = useState<string[]>([]);
  const [waveSamples, setWaveSamples] = useState<WaveSample[]>([]);
  const steppingRef = useRef(false);
  const sessionRef = useRef<number | null>(null);
  const executedCyclesRef = useRef(0);

  // Interactive simulation compiles the synthesizable design only. Dedicated
  // testbenches remain available in the Testbench workspace, where delay and
  // stimulus syntax such as `#10` is valid.
  const sourceFiles = useMemo(
    () => getHdlSources(files, config.topModule),
    [config.topModule, files],
  );
  const clock = config.peripherals.find((item) => item.type === "clock");
  const reset = config.peripherals.find((item) => item.type === "reset");
  const buttons = config.peripherals.filter((item) => item.type === "button" || item.type === "reset");
  const switches = config.peripherals.filter((item) => item.type === "switch");
  const leds = config.peripherals.filter((item) => item.type === "led");
  const frequencies = [...new Set([...FREQUENCIES, config.clockFrequencyHz])].sort((a, b) => a - b);

  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    setRadix(settings.simulatorDefaultRadix);
  }, [settings.simulatorDefaultRadix]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      virtualFpgaApi.detectTools(),
      virtualFpgaApi.discoverPorts(sourceFiles, config.topModule, projectPath),
    ])
      .then(([nextTools, nextPorts]) => {
        if (cancelled) return;
        setTools(nextTools);
        setPorts(nextPorts);
        setErrorMessage("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(getErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [config.topModule, sourceFiles, projectPath]);

  useEffect(() => {
    if (selectedSignals.length || ports.length === 0) return;
    const mappedSignals = config.peripherals
      .map((peripheral) => peripheral.signal)
      .filter((signal): signal is string => Boolean(signal));
    setSelectedSignals(
      [...new Set([...mappedSignals, ...ports.map((port) => port.name)])].slice(
        0,
        5,
      ),
    );
  }, [config.peripherals, ports, selectedSignals.length]);

  useEffect(() => {
    if (!snapshot) return;
    setWaveSamples((current) => {
      const sample = {
        simTimePs: snapshot.simTimePs,
        values: snapshot.values,
      };
      if (current.at(-1)?.simTimePs === sample.simTimePs) {
        return [...current.slice(0, -1), sample];
      }
      return [...current, sample].slice(-160);
    });
  }, [snapshot]);

  useEffect(() => {
    if (status !== "running" || sessionId === null) return;
    const timer = window.setInterval(() => {
      if (steppingRef.current) return;
      const remainingCycles = settings.simulatorCycleLimit
        ? settings.simulatorCycleLimit - executedCyclesRef.current
        : RUN_CYCLES_PER_TICK;
      if (remainingCycles <= 0) {
        setStatus("paused");
        setLogs((current) => [
          ...current,
          `[simulation] Paused at the ${settings.simulatorCycleLimit.toLocaleString()} cycle safety limit.`,
        ]);
        return;
      }
      const cycles = Math.min(RUN_CYCLES_PER_TICK, remainingCycles);
      steppingRef.current = true;
      void virtualFpgaApi
        .step(sessionId, cycles)
        .then((result) => {
          executedCyclesRef.current += cycles;
          setWaveSamples((current) =>
            appendWaveSamples(current, result.trace),
          );
          setSnapshot(result.state);
        })
        .catch((error: unknown) => {
          setStatus("error");
          setErrorMessage(getErrorMessage(error));
        })
        .finally(() => {
          steppingRef.current = false;
        });
    }, settings.simulatorRefreshInterval);
    return () => window.clearInterval(timer);
  }, [
    sessionId,
    settings.simulatorCycleLimit,
    settings.simulatorRefreshInterval,
    status,
  ]);

  useEffect(
    () => () => {
      const activeSession = sessionRef.current;
      if (activeSession !== null) void virtualFpgaApi.stop(activeSession);
    },
    [],
  );

  const updateConfig = useCallback(
    (next: VirtualFpgaConfig) => {
      setConfig(next);
      onConfigChange(next);
    },
    [onConfigChange],
  );

  function updatePeripheral(id: string, mapping: string) {
    const parsed = parseMappingKey(mapping);
    updateConfig({
      ...config,
      peripherals: config.peripherals.map((peripheral) =>
        peripheral.id === id ? { ...peripheral, ...parsed } : peripheral,
      ),
    });
  }

  async function startSimulation() {
    setStatus("compiling");
    setErrorMessage("");
    try {
      await waitForNextPaint();
      if (sessionId !== null) await virtualFpgaApi.stop(sessionId);
      const result = await virtualFpgaApi.start({
        sourceFiles,
        topModule: config.topModule,
        clockSignal: clock?.signal ?? null,
        clockFrequencyHz: config.clockFrequencyHz,
        enableVcd: settings.simulatorCaptureWaveform,
        projectPath,
      });
      executedCyclesRef.current = 0;
      setWaveSamples([]);
      setSessionId(result.sessionId);
      setPorts(result.ports);
      let initialState = result.state;
      const initialInputs = new Map<string, bigint>();
      for (const peripheral of config.peripherals) {
        if (!peripheral.signal || !["button", "reset", "switch"].includes(peripheral.type)) continue;
        const value = initialInputs.get(peripheral.signal) ?? BigInt(initialState.values[peripheral.signal] ?? "0");
        const mask = 1n << BigInt(peripheral.bit ?? 0);
        initialInputs.set(peripheral.signal, getPeripheralDriveValue(peripheral, false) ? value | mask : value & ~mask);
      }
      for (const [signal, value] of initialInputs) {
        initialState = await virtualFpgaApi.setInput(result.sessionId, signal, value.toString());
      }
      setSnapshot(initialState);
      setLogs(
        formatSimulatorLogs(result.logs, settings.simulatorLogLevel, {
          sourceCount: sourceFiles.length,
          topModule: config.topModule,
        }),
      );
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
      if (projectId) {
        saveSimulationSummary(projectId, {
          status: "failed",
          completedAt: new Date().toISOString(),
          cycles: executedCyclesRef.current,
          simTimePs: snapshot?.simTimePs ?? 0,
          signalCount: selectedSignals.length,
          waveform: buildSimulationPreview(waveSamples, selectedSignals),
        });
      }
    }
  }

  const autoStarted = useRef(false);
  useEffect(() => {
    const saved = readSavedResult(files, "build/interactive-simulation.json");
    if (autoStarted.current || !ports.length || !matchesSavedSimulator(saved, sourceFiles, config.topModule, config, "simulation", getMemorySources(files))) return;
    autoStarted.current = true;
    void startSimulation();
  });

  async function stopSimulation() {
    if (sessionId !== null) await virtualFpgaApi.stop(sessionId);
    if (projectId && sessionId !== null) {
      saveSimulationSummary(projectId, {
        status: "passed",
        completedAt: new Date().toISOString(),
        cycles: executedCyclesRef.current,
        simTimePs: snapshot?.simTimePs ?? 0,
        signalCount: selectedSignals.length,
        waveform: buildSimulationPreview(waveSamples, selectedSignals),
      });
    }
    setSessionId(null);
    setStatus("idle");
  }

  async function stepSimulation(cycles = settings.simulatorStepSize) {
    if (sessionId === null || steppingRef.current) return;
    const remainingCycles = settings.simulatorCycleLimit
      ? settings.simulatorCycleLimit - executedCyclesRef.current
      : cycles;
    if (remainingCycles <= 0) {
      setErrorMessage("The simulation cycle safety limit has been reached.");
      return;
    }
    const allowedCycles = Math.min(cycles, remainingCycles);
    steppingRef.current = true;
    try {
      const result = await virtualFpgaApi.step(sessionId, allowedCycles);
      setWaveSamples((current) => appendWaveSamples(current, result.trace));
      setSnapshot(result.state);
      executedCyclesRef.current += allowedCycles;
      setStatus("paused");
    } catch (error) {
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    } finally {
      steppingRef.current = false;
    }
  }

  async function resetSimulation() {
    if (sessionId === null) return;
    try {
      executedCyclesRef.current = 0;
      const result = await virtualFpgaApi.reset(
        sessionId,
        reset?.signal ?? null,
        reset?.activeHigh ?? true,
      );
      setWaveSamples(appendWaveSamples([], result.trace));
      setSnapshot(result.state);
      setStatus("paused");
    } catch (error) {
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function drivePeripheral(
    peripheral: VirtualPeripheral,
    bitValue: number,
  ) {
    if (sessionId === null || !peripheral.signal) return;
    const bit = peripheral.bit ?? 0;
    const current = BigInt(snapshot?.values[peripheral.signal] ?? "0");
    const mask = 1n << BigInt(bit);
    const next = bitValue ? current | mask : current & ~mask;
    try {
      const nextSnapshot = await virtualFpgaApi.setInput(
        sessionId,
        peripheral.signal,
        next.toString(),
      );
      setWaveSamples((currentSamples) =>
        appendWaveSamples(currentSamples, [nextSnapshot]),
      );
      setSnapshot(nextSnapshot);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  const canInteract =
    sessionId !== null && status !== "compiling" && status !== "error";
  const simTime = snapshot ? formatSimTime(snapshot.simTimePs) : "0 ns";
  const hasGuide = guidedTemplate === "counter" || guidedTemplate === "pwm";
  const guidePeripheralIds =
    guidedTemplate === "counter"
      ? [
          "clock-0",
          "reset-0",
          "switch-0",
          "led-0",
          "led-1",
          "led-2",
          "led-3",
        ]
      : guidedTemplate === "pwm"
        ? ["clock-0", "switch-0", "led-0"]
        : [];
  const guideMappingsComplete = guidePeripheralIds.every((id) =>
    config.peripherals.some(
      (peripheral) => peripheral.id === id && Boolean(peripheral.signal),
    ),
  );

  function toggleSignal(signal: string) {
    setSelectedSignals((current) => {
      if (current.includes(signal)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== signal);
      }
      return [...current, signal].slice(-6);
    });
  }

  return (
    <div className="vfpga-page ui-workspace-panel">
      <header className="vfpga-hero ui-workspace-header ui-workspace-section">
        <div>
          <WorkspaceTitle section="virtual-fpga" />
        </div>
        <div className={`vfpga-status ${status}`}>
          <span /> {status === "compiling" ? "Compiling RTL" : status}
        </div>
      </header>

      {hasGuide ? (
        <section className="vfpga-guide" aria-label="Guided project progress">
          <div>
            <span>Guided {guidedTemplate === "counter" ? "LED counter" : "PWM dimmer"}</span>
            <strong>Run the design, then inspect a signal over time.</strong>
          </div>
          <ol>
            <GuideStep label="Source ready" done={sourceFiles.length > 0} />
            <GuideStep
              label="Ports mapped"
              done={guideMappingsComplete}
            />
            <GuideStep label="Model compiled" done={sessionId !== null} />
            <GuideStep label="Waveform captured" done={waveSamples.length > 1} />
          </ol>
        </section>
      ) : null}

      {errorMessage ? (
        <div className="vfpga-error">
          <strong>Simulation issue</strong>
          {errorMessage}
          <TroubleshootButton source="virtual-fpga" />
        </div>
      ) : null}

      <section className="vfpga-control-card ui-workspace-section">
        <div className="vfpga-toolbar">
          <div className="vfpga-stat ui-metric">
            <span>Engine</span>
            <strong>Verilator</strong>
          </div>
          <label className="vfpga-frequency">
            <span>Top module</span>
            <input
              value={config.topModule}
              disabled={sessionId !== null}
              onChange={(event) =>
                updateConfig({
                  ...config,
                  topModule: event.target.value.trim(),
                })
              }
            />
          </label>
          <div className="vfpga-stat ui-metric">
            <span>Sim time</span>
            <strong>{simTime}</strong>
          </div>
          <label className="vfpga-frequency">
            <span>Clock</span>
            <select className="ui-dropdown"
              value={config.clockFrequencyHz}
              disabled={sessionId !== null}
              onChange={(event) =>
                updateConfig({
                  ...config,
                  clockFrequencyHz: Number(event.target.value),
                })
              }
            >
              {frequencies.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {formatClockFrequency(frequency)}
                </option>
              ))}
            </select>
          </label>
          <div className="vfpga-actions ui-compact-button-group">
            {sessionId === null ? (
              <button
                className="primary ui-action-button"
                onClick={() => void startSimulation()}
                disabled={status === "compiling"}
              >
                {status === "compiling" ? (
                  <>
                    <LoaderCircle className="vfpga-button-spinner" size={15} />
                    Compiling…
                  </>
                ) : (
                  <>
                    <Wrench size={15} /> Compile & Start
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  className="primary ui-action-button"
                  onClick={() => setStatus("running")}
                  disabled={status === "running"}
                >
                  <Play size={15} /> Run
                </button>
                <button onClick={() => setStatus("paused")}>
                  <Pause size={15} /> Pause
                </button>
                <button onClick={() => void stepSimulation()}>
                  <StepForward size={15} /> Step
                </button>
                <button onClick={() => void resetSimulation()}>
                  <RotateCcw size={15} /> Reset
                </button>
                <button onClick={() => void stopSimulation()}>
                  <CircleStop size={15} /> Stop
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="vfpga-grid ui-workspace-columns">
        <section className="vfpga-board-card ui-workspace-section">
          <div className="vfpga-board-heading">
            <div>
              <span>{physicalBoard ? board.vendor : "ALLORA"}</span>
              <strong>{physicalBoard ? board.name : "AF-VIRTUAL"}</strong>
            </div>
            <small>{ports.length} top-level ports</small>
          </div>
          <VirtualPcbDiagram
            ariaLabel={`${board.name} interactive virtual FPGA board`}
            boardLabel={physicalBoard ? board.name : "ALLORA LABS · LIVE VIRTUAL I/O"}
            vendorLabel={physicalBoard ? board.family : "ALLORA"}
            chipLabel={physicalBoard ? board.device : "VIRTUAL FPGA"}
            chipSublabel={config.topModule}
            clockHz={config.clockFrequencyHz}
            showUsb={!physicalBoard}
            showHeaders={!physicalBoard}
            showClock={!physicalBoard || Boolean(boardResources.clock)}
            className="vfpga-live-pcb"
            io={{ outputs: leds.length ? <div className="vfpga-led-bank" aria-label="Board LEDs">
              {leds.map((led) => (
                <VirtualLed
                  key={led.id}
                  peripheral={led}
                  active={isPeripheralActive(led, snapshot)}
                />
              ))}
            </div> : null,
            inputs: <div className="vfpga-input-bank" data-ui-compact="off">
              <div className="vfpga-switches">
                {switches.map((item) => (
                  <button
                    key={item.id}
                    className={`vfpga-switch ${isPeripheralActive(item, snapshot) ? "on" : ""}`}
                    aria-label={`Toggle ${item.label}`}
                    aria-pressed={isPeripheralActive(item, snapshot)}
                    title={peripheralDescription(item)}
                    disabled={!canInteract || !item.signal}
                    onClick={() =>
                      void drivePeripheral(
                        item,
                        getPeripheralDriveValue(item, !isPeripheralActive(item, snapshot)),
                      )
                    }
                  >
                    <span />
                    <small>{item.label}</small>
                  </button>
                ))}
              </div>
              <div className="vfpga-buttons">
                {buttons.map((item) => (
                  <button
                    key={item.id}
                    className={`vfpga-button${item.type === "reset" ? " reset" : ""}`}
                    aria-label={`Press ${item.label}`}
                    title={peripheralDescription(item)}
                    disabled={!canInteract || !item.signal}
                    onPointerDown={event => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      void drivePeripheral(item, getPeripheralDriveValue(item, true));
                    }}
                    onPointerUp={() => void drivePeripheral(item, getPeripheralDriveValue(item, false))}
                    onPointerCancel={() => void drivePeripheral(item, getPeripheralDriveValue(item, false))}
                    onBlur={() => void drivePeripheral(item, getPeripheralDriveValue(item, false))}
                    onKeyDown={event => {
                      if (event.key !== " " && event.key !== "Enter") return;
                      event.preventDefault();
                      if (!event.repeat) void drivePeripheral(item, getPeripheralDriveValue(item, true));
                    }}
                    onKeyUp={event => {
                      if (event.key !== " " && event.key !== "Enter") return;
                      event.preventDefault();
                      void drivePeripheral(item, getPeripheralDriveValue(item, false));
                    }}
                  >
                    <span />
                    <small>{item.label}</small>
                  </button>
                ))}
              </div>
            </div>,
            resources: physicalBoard && boardResources.resources.length ? <div className="vfpga-resource-bank" aria-label="Board resources">
              {boardResources.resources.map(resource => <div className="vfpga-resource" key={resource.label} title={resource.detail}>
                <span>{resource.label}</span><small>{resource.count} {resource.count === 1 ? "pad" : "pads"}</small>
              </div>)}
            </div> : null,
          }} />
        </section>

        <section className="vfpga-panel vfpga-mapping ui-workspace-framed ui-workspace-support ui-workspace-aside ui-workspace-aside-contained">
          <div className="vfpga-section-title">
            <Gauge size={17} />
            <div>
              <strong>Peripheral mapping</strong>
              <span>Stored in allora-project.json</span>
            </div>
          </div>
          <div className="vfpga-mapping-list">
            {config.peripherals.map((peripheral) => (
              <label key={peripheral.id}>
                <span>
                  <i className={`kind-${peripheral.type}`} />
                  <span className="vfpga-map-label" title={peripheralDescription(peripheral)}>{peripheral.label}</span>
                  <small>{peripheral.type}</small>
                </span>
                <div className="vfpga-map-control">
                  <select className="ui-dropdown"
                    aria-label={`Map ${peripheral.label}`}
                    value={mappingKey(peripheral)}
                    disabled={sessionId !== null}
                    onChange={(event) =>
                      updatePeripheral(peripheral.id, event.target.value)
                    }
                  >
                    <option value="">Not mapped</option>
                    {getMappingOptions(ports, peripheral).map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {peripheral.type === "reset" ? (
                    <button
                      type="button"
                      disabled={sessionId !== null}
                      title="Toggle reset polarity"
                      onClick={() =>
                        updateConfig({
                          ...config,
                          peripherals: config.peripherals.map((item) =>
                            item.id === peripheral.id
                              ? {
                                  ...item,
                                  activeHigh: item.activeHigh === false,
                                }
                              : item,
                          ),
                        })
                      }
                    >
                      {peripheral.activeHigh === false ? "AL" : "AH"}
                    </button>
                  ) : null}
                </div>
                {mappingKey(peripheral).length > 22 ? <div className="vfpga-map-selection">{mappingKey(peripheral)}</div> : null}
              </label>
            ))}
          </div>
        </section>
      </div>

      <SignalWaveformPanel
        subtitle={
          waveSamples.length
            ? `${waveSamples.length} edge samples · ${formatClockFrequency(
                config.clockFrequencyHz,
              )} clock`
            : "Compile and run to capture signal history"
        }
        traces={buildLiveWaveTraces(ports, waveSamples)}
        selectedSignalIds={selectedSignals}
        onToggleSignal={toggleSignal}
        emptyMessage="Discovered ports will appear here."
        formatTime={() => simTime}
      />

      <section className="vfpga-panel vfpga-signals ui-workspace-section">
        <div className="vfpga-section-title">
          <div>
            <strong>Signal inspector</strong>
            <span>Live top-level values</span>
          </div>
          <div className="vfpga-radix">
            {(["binary", "hex", "decimal"] as const).map((item) => (
              <button
                key={item}
                className={radix === item ? "active" : ""}
                onClick={() => setRadix(item)}
              >
                {item.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
        <div className="vfpga-signal-table">
          <div className="head">
            <span>Signal</span>
            <span>Direction</span>
            <span>Width</span>
            <span>Value</span>
          </div>
          {ports.map((port) => {
            const display = formatSignalValue(
              snapshot?.values[port.name],
              port.width,
            );
            return (
              <div
                key={port.name}
                className={
                  selectedSignals.includes(port.name) ? "selected" : undefined
                }
              >
                <button
                  type="button"
                  className="signal-name"
                  aria-pressed={selectedSignals.includes(port.name)}
                  onClick={() => toggleSignal(port.name)}
                  title="Show or hide this signal in the live waveform"
                >
                  <span /> {port.name}
                </button>
                <span className={`direction ${port.direction}`}>
                  {port.direction}
                </span>
                <span>{port.width}</span>
                <code>{display[radix]}</code>
              </div>
            );
          })}
        </div>
        <footer>
          <span>Yosys {tools?.yosys.available ? "ready" : "missing"}</span>
          <span>
            Verilator {tools?.verilator.available ? "ready" : "missing"}
          </span>
          {logs.length ? (
            <span title={logs.join("\n")}>
              {logs.length} compiler log lines
            </span>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function buildSimulationPreview(
  samples: WaveSample[],
  selectedSignals: string[],
) {
  const signal =
    selectedSignals[0] ?? Object.keys(samples.at(-1)?.values ?? {})[0];
  if (!signal) return [];
  const stride = Math.max(1, Math.floor(samples.length / 18));
  return samples
    .filter((_, index) => index % stride === 0)
    .slice(-18)
    .map((sample) => Number(BigInt(sample.values[signal] ?? "0") & 1n));
}

function GuideStep({ label, done }: { label: string; done: boolean }) {
  return (
    <li className={done ? "done" : ""}>
      <CheckCircle2 size={14} />
      <span>{label}</span>
    </li>
  );
}

function buildLiveWaveTraces(
  ports: RtlPort[],
  samples: WaveSample[],
): SignalWaveTrace[] {
  return ports.map((port) => ({
    id: port.name,
    name: port.name,
    width: port.width,
    direction: port.direction,
    values: samples.map((sample, index) => ({
      time: index,
      value: sample.values[port.name] ?? "0",
    })),
  }));
}

function appendWaveSamples(
  current: WaveSample[],
  snapshots: SimulationSnapshot[],
) {
  const samples = [...current];
  for (const snapshot of snapshots) {
    const sample = {
      simTimePs: snapshot.simTimePs,
      values: snapshot.values,
    };
    const previous = samples.at(-1);
    if (
      previous?.simTimePs === sample.simTimePs &&
      haveMatchingValues(previous.values, sample.values)
    ) {
      samples[samples.length - 1] = sample;
    } else {
      samples.push(sample);
    }
  }
  return samples.slice(-160);
}

function haveMatchingValues(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => resolve()),
    );
  });
}

function formatSimulatorLogs(
  logs: string[],
  level: AppSettings["simulatorLogLevel"],
  context: { sourceCount: number; topModule: string },
) {
  if (level === "errors") {
    return logs.filter((line) => /error|failed|warning/i.test(line));
  }
  if (level === "verbose") {
    return [
      `[simulation] Top module: ${context.topModule}`,
      `[simulation] Source files: ${context.sourceCount}`,
      ...logs,
    ];
  }
  return logs;
}

function VirtualLed({
  peripheral,
  active,
}: {
  peripheral: VirtualPeripheral;
  active: boolean;
}) {
  return (
    <div className="vfpga-led-wrap" title={peripheralDescription(peripheral)}>
      <span className={`vfpga-led color-${peripheral.color ?? "green"} ${active ? "on" : ""}`} />
      <small>{peripheral.label}</small>
      <em>{mappingKey(peripheral) || "—"}</em>
    </div>
  );
}

function peripheralDescription(peripheral: VirtualPeripheral) {
  return [peripheral.label, peripheral.group, peripheral.pad ? `Pad ${peripheral.pad}` : null,
    peripheral.activeHigh === false ? "Active low" : null, mappingKey(peripheral)].filter(Boolean).join(" · ");
}

function formatSimTime(picoseconds: number) {
  if (picoseconds >= 1_000_000_000)
    return `${(picoseconds / 1_000_000_000).toFixed(3)} ms`;
  if (picoseconds >= 1_000_000)
    return `${(picoseconds / 1_000_000).toFixed(3)} µs`;
  if (picoseconds >= 1_000) return `${(picoseconds / 1_000).toFixed(1)} ns`;
  return `${picoseconds} ps`;
}

function formatClockFrequency(hertz: number) {
  if (hertz >= 1_000_000) return `${hertz / 1_000_000} MHz`;
  if (hertz >= 1_000) return `${hertz / 1_000} kHz`;
  return `${hertz} Hz`;
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error)
    return String(error.message);
  return "An unknown simulation error occurred.";
}
