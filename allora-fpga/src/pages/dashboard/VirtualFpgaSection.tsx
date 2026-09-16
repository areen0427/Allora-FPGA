import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleStop,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  Wrench,
  Zap,
} from "lucide-react";
import type { ProjectFile } from "./types";
import {
  formatSignalValue,
  getConfiguredTopModule,
  getHdlSources,
  getMappingOptions,
  getPeripheralValue,
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
  files: ProjectFile[];
  projectPath?: string;
  topLevelFileName: string | null;
  onConfigChange: (config: VirtualFpgaConfig) => void;
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

export default function VirtualFpgaSection({
  files,
  projectPath,
  topLevelFileName,
  onConfigChange,
}: Props) {
  const inferredTop = getConfiguredTopModule(files, topLevelFileName);
  const [config, setConfig] = useState(() =>
    readVirtualFpgaConfig(files, inferredTop),
  );
  const [ports, setPorts] = useState<RtlPort[]>([]);
  const [tools, setTools] = useState<SimulationTools | null>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [status, setStatus] = useState<SimulationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [radix, setRadix] = useState<"binary" | "hex" | "decimal">("hex");
  const steppingRef = useRef(false);
  const sessionRef = useRef<number | null>(null);

  const sourceFiles = useMemo(() => getHdlSources(files), [files]);
  const clock = config.peripherals.find((item) => item.type === "clock");
  const reset = config.peripherals.find((item) => item.type === "reset");
  const buttons = config.peripherals.filter((item) => item.type === "button");
  const switches = config.peripherals.filter((item) => item.type === "switch");
  const leds = config.peripherals.filter((item) => item.type === "led");

  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      virtualFpgaApi.detectTools(),
      virtualFpgaApi.discoverPorts(sourceFiles, config.topModule),
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
  }, [config.topModule, sourceFiles]);

  useEffect(() => {
    if (status !== "running" || sessionId === null) return;
    const timer = window.setInterval(() => {
      if (steppingRef.current) return;
      steppingRef.current = true;
      void virtualFpgaApi
        .step(sessionId, 250)
        .then(setSnapshot)
        .catch((error: unknown) => {
          setStatus("error");
          setErrorMessage(getErrorMessage(error));
        })
        .finally(() => {
          steppingRef.current = false;
        });
    }, 100);
    return () => window.clearInterval(timer);
  }, [sessionId, status]);

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
      if (sessionId !== null) await virtualFpgaApi.stop(sessionId);
      const result = await virtualFpgaApi.start({
        sourceFiles,
        topModule: config.topModule,
        clockSignal: clock?.signal ?? null,
        clockFrequencyHz: config.clockFrequencyHz,
        enableVcd: config.enableVcd,
        projectPath,
      });
      setSessionId(result.sessionId);
      setPorts(result.ports);
      const initialState =
        reset?.signal && reset.activeHigh === false
          ? await virtualFpgaApi.setInput(result.sessionId, reset.signal, 1)
          : result.state;
      setSnapshot(initialState);
      setLogs(result.logs);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function stopSimulation() {
    if (sessionId !== null) await virtualFpgaApi.stop(sessionId);
    setSessionId(null);
    setStatus("idle");
  }

  async function stepSimulation(cycles = 1) {
    if (sessionId === null || steppingRef.current) return;
    steppingRef.current = true;
    try {
      setSnapshot(await virtualFpgaApi.step(sessionId, cycles));
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
      setSnapshot(
        await virtualFpgaApi.reset(
          sessionId,
          reset?.signal ?? null,
          reset?.activeHigh ?? true,
        ),
      );
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
      setSnapshot(
        await virtualFpgaApi.setInput(
          sessionId,
          peripheral.signal,
          Number(next),
        ),
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  const canInteract =
    sessionId !== null && status !== "compiling" && status !== "error";
  const simTime = snapshot ? formatSimTime(snapshot.simTimePs) : "0 ns";

  return (
    <div className="vfpga-page">
      <header className="vfpga-hero">
        <div>
          <div className="vfpga-eyebrow">
            <Zap size={14} /> VIRTUAL FPGA V0.1
          </div>
          <h1>Prototype in RTL. Touch every signal.</h1>
          <p>
            Run the same design you build for hardware through a real Verilator
            model.
          </p>
        </div>
        <div className={`vfpga-status ${status}`}>
          <span /> {status === "compiling" ? "Compiling RTL" : status}
        </div>
      </header>

      {errorMessage ? (
        <div className="vfpga-error">
          <strong>Simulation issue</strong>
          {errorMessage}
        </div>
      ) : null}

      <section className="vfpga-control-card">
        <div className="vfpga-toolbar">
          <div className="vfpga-stat">
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
          <div className="vfpga-stat">
            <span>Sim time</span>
            <strong>{simTime}</strong>
          </div>
          <label className="vfpga-frequency">
            <span>Clock</span>
            <select
              value={config.clockFrequencyHz}
              disabled={sessionId !== null}
              onChange={(event) =>
                updateConfig({
                  ...config,
                  clockFrequencyHz: Number(event.target.value),
                })
              }
            >
              {FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {frequency / 1_000_000} MHz
                </option>
              ))}
            </select>
          </label>
          <div className="vfpga-actions">
            {sessionId === null ? (
              <button
                className="primary"
                onClick={() => void startSimulation()}
                disabled={status === "compiling"}
              >
                <Wrench size={15} /> Compile & Start
              </button>
            ) : (
              <>
                <button
                  className="primary"
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

      <div className="vfpga-grid">
        <section className="vfpga-board-card">
          <div className="vfpga-board-heading">
            <div>
              <span>ALLORA</span>
              <strong>AF-VIRTUAL</strong>
            </div>
            <small>{ports.length} top-level ports</small>
          </div>
          <div className="vfpga-board-silk">
            <div className="vfpga-led-bank">
              {leds.map((led) => (
                <VirtualLed
                  key={led.id}
                  peripheral={led}
                  active={getPeripheralValue(led, snapshot) === 1}
                />
              ))}
            </div>
            <div className="vfpga-chip">
              <span>VIRTUAL</span>
              <strong>FPGA</strong>
              <small>{config.topModule}</small>
            </div>
            <div className="vfpga-input-bank">
              <div className="vfpga-switches">
                {switches.map((item) => (
                  <button
                    key={item.id}
                    className={`vfpga-switch ${getPeripheralValue(item, snapshot) ? "on" : ""}`}
                    disabled={!canInteract || !item.signal}
                    onClick={() =>
                      void drivePeripheral(
                        item,
                        getPeripheralValue(item, snapshot) ? 0 : 1,
                      )
                    }
                  >
                    <span />
                    <small>{item.label}</small>
                  </button>
                ))}
              </div>
              <div className="vfpga-buttons">
                {reset ? (
                  <button
                    className="vfpga-button reset"
                    disabled={!canInteract || !reset.signal}
                    onPointerDown={() =>
                      void drivePeripheral(
                        reset,
                        reset.activeHigh === false ? 0 : 1,
                      )
                    }
                    onPointerUp={() =>
                      void drivePeripheral(
                        reset,
                        reset.activeHigh === false ? 1 : 0,
                      )
                    }
                    onPointerLeave={() =>
                      void drivePeripheral(
                        reset,
                        reset.activeHigh === false ? 1 : 0,
                      )
                    }
                  >
                    <span />
                    RESET
                  </button>
                ) : null}
                {buttons.map((item) => (
                  <button
                    key={item.id}
                    className="vfpga-button"
                    disabled={!canInteract || !item.signal}
                    onPointerDown={() => void drivePeripheral(item, 1)}
                    onPointerUp={() => void drivePeripheral(item, 0)}
                    onPointerLeave={() => void drivePeripheral(item, 0)}
                  >
                    <span />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="vfpga-panel vfpga-mapping">
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
                  {peripheral.label}
                  <small>{peripheral.type}</small>
                </span>
                <div className="vfpga-map-control">
                  <select
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
              </label>
            ))}
          </div>
        </section>
      </div>

      <section className="vfpga-panel vfpga-signals">
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
              <div key={port.name}>
                <span className="signal-name">{port.name}</span>
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

function VirtualLed({
  peripheral,
  active,
}: {
  peripheral: VirtualPeripheral;
  active: boolean;
}) {
  return (
    <div className="vfpga-led-wrap">
      <span className={`vfpga-led ${active ? "on" : ""}`} />
      <small>{peripheral.label}</small>
      <em>{mappingKey(peripheral) || "—"}</em>
    </div>
  );
}

function formatSimTime(picoseconds: number) {
  if (picoseconds >= 1_000_000_000)
    return `${(picoseconds / 1_000_000_000).toFixed(3)} ms`;
  if (picoseconds >= 1_000_000)
    return `${(picoseconds / 1_000_000).toFixed(3)} µs`;
  if (picoseconds >= 1_000) return `${(picoseconds / 1_000).toFixed(1)} ns`;
  return `${picoseconds} ps`;
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error)
    return String(error.message);
  return "An unknown simulation error occurred.";
}
