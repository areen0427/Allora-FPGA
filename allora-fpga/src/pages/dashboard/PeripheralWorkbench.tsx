import { useEffect, useRef, useState } from "react";
import { getMemorySources, matchesSavedSimulator, readSavedResult } from "../../lib/savedProjectResults";
import type { ProjectFile } from "./types";
import {
  getConfiguredTopModule,
  getHdlSources,
  virtualFpgaApi,
  type RtlPort,
  type SimulationSnapshot,
} from "../../lib/virtualFpga";
import {
  channels,
  inputChannel,
  key,
  library,
  lit,
  migrateLegacy,
  newDevice,
  options,
  readWorkbench,
  validate,
  WorkbenchRuntime,
  type Connection,
  type Device,
  type Workbench,
} from "../../lib/peripheralWorkbench";
import "../../styles/peripheral-workbench.css";

type Props = {
  files: ProjectFile[];
  topLevelFileName: string | null;
  active: boolean;
  projectPath?: string;
  onChange: (config: Workbench) => void;
};
const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : String(e);
export default function PeripheralWorkbench({
  files,
  topLevelFileName,
  active,
  projectPath,
  onChange,
}: Props) {
  const top = getConfiguredTopModule(files, topLevelFileName);
  const [initial] = useState(() => {
    try {
      return { config: readWorkbench(files, top), error: "" };
    } catch (e) {
      return {
        config: {
          version: 1,
          frequency: 50e6,
          clock: null,
          devices: [],
        } as Workbench,
        error: message(e),
      };
    }
  });
  const [config, setConfig] = useState(initial.config);
  const [selected, setSelected] = useState<string | null>(null);
  const [ports, setPorts] = useState<RtlPort[]>([]);
  const [discovered, setDiscovered] = useState("");
  const [status, setStatus] = useState("stopped");
  const [error, setError] = useState(initial.error);
  const [metadataError, setMetadataError] = useState(initial.error);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [inputs, setInputs] = useState<Record<string, boolean>>({});
  const [diagnostics, setDiagnostics] = useState(
    "Discovering structural RTL ports…",
  );
  const [, redraw] = useState(0);
  const [viewRuntime, setViewRuntime] = useState<WorkbenchRuntime | null>(null);
  const runtime = useRef<WorkbenchRuntime | null>(null);
  const running = useRef(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const pressed = useRef(new Set<string>());
  const sources = JSON.stringify(getHdlSources(files, top));
  const identity = top + sources;
  const currentIdentity = useRef(identity);
  useEffect(() => {
    currentIdentity.current = identity;
  }, [identity]);
  const compiledIdentity = useRef("");
  const metadataContent = files.find(
    (f) => f.name === "allora-project.json",
  )?.content;
  const lastWritten = useRef(metadataContent);
  useEffect(() => {
    if (metadataContent === lastWritten.current) return;
    lastWritten.current = metadataContent;
    running.current = false;
    release();
    setStatus("stopping");
    void enqueue(async () => {
      if (runtime.current) await virtualFpgaApi.stop(runtime.current.session);
      runtime.current = null;
      setViewRuntime(null);
      setSnapshot(null);
      setStatus("stopped");
      setDiagnostics(
        "Workbench metadata changed. Compile to apply the new configuration.",
      );
    });
    try {
      const next = readWorkbench(files, top);
      setMetadataError("");
      setError("");
      setConfig(next);
    } catch (e) {
      setMetadataError(message(e));
    }
    // Reload only on external metadata edits; local writes update lastWritten first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadataContent]);
  const errors = discovered === identity ? validate(config, ports) : {};
  const invalid = Object.keys(errors).length > 0;
  const busy =
    status === "compiling" || status === "stopping" || status === "stepping";
  const live = ["paused", "running"].includes(status);
  const editable =
    !metadataError && (status === "stopped" || status === "error");
  const device = config.devices.find((d) => d.id === selected);

  function enqueue(task: () => Promise<void>) {
    chain.current = chain.current.then(task).catch((e) => {
      running.current = false;
      if (mounted.current) {
        setError(message(e));
        setStatus("error");
      }
    });
    return chain.current;
  }
  function refresh() {
    if (mounted.current && runtime.current) {
      setSnapshot({ ...runtime.current.snapshot });
      setViewRuntime(runtime.current);
      redraw((n) => n + 1);
    }
  }
  function persist(next: Workbench) {
    if (metadataContent)
      lastWritten.current =
        JSON.stringify(
          { ...JSON.parse(metadataContent), peripheralWorkbench: next },
          null,
          2,
        ) + "\n";
    onChange(next);
  }
  function change(next: Workbench) {
    setConfig(next);
    persist(next);
  }
  function update(d: Device, patch: Partial<Device>) {
    change({
      ...config,
      devices: config.devices.map((item) =>
        item.id === d.id ? { ...item, ...patch } : item,
      ),
    });
  }
  function release() {
    const ids = [...pressed.current];
    pressed.current.clear();
    for (const id of ids) {
      setInputs((old) => ({ ...old, [id]: false }));
      void enqueue(async () => {
        const rt = runtime.current;
        const d = rt?.config.devices.find((d) => d.id === id);
        if (rt && d) {
          await rt.input(d, false);
          refresh();
        }
      });
    }
  }
  function input(d: Device, value: boolean) {
    if ((!live && value) || !d.connections.signal) return;
    if (d.kind === "button") {
      if (value) pressed.current.add(d.id);
      else pressed.current.delete(d.id);
    }
    setInputs((old) => ({ ...old, [d.id]: value }));
    void enqueue(async () => {
      if (runtime.current) {
        await runtime.current.input(d, value);
        refresh();
      }
    });
  }
  useEffect(() => {
    let cancelled = false;
    setDiscovered("");
    setPorts([]);
    void virtualFpgaApi
      .discoverPorts(JSON.parse(sources), top, projectPath)
      .then((next) => {
        if (cancelled) return;
        setPorts(next);
        setDiscovered(identity);
        setDiagnostics(
          `${next.length} top-level ports discovered by Yosys. Verilator compiles on start.`,
        );
        setConfig((current) => migrateLegacy(current, next));
      })
      .catch((e) => {
        if (!cancelled) {
          setError(message(e));
          setDiagnostics(
            "Port discovery failed. Install Yosys / OSS CAD Suite and resolve RTL errors.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [identity, sources, top, projectPath]);
  useEffect(() => {
    if (runtime.current && compiledIdentity.current !== identity) {
      running.current = false;
      release();
      setStatus("stopping");
      void enqueue(async () => {
        if (runtime.current) await virtualFpgaApi.stop(runtime.current.session);
        runtime.current = null;
        setViewRuntime(null);
        setSnapshot(null);
        setStatus("stopped");
        setDiagnostics("RTL changed. Recompile to use the updated design.");
      });
    }
    // The release/queue helpers access the current session through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);
  useEffect(() => {
    const blur = () => release();
    const visibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
    // These listeners must remain attached across device edits. Helpers use session refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!active) {
      release();
      running.current = false;
      setStatus((s) => (s === "running" ? "paused" : s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      running.current = false;
      void chain.current.then(async () => {
        if (runtime.current) await virtualFpgaApi.stop(runtime.current.session);
        runtime.current = null;
      });
    };
  }, []);
  useEffect(() => {
    if (status !== "running") return;
    let inFlight = false;
    const timer = window.setInterval(() => {
      if (inFlight || !running.current) return;
      inFlight = true;
      void enqueue(async () => {
        if (running.current && runtime.current) {
          await runtime.current.advance(256);
          refresh();
        }
      }).finally(() => {
        inFlight = false;
      });
    }, 16);
    return () => window.clearInterval(timer);
  }, [status]);

  function compile() {
    persist(config);
    running.current = false;
    release();
    setStatus("compiling");
    setError("");
    setSnapshot(null);
    setViewRuntime(null);
    setDiagnostics("Compiling RTL with Verilator and C++ toolchain…");
    void enqueue(async () => {
      if (runtime.current) {
        await virtualFpgaApi.stop(runtime.current.session);
        runtime.current = null;
      }
      const result = await virtualFpgaApi.start({
        sourceFiles: JSON.parse(sources),
        topModule: top,
        clockSignal: config.clock?.signal ?? null,
        clockFrequencyHz: config.frequency,
        enableVcd: false,
        projectPath,
      });
      if (!mounted.current || currentIdentity.current !== identity) {
        await virtualFpgaApi.stop(result.sessionId);
        if (mounted.current) {
          setStatus("stopped");
          setDiagnostics("Sources changed during compilation. Compile again.");
        }
        return;
      }
      runtime.current = new WorkbenchRuntime(
        result.sessionId,
        config,
        result.state,
      );
      await runtime.current.initialize();
      compiledIdentity.current = identity;
      setInputs(
        Object.fromEntries(
          config.devices.map((d) => [d.id, d.kind === "switch" && d.initial]),
        ),
      );
      setDiagnostics(result.logs.join("\n"));
      setStatus("paused");
      refresh();
    });
  }
  function stop() {
    running.current = false;
    release();
    setStatus("stopping");
    void enqueue(async () => {
      if (runtime.current) await virtualFpgaApi.stop(runtime.current.session);
      runtime.current = null;
      setViewRuntime(null);
      setStatus("stopped");
      setSnapshot(null);
      setInputs({});
    });
  }
  const canCompile =
    editable && discovered === identity && !invalid && !metadataError;
  const autoStarted = useRef(false);
  useEffect(() => {
    const saved = readSavedResult(files, "build/interactive-simulation.json");
    if (!active || autoStarted.current || !canCompile || !matchesSavedSimulator(saved, JSON.parse(sources), top, config, "peripheralWorkbench", getMemorySources(files))) return;
    autoStarted.current = true;
    compile();
  });
  return (
    <section className="pw" aria-label="Peripheral Workbench">
      <header className="pw-header">
        <div>
          <span className="pw-kicker">REAL RTL · VERILATOR</span>
          <h1>Peripheral Workbench</h1>
          <p>{top} · Virtual connections stay separate from board pins.</p>
        </div>
        <span role="status" className="pw-status">
          {status} · {((snapshot?.simTimePs ?? 0) / 1e6).toFixed(3)} µs
        </span>
      </header>
      <div className="pw-toolbar" aria-label="Simulation controls">
        <button disabled={!canCompile} onClick={compile}>
          {status === "compiling" ? "Compiling…" : "Compile & Start"}
        </button>
        <button
          disabled={status !== "paused"}
          onClick={() => {
            running.current = true;
            setStatus("running");
          }}
        >
          Run
        </button>
        <button
          disabled={status !== "running"}
          onClick={() => {
            running.current = false;
            setStatus("paused");
          }}
        >
          Pause
        </button>
        <button
          disabled={status !== "paused"}
          onClick={() => {
            setStatus("stepping");
            void enqueue(async () => {
              await runtime.current!.advance(1);
              refresh();
              setStatus("paused");
            });
          }}
        >
          Step · 1 cycle
        </button>
        <button
          disabled={!live}
          onClick={compile}
          title="Recreate RTL model at time zero and restore configured initial inputs"
        >
          Reset to initial state
        </button>
        <button disabled={(!live && status !== "error") || busy} onClick={stop}>
          Stop
        </button>
        <label>
          Clock{" "}
          <Mapping
            value={config.clock}
            ports={ports.filter((p) => p.width === 1)}
            input
            disabled={!editable}
            onChange={(clock) => change({ ...config, clock })}
          />
        </label>
        <label>
          Hz{" "}
          <input
            type="number"
            min="1"
            max="1000000000"
            value={config.frequency}
            disabled={!editable}
            onChange={(e) =>
              change({ ...config, frequency: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <p className="pw-help">
        Add → map signals → Compile & Start → Run. Step advances one full clock
        cycle (or one time quantum without a clock). Reset rebuilds the model at
        time zero. Stop before changing connections. Paused inputs apply
        immediately; UART sends queue until Run or Step.
      </p>
      {metadataError && (
        <div role="alert" className="pw-error">
          {metadataError} — repair allora-project.json in the Editor.
        </div>
      )}
      {error && (
        <div role="alert" className="pw-error">
          {error}
        </div>
      )}
      {errors.clock?.map((e) => (
        <div className="pw-error" key={e}>
          {e}
        </div>
      ))}
      <div className="pw-layout">
        <aside className="pw-library">
          <h2>Peripheral library</h2>
          {library.map((item) => (
            <button
              key={item.kind}
              disabled={!editable}
              onClick={() => {
                const d = newDevice(item.kind, config.devices.length);
                change({ ...config, devices: [...config.devices, d] });
                setSelected(d.id);
              }}
            >
              ＋ {item.label}
            </button>
          ))}
          <p>
            Seven-segment displays use direct a–g and decimal-point signals.
            Multiplexed scanning is not supported.
          </p>
        </aside>
        <div className="pw-canvas" aria-label="Device workspace">
          {!config.devices.length && (
            <div className="pw-empty">
              <h2>Connect your design to something you can see.</h2>
              <p>
                Add a switch and LED from the library, map their RTL bits, then
                compile.
              </p>
            </div>
          )}
          <div
            className="pw-canvas-inner"
            style={{
              width: Math.max(580, ...config.devices.map((d) => d.x + 270)),
              height: Math.max(500, ...config.devices.map((d) => d.y + 320)),
            }}
          >
            {config.devices.map((d) => (
              <article
                key={d.id}
                className={`pw-device ${selected === d.id ? "selected" : ""}`}
                style={{ left: d.x, top: d.y }}
                onClick={() => setSelected(d.id)}
              >
                <button
                  className="pw-device-heading"
                  aria-label={`Select and drag ${d.name}`}
                  onClick={() => setSelected(d.id)}
                  onPointerDown={(e) => {
                    if (!editable) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    e.currentTarget.dataset.dragX = String(e.clientX - d.x);
                    e.currentTarget.dataset.dragY = String(e.clientY - d.y);
                  }}
                  onPointerUp={(e) => {
                    delete e.currentTarget.dataset.dragX;
                    delete e.currentTarget.dataset.dragY;
                  }}
                  onPointerCancel={(e) => {
                    delete e.currentTarget.dataset.dragX;
                    delete e.currentTarget.dataset.dragY;
                  }}
                  onPointerMove={(e) => {
                    if (e.currentTarget.dataset.dragX !== undefined && editable)
                      update(d, {
                        x: Math.max(
                          0,
                          Math.round(
                            e.clientX - Number(e.currentTarget.dataset.dragX),
                          ),
                        ),
                        y: Math.max(
                          0,
                          Math.round(
                            e.clientY - Number(e.currentTarget.dataset.dragY),
                          ),
                        ),
                      });
                  }}
                >
                  {d.name}
                </button>
                <small className={errors[d.id] ? "pw-error-text" : ""}>
                  {(discovered !== identity
                    ? "Awaiting port discovery"
                    : errors[d.id]?.[0]) ??
                    `${Object.keys(d.connections).filter((ch) => channels(d).includes(ch)).length}/${channels(d).length} connected`}
                </small>
                {["led", "led-bank", "seven-segment"].includes(d.kind) && (
                  <small>
                    {viewRuntime?.activity[d.id] ?? 0} signal transitions
                    captured
                  </small>
                )}
                {d.kind === "button" && (
                  <button
                    className={`pw-push ${inputs[d.id] ? "on" : ""}`}
                    disabled={!live || !d.connections.signal}
                    aria-pressed={Boolean(inputs[d.id])}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      input(d, true);
                    }}
                    onPointerUp={() => input(d, false)}
                    onPointerCancel={() => input(d, false)}
                    onLostPointerCapture={() => input(d, false)}
                    onBlur={() => input(d, false)}
                    onKeyDown={(e) => {
                      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                        e.preventDefault();
                        input(d, true);
                      }
                    }}
                    onKeyUp={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        input(d, false);
                      }
                    }}
                  >
                    {inputs[d.id] ? "Pressed" : "Hold"}
                  </button>
                )}
                {d.kind === "switch" && (
                  <button
                    className={`pw-switch ${inputs[d.id] ? "on" : ""}`}
                    role="switch"
                    aria-checked={Boolean(inputs[d.id])}
                    disabled={!live || !d.connections.signal}
                    onClick={() => input(d, !inputs[d.id])}
                  >
                    {inputs[d.id] ? "ON" : "OFF"}
                  </button>
                )}
                {(d.kind === "led" || d.kind === "led-bank") && (
                  <div className="pw-leds">
                    {channels(d).map((ch, i) => (
                      <span key={ch}>
                        <i
                          className={lit(d, ch, snapshot) ? "on" : ""}
                          aria-label={`${d.labels[i] || ch}: ${lit(d, ch, snapshot) ? "on" : "off"}`}
                        />
                        {d.labels[i] || (d.kind === "led" ? d.name : ch)}
                      </span>
                    ))}
                  </div>
                )}
                {d.kind === "seven-segment" && (
                  <SevenSegment device={d} snapshot={snapshot} />
                )}
                {d.kind === "uart" && (
                  <Terminal
                    device={d}
                    onSettings={(patch) => update(d, patch)}
                    runtime={viewRuntime}
                    disabled={!live || !d.connections.rx}
                    onSend={(bytes) => {
                      runtime.current?.uarts.get(d.id)?.enqueue(bytes);
                      redraw((n) => n + 1);
                    }}
                    onClear={() => {
                      const uart = runtime.current?.uarts.get(d.id);
                      if (uart) {
                        uart.bytes = [];
                        uart.errors = 0;
                        redraw((n) => n + 1);
                      }
                    }}
                  />
                )}
              </article>
            ))}
          </div>
        </div>
        <aside className="pw-inspector">
          <h2>Configuration</h2>
          {device ? (
            <>
              <label>
                Name{" "}
                <input
                  value={device.name}
                  disabled={!editable}
                  onChange={(e) => update(device, { name: e.target.value })}
                />
              </label>
              <div className="pw-row">
                <label>
                  X{" "}
                  <input
                    type="number"
                    min="0"
                    value={device.x}
                    disabled={!editable}
                    onChange={(e) =>
                      update(device, { x: Math.max(0, Number(e.target.value)) })
                    }
                  />
                </label>
                <label>
                  Y{" "}
                  <input
                    type="number"
                    min="0"
                    value={device.y}
                    disabled={!editable}
                    onChange={(e) =>
                      update(device, { y: Math.max(0, Number(e.target.value)) })
                    }
                  />
                </label>
              </div>
              {device.kind !== "uart" && (
                <label>
                  Polarity{" "}
                  <select
                    value={String(device.activeHigh)}
                    disabled={!editable}
                    onChange={(e) =>
                      update(device, { activeHigh: e.target.value === "true" })
                    }
                  >
                    <option value="true">Active high</option>
                    <option value="false">Active low</option>
                  </select>
                </label>
              )}
              {device.kind === "switch" && (
                <label>
                  <input
                    type="checkbox"
                    checked={device.initial}
                    disabled={!editable}
                    onChange={(e) =>
                      update(device, { initial: e.target.checked })
                    }
                  />{" "}
                  Initially on
                </label>
              )}
              {device.kind === "led-bank" && (
                <label>
                  LED count{" "}
                  <input
                    type="number"
                    min="1"
                    max="32"
                    disabled={!editable}
                    value={device.count}
                    onChange={(e) =>
                      update(device, {
                        count: Math.max(
                          1,
                          Math.min(32, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
              )}
              {(device.kind === "led" || device.kind === "led-bank") && (
                <label>
                  LED labels (comma separated)
                  <input
                    value={device.labels.join(",")}
                    disabled={!editable}
                    onChange={(e) =>
                      update(device, { labels: e.target.value.split(",") })
                    }
                  />
                </label>
              )}
              {device.kind === "uart" && (
                <>
                  <label>
                    Baud{" "}
                    <input
                      type="number"
                      min="1"
                      value={device.baud}
                      disabled={!editable}
                      onChange={(e) =>
                        update(device, { baud: Number(e.target.value) })
                      }
                    />
                  </label>
                  <p>
                    8 data bits · no parity · 1 stop bit · idle high. TX = FPGA
                    output; RX = FPGA input.
                  </p>
                </>
              )}
              {channels(device).map((ch) => (
                <label key={ch}>
                  {device.kind === "uart" ? `FPGA ${ch.toUpperCase()}` : ch}
                  <Mapping
                    ports={ports}
                    input={inputChannel(device, ch)}
                    value={device.connections[ch]}
                    disabled={!editable}
                    onChange={(c) => {
                      const connections = { ...device.connections };
                      if (c) connections[ch] = c;
                      else delete connections[ch];
                      update(device, { connections });
                    }}
                  />
                </label>
              ))}
              {errors[device.id]?.map((e, i) => (
                <p className="pw-error-text" key={i}>
                  {e}
                </p>
              ))}
              <button
                disabled={!editable}
                onClick={() => {
                  const copy = {
                    ...device,
                    id: crypto.randomUUID(),
                    name: `${device.name} copy`,
                    x: device.x + 30,
                    y: device.y + 30,
                    connections: Object.fromEntries(
                      Object.entries(device.connections).filter(
                        ([ch]) => !inputChannel(device, ch),
                      ),
                    ),
                  };
                  change({ ...config, devices: [...config.devices, copy] });
                  setSelected(copy.id);
                }}
              >
                Duplicate
              </button>
              <button
                disabled={!editable}
                onClick={() => {
                  change({
                    ...config,
                    devices: config.devices.filter((d) => d.id !== device.id),
                  });
                  setSelected(null);
                }}
              >
                Remove
              </button>
            </>
          ) : (
            <p>
              Select a device to rename, arrange, and map it. Input mappings are
              cleared on duplication to avoid conflicting drivers.
            </p>
          )}
        </aside>
      </div>
      <details className="pw-diagnostics">
        <summary>
          Diagnostics ·{" "}
          {discovered === identity ? "ports ready" : "ports unavailable"}
        </summary>
        <pre>{diagnostics}</pre>
      </details>
    </section>
  );
}
function Mapping({
  value,
  ports,
  input,
  disabled,
  onChange,
}: {
  value?: Connection | null;
  ports: RtlPort[];
  input: boolean;
  disabled: boolean;
  onChange: (c: Connection | null) => void;
}) {
  const choices = options(ports, input);
  return (
    <select
      aria-label="RTL signal mapping"
      disabled={disabled}
      value={key(value)}
      onChange={(e) =>
        onChange(
          choices.find((c) => c.value === e.target.value)?.connection ?? null,
        )
      }
    >
      <option value="">Unmapped</option>
      {value && !choices.some((c) => c.value === key(value)) && (
        <option value={key(value)}>
          Unavailable: {value.signal}[{value.bit}]
        </option>
      )}
      {choices.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
function SevenSegment({
  device,
  snapshot,
}: {
  device: Device;
  snapshot: SimulationSnapshot | null;
}) {
  const bars = [
    [20, 5, 50, 9],
    [72, 16, 9, 45],
    [72, 70, 9, 45],
    [20, 117, 50, 9],
    [9, 70, 9, 45],
    [9, 16, 9, 45],
    [20, 61, 50, 9],
  ];
  return (
    <svg
      className="pw-seven"
      viewBox="0 0 110 135"
      role="img"
      aria-label={`Seven segment ${
        channels(device)
          .filter((ch) => lit(device, ch, snapshot))
          .join(", ") || "off"
      }`}
    >
      {bars.map(([x, y, width, height], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={width}
          height={height}
          rx="4"
          className={lit(device, "abcdefg"[i], snapshot) ? "on" : ""}
        />
      ))}
      <circle
        cx="97"
        cy="121"
        r="6"
        className={lit(device, "dp", snapshot) ? "on" : ""}
      />
    </svg>
  );
}
function Terminal({
  device,
  onSettings,
  runtime,
  disabled,
  onSend,
  onClear,
}: {
  device: Device;
  onSettings: (patch: Partial<Device>) => void;
  runtime: WorkbenchRuntime | null;
  disabled: boolean;
  onSend: (bytes: number[]) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState("");
  const hex = device.hex ?? false;
  const ending = device.lineEnding ?? "";
  const [error, setError] = useState("");
  const uart = runtime?.uarts.get(device.id);
  return (
    <div className="pw-terminal">
      <output aria-label="UART received data">
        {hex
          ? uart?.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")
          : new TextDecoder().decode(new Uint8Array(uart?.bytes ?? []))}
      </output>
      <small>
        8N1 · {uart?.queue.length ?? 0} queued · {uart?.errors ?? 0} framing
        errors
      </small>
      <div className="pw-row">
        <label>
          <input
            type="checkbox"
            checked={hex}
            onChange={(e) => onSettings({ hex: e.target.checked })}
          />{" "}
          Hex
        </label>
        <select
          aria-label="UART line ending"
          value={ending}
          onChange={(e) => onSettings({ lineEnding: e.target.value })}
        >
          <option value="">No ending</option>
          <option value="\n">LF</option>
          <option value="\r\n">CRLF</option>
        </select>
        <button onClick={onClear} disabled={!uart}>
          Clear
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (hex && !/^(?:\s*[0-9a-fA-F]{2}\s*)*$/.test(text))
              throw new Error("Enter pairs of hex digits");
            const bytes = hex
              ? (text.match(/[0-9a-fA-F]{2}/g) ?? []).map((v) =>
                  parseInt(v, 16),
                )
              : [...new TextEncoder().encode(text)];
            onSend([
              ...bytes,
              ...new TextEncoder().encode(
                ending.replace(/\\r/g, "\r").replace(/\\n/g, "\n"),
              ),
            ]);
            setText("");
            setError("");
          } catch (e) {
            setError(message(e));
          }
        }}
      >
        <input
          aria-label={`Send to ${device.name}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder={hex ? "48 65 6c 6c 6f" : "Send text…"}
        />
        <button disabled={disabled || !text}>Send</button>
      </form>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
