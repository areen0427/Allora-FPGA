import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import RegisterBuilderIcon from "../../components/RegisterBuilderIcon";
import {
  bankPorts,
  emptyMap,
  generateSnippet,
  generateWrapper,
  generationKey,
  unsigned,
  validateMap,
} from "../../lib/registerBuilder";
import type {
  Access,
  Integration,
  Register,
  RegisterField,
  RegisterMap,
} from "../../lib/registerBuilder";
import {
  RegisterProjectStore,
  registerFileService,
} from "../../lib/registerBuilderProject";
import {
  getConfiguredTopModule,
  getHdlSources,
  virtualFpgaApi,
} from "../../lib/virtualFpga";
import { getErrorMessage, findTopModuleFile } from "../../hooks/utils";
import type { ProjectFile } from "./types";
import "../../styles/memory-assets.css";
import "../../styles/register-builder.css";

const modes: Access[] = ["RW", "RO", "WO", "W1C"];
const id = () => crypto.randomUUID();
const sourceKey = (files: ProjectFile[], top: string) =>
  JSON.stringify({ top, sources: getHdlSources(files, top) });
function nextRegister(map: RegisterMap): Register {
  let n = 0;
  while (map.registers.some((r) => r.name.toUpperCase() === `REG_${n}`)) n++;
  let offset = 0n;
  for (const r of map.registers) {
    try {
      const end = unsigned(r.offset) + BigInt(map.dataWidth / 8);
      if (end > offset) offset = end;
    } catch {
      /* Invalid drafts remain editable. */
    }
  }
  const alignment = BigInt(map.dataWidth / 8);
  offset = ((offset + alignment - 1n) / alignment) * alignment;
  return {
    id: id(),
    name: `REG_${n}`,
    offset: `0x${offset.toString(16)}`,
    width: map.dataWidth,
    access: "RW",
    reset: "0",
    description: "",
    fields: [],
  };
}
export default function RegisterBuilder({
  projectPath,
  files,
  topLevelFileName,
  onGenerated,
  onOpenFile,
  onActivateTop,
}: {
  projectPath?: string;
  files: ProjectFile[];
  topLevelFileName: string | null;
  onGenerated: (files: ProjectFile[], removed: string[]) => void;
  onOpenFile: (name: string) => void;
  onActivateTop: (name: string, module: string) => void;
}) {
  const store = useMemo(
    () =>
      projectPath
        ? new RegisterProjectStore(
            registerFileService(projectPath),
            projectPath,
          )
        : null,
    [projectPath],
  );
  const callbacks = useRef({ onGenerated });
  useEffect(() => {
    callbacks.current = { onGenerated };
  }, [onGenerated]);
  const [map, setMap] = useState(emptyMap);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Loading register map…");
  const [error, setError] = useState("");
  const [outputs, setOutputs] = useState<string[]>([]);
  const [generatedKey, setGeneratedKey] = useState<string>();
  const [savedIntegration, setSavedIntegration] = useState<Integration>();
  const [integration, setIntegration] = useState<Integration>();
  const [discoveryKey, setDiscoveryKey] = useState("");
  const revision = useRef(0);
  useEffect(() => {
    let live = true;
    if (!store) return;
    void store
      .load()
      .then((m) => {
        if (!live) return;
        setMap(m.map);
        setSelected(m.map.registers[0]?.id ?? null);
        setOutputs(m.outputs.map((o) => o.path));
        setGeneratedKey(m.generatedKey);
        setSavedIntegration(m.integration);
        setReady(true);
        setStatus("Map saved with project");
      })
      .catch((e) => {
        if (live) {
          setError(getErrorMessage(e));
          setStatus("Cannot load map; existing files preserved");
        }
      });
    return () => {
      live = false;
    };
  }, [store]);
  const issues = validateMap(map);
  const register = map.registers.find((r) => r.id === selected);
  const top =
    savedIntegration?.topModule ??
    getConfiguredTopModule(files, topLevelFileName);
  const currentSources = sourceKey(files, top);
  const stale = generatedKey !== generationKey(map, savedIntegration);
  function change(next: RegisterMap) {
    if (!store || !ready || busy) return;
    setMap(next);
    setIntegration(undefined);
    setError("");
    setStatus("Saving map…");
    const version = ++revision.current;
    void store
      .saveMap(next)
      .then((file) => {
        callbacks.current.onGenerated([file], []);
        if (version === revision.current) setStatus("Map saved with project");
      })
      .catch((e) => {
        setError(getErrorMessage(e));
        setStatus("Save failed — edits remain in this workspace");
      });
  }
  function editRegister(patch: Partial<Register>) {
    if (register)
      change({
        ...map,
        registers: map.registers.map((r) =>
          r.id === register.id ? { ...r, ...patch } : r,
        ),
      });
  }
  function editField(field: RegisterField, patch: Partial<RegisterField>) {
    if (register)
      editRegister({
        fields: register.fields.map((f) =>
          f.id === field.id ? { ...f, ...patch } : f,
        ),
      });
  }
  function add() {
    const r = nextRegister(map);
    change({ ...map, registers: [...map.registers, r] });
    setSelected(r.id);
  }
  function move(delta: number) {
    if (!register) return;
    const list = [...map.registers],
      index = list.indexOf(register);
    if (index + delta < 0 || index + delta >= list.length) return;
    [list[index], list[index + delta]] = [list[index + delta], list[index]];
    change({ ...map, registers: list });
  }
  async function generate(connection?: Integration, activate = false) {
    if (!store) return;
    setBusy(true);
    setError("");
    try {
      if (connection) {
        const metadata = files.find(
          (file) => file.name === "allora-project.json",
        );
        let value: unknown;
        try {
          value = metadata && JSON.parse(metadata.content);
        } catch {
          /* Report a repairable error below. */
        }
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error(
            "Assisted integration requires valid allora-project.json metadata. Repair it in the editor or use manual integration.",
          );
        if (integration && discoveryKey !== currentSources)
          throw new Error(
            "Design sources changed. Discover the top-level ports again before connecting.",
          );
        const discovered = await virtualFpgaApi.discoverPorts(
          getHdlSources(files, connection.topModule),
          connection.topModule,
          projectPath,
        );
        if (
          discovered.some((p) => (p.offset ?? 0) !== 0 || p.upto) ||
          JSON.stringify(
            discovered
              .map((p) => ({
                name: p.name,
                direction: p.direction,
                width: p.width,
              }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          ) !==
            JSON.stringify(
              [...connection.ports].sort((a, b) =>
                a.name.localeCompare(b.name),
              ),
            )
        )
          throw new Error(
            "Top-level ports changed. Review assisted connections again.",
          );
      }
      const handwritten = getHdlSources(files, top).filter(
        (f) => !f.name.startsWith("Register_Map/"),
      );
      if (
        handwritten.some((f) =>
          new RegExp(`\\bmodule\\s+(?:${map.name}|${map.name}_top)\\b`).test(
            f.content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""),
          ),
        )
      )
        throw new Error(
          "Generated module name conflicts with a design module. Choose another map name.",
        );
      const result = await store.generate(map, connection);
      onGenerated(result.files, result.removed);
      setOutputs(result.manifest.outputs.map((o) => o.path));
      setGeneratedKey(result.manifest.generatedKey);
      setSavedIntegration(connection);
      setIntegration(undefined);
      setStatus("Generated files saved in Register_Map/");
      if (connection && activate)
        onActivateTop(`Register_Map/${map.name}_top.sv`, `${map.name}_top`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function discover() {
    setBusy(true);
    setError("");
    try {
      const ports = await virtualFpgaApi.discoverPorts(
        getHdlSources(files, top),
        top,
        projectPath,
      );
      if (
        !ports.length ||
        ports.some(
          (p) =>
            !["input", "output"].includes(p.direction) ||
            (p.offset ?? 0) !== 0 ||
            p.upto ||
            p.width > 64 ||
            p.name.startsWith("rb_"),
        )
      )
        throw new Error(
          "This top-level needs manual integration: assisted wrappers support ordinary descending, zero-based input/output ports up to 64 bits.",
        );
      setIntegration({
        topModule: top,
        ports: ports.map((p) => ({
          name: p.name,
          direction: p.direction as "input" | "output",
          width: p.width,
        })),
        clock: "",
        reset: "",
        designInputs: {},
        bankInputs: {},
      });
      setDiscoveryKey(currentSources);
    } catch (e) {
      setError(
        `${getErrorMessage(e)} Use the manual instantiation snippet below.`,
      );
    } finally {
      setBusy(false);
    }
  }
  if (!projectPath)
    return (
      <section className="mas">
        <h1>Register Builder</h1>
        <p>
          Create or open a disk-backed Allora project to define a register bank.
        </p>
      </section>
    );
  const ports = issues.length ? [] : bankPorts(map);
  let wrapper = "";
  if (integration) {
    try {
      wrapper = generateWrapper(map, integration);
    } catch (e) {
      wrapper = getErrorMessage(e);
    }
  }
  return (
    <section className="mas rb">
      <header className="mas-header">
        <div>
          <span className="mas-kicker">
            <RegisterBuilderIcon size={18} /> REGISTER BUILDER V1
          </span>
          <h1>Register map workspace</h1>
          <p>Define the software interface. Connect it to your hardware.</p>
        </div>
        <div className="rb-actions">
          <button
            disabled={!ready || busy}
            onClick={() =>
              void store
                ?.saveMap(map)
                .then((file) => {
                  onGenerated([file], []);
                  setError("");
                  setStatus("Map saved with project");
                })
                .catch((e) => setError(getErrorMessage(e)))
            }
          >
            Save map
          </button>
          <button
            className="mas-primary"
            disabled={!ready || busy || !!issues.length}
            onClick={() => void generate(savedIntegration)}
          >
            Generate files
          </button>
        </div>
      </header>
      <div className="rb-status" role="status">
        {busy ? "Working…" : status} ·{" "}
        {outputs.length
          ? stale
            ? "Generation out of date"
            : "Generated files current"
          : "No generated files yet"}
      </div>
      {error && (
        <div className="rb-error" role="alert">
          {error}
        </div>
      )}
      <fieldset disabled={!ready || busy} className="rb-config">
        <label>
          Module name
          <input
            value={map.name}
            onChange={(e) => change({ ...map, name: e.target.value })}
          />
        </label>
        <label>
          Address bits
          <input
            type="number"
            min="1"
            max="32"
            value={map.addressWidth}
            onChange={(e) =>
              change({ ...map, addressWidth: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Data bits
          <select
            value={map.dataWidth}
            onChange={(e) =>
              change({ ...map, dataWidth: Number(e.target.value) })
            }
          >
            {[8, 16, 32, 64].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        <label>
          Reset
          <select
            value={String(map.resetActiveLow)}
            onChange={(e) =>
              change({ ...map, resetActiveLow: e.target.value === "true" })
            }
          >
            <option value="false">Active high · rst</option>
            <option value="true">Active low · rst_n</option>
          </select>
        </label>
      </fieldset>
      <div className="rb-layout">
        <aside className="rb-panel">
          <div className="rb-panel-title">
            <h2>Address map</h2>
            <button
              disabled={!ready || busy || map.registers.length >= 256}
              onClick={add}
            >
              <Plus size={14} /> Register
            </button>
          </div>
          <small>Byte offsets · {map.dataWidth / 8}-byte slots</small>
          {!map.registers.length && (
            <p>
              Add your first register, then define fields or use the entire
              word.
            </p>
          )}
          <div className="rb-register-list">
            {map.registers.map((r) => (
              <button
                key={r.id}
                className={r.id === selected ? "selected" : ""}
                onClick={() => setSelected(r.id)}
              >
                <code>{r.offset}</code>
                <strong>{r.name || "Unnamed"}</strong>
                <span>
                  {r.width}b · {r.access}
                </span>
                {issues.some((i) => i.registerId === r.id) && (
                  <span className="rb-invalid">!</span>
                )}
              </button>
            ))}
          </div>
        </aside>
        <div className="rb-panel">
          {register ? (
            <>
              <div className="rb-panel-title">
                <h2>{register.name || "Register"}</h2>
                <div className="rb-actions">
                  <button
                    title="Move register up"
                    aria-label="Move register up"
                    disabled={busy}
                    onClick={() => move(-1)}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    title="Move register down"
                    aria-label="Move register down"
                    disabled={busy}
                    onClick={() => move(1)}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    disabled={busy || map.registers.length >= 256}
                    onClick={() => {
                      const fresh = nextRegister(map);
                      const copy = {
                        ...register,
                        id: fresh.id,
                        name: fresh.name,
                        offset: fresh.offset,
                        fields: register.fields.map((f) => ({
                          ...f,
                          id: id(),
                        })),
                      };
                      change({ ...map, registers: [...map.registers, copy] });
                      setSelected(copy.id);
                    }}
                  >
                    <Copy size={14} /> Duplicate
                  </button>
                  <button
                    disabled={busy}
                    aria-label="Delete register"
                    onClick={() => {
                      change({
                        ...map,
                        registers: map.registers.filter(
                          (r) => r.id !== register.id,
                        ),
                      });
                      setSelected(null);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <fieldset disabled={busy} className="rb-register-form">
                <label>
                  Name
                  <input
                    value={register.name}
                    onChange={(e) => editRegister({ name: e.target.value })}
                  />
                </label>
                <label>
                  Offset
                  <input
                    value={register.offset}
                    onChange={(e) => editRegister({ offset: e.target.value })}
                  />
                </label>
                <label>
                  Width
                  <input
                    type="number"
                    min="1"
                    max={map.dataWidth}
                    value={register.width}
                    onChange={(e) =>
                      editRegister({ width: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Access
                  <select
                    value={register.access}
                    onChange={(e) =>
                      editRegister({ access: e.target.value as Access })
                    }
                  >
                    {modes.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Reset
                  <input
                    value={register.reset}
                    onChange={(e) => editRegister({ reset: e.target.value })}
                  />
                </label>
                <label className="rb-description">
                  Description
                  <input
                    value={register.description}
                    onChange={(e) =>
                      editRegister({ description: e.target.value })
                    }
                  />
                </label>
              </fieldset>
              <div className="rb-bits" aria-label="Register bit layout">
                {Array.from(
                  { length: Math.max(0, Math.min(64, register.width || 0)) },
                  (_, n) => register.width - 1 - n,
                ).map((bit) => {
                  const fs = register.fields.filter(
                    (f) => bit >= f.lsb && bit <= f.msb,
                  );
                  return (
                    <div
                      key={bit}
                      className={`rb-bit ${fs.length > 1 ? "overlap" : fs.length ? "field" : ""}`}
                      title={
                        fs
                          .map(
                            (f) => `${f.name} [${f.msb}:${f.lsb}] ${f.access}`,
                          )
                          .join(", ") || "Inherits register access/reset"
                      }
                    >
                      <small>{bit}</small>
                      <span>{fs[0]?.name ?? "—"}</span>
                    </div>
                  );
                })}
              </div>
              <div className="rb-panel-title">
                <h3>Bit fields</h3>
                <button
                  disabled={busy || register.fields.length >= 64}
                  onClick={() => {
                    let bit = 0;
                    while (
                      bit < register.width &&
                      register.fields.some((f) => bit >= f.lsb && bit <= f.msb)
                    )
                      bit++;
                    let n = 0;
                    while (
                      register.fields.some(
                        (f) => f.name.toUpperCase() === `FIELD_${n}`,
                      )
                    )
                      n++;
                    editRegister({
                      fields: [
                        ...register.fields,
                        {
                          id: id(),
                          name: `FIELD_${n}`,
                          lsb: bit,
                          msb: bit,
                          access: register.access,
                          reset: "0",
                          description: "",
                        },
                      ],
                    });
                  }}
                >
                  <Plus size={14} /> Field
                </button>
              </div>
              <p className="rb-help">
                Field access and reset override the register defaults. Unfielded
                bits inherit them. RO values come from hardware; W1C hardware
                set wins simultaneous clear.
              </p>
              <div className="rb-fields">
                {register.fields.map((f) => (
                  <fieldset key={f.id} disabled={busy} className="rb-field">
                    <label>
                      Name
                      <input
                        value={f.name}
                        onChange={(e) => editField(f, { name: e.target.value })}
                      />
                    </label>
                    <label>
                      MSB
                      <input
                        type="number"
                        value={f.msb}
                        onChange={(e) =>
                          editField(f, { msb: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      LSB
                      <input
                        type="number"
                        value={f.lsb}
                        onChange={(e) =>
                          editField(f, { lsb: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Access
                      <select
                        value={f.access}
                        onChange={(e) =>
                          editField(f, { access: e.target.value as Access })
                        }
                      >
                        {modes.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Reset
                      <input
                        value={f.reset}
                        onChange={(e) =>
                          editField(f, { reset: e.target.value })
                        }
                      />
                    </label>
                    <button
                      aria-label={`Delete field ${f.name}`}
                      onClick={() =>
                        editRegister({
                          fields: register.fields.filter(
                            (item) => item.id !== f.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                    <label className="rb-description">
                      Description
                      <input
                        value={f.description}
                        onChange={(e) =>
                          editField(f, { description: e.target.value })
                        }
                      />
                    </label>
                  </fieldset>
                ))}
              </div>
            </>
          ) : (
            <div className="rb-empty">
              <RegisterBuilderIcon size={48} />
              <h2>
                {map.registers.length
                  ? "Select a register"
                  : "Build your first register bank"}
              </h2>
              <p>
                RW controls, hardware status, write-only commands, and W1C flags
                share one simple native interface.
              </p>
              <button
                className="mas-primary"
                disabled={!ready || busy}
                onClick={add}
              >
                Add register
              </button>
            </div>
          )}
        </div>
      </div>
      <section className="rb-panel rb-validation" aria-live="polite">
        <h2>
          {issues.length
            ? `${issues.length} validation issue${issues.length === 1 ? "" : "s"}`
            : "Register map valid"}
        </h2>
        {issues.length ? (
          <ul>
            {issues.map((i, n) => (
              <li key={n}>
                <button
                  onClick={() => i.registerId && setSelected(i.registerId)}
                >
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>Ready to generate synthesizable HDL and firmware constants.</p>
        )}
      </section>
      <section className="rb-panel">
        <div className="rb-panel-title">
          <h2>Connect to your design</h2>
          <button
            disabled={busy || !ready || !!issues.length}
            onClick={() => void discover()}
          >
            Connect to Top Level
          </button>
        </div>
        {savedIntegration && (
          <button
            disabled={busy}
            onClick={() => {
              const original = findTopModuleFile(
                files,
                savedIntegration.topModule,
              );
              if (!original) {
                setError(
                  "Original design top is missing. Select your design top in the explorer before manual integration.",
                );
                return;
              }
              onActivateTop(original, savedIntegration.topModule);
              setStatus(
                "Original design selected. Use the manual snippet to connect the register bank.",
              );
            }}
          >
            Use original top for manual integration
          </button>
        )}
        <p>
          Manual: generate the bank and copy the snippet into your module.
          Assisted: discover <code>{top}</code>, select clock/reset and matching
          hardware signals, then review a wrapper. Applying makes the wrapper
          the project top level. Your design source is preserved. Existing
          constraints and peripheral mappings need review for the new rb_*
          ports.
        </p>
        {integration && (
          <div className="rb-integration">
            <h3>Review connections to {integration.topModule}</h3>
            <div className="rb-config">
              {(["clock", "reset"] as const).map((key) => (
                <label key={key}>
                  {key === "reset"
                    ? `Reset (must be active ${map.resetActiveLow ? "low" : "high"})`
                    : "Clock"}
                  <select
                    value={integration[key]}
                    onChange={(e) =>
                      setIntegration({
                        ...integration,
                        [key]: e.target.value,
                        designInputs: {},
                      })
                    }
                  >
                    <option value="">
                      Expose separate rb_
                      {key === "clock"
                        ? "clk"
                        : map.resetActiveLow
                          ? "rst_n"
                          : "rst"}{" "}
                      input
                    </option>
                    {integration.ports
                      .filter((p) => p.direction === "input" && p.width === 1)
                      .map((p) => (
                        <option key={p.name}>{p.name}</option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
            {integration.ports
              .filter(
                (p) =>
                  p.direction === "input" &&
                  ![integration.clock, integration.reset].includes(p.name),
              )
              .map((p) => (
                <label key={p.name}>
                  Design input {p.name} [{p.width} bits]
                  <select
                    value={integration.designInputs[p.name] ?? ""}
                    onChange={(e) => {
                      const next = { ...integration.designInputs };
                      if (e.target.value) next[p.name] = e.target.value;
                      else delete next[p.name];
                      setIntegration({ ...integration, designInputs: next });
                    }}
                  >
                    <option value="">Keep external design input</option>
                    {ports
                      .filter(
                        (b) =>
                          b.direction === "output" &&
                          b.name !== "rd_data" &&
                          b.width === p.width,
                      )
                      .map((b) => (
                        <option key={b.name}>{b.name}</option>
                      ))}
                  </select>
                </label>
              ))}
            {ports
              .filter(
                (p) =>
                  p.direction === "input" &&
                  ![
                    "clk",
                    "rst",
                    "rst_n",
                    "addr",
                    "wr_data",
                    "wr_en",
                    "rd_en",
                  ].includes(p.name),
              )
              .map((p) => (
                <label key={p.name}>
                  Bank input {p.name} [{p.width} bits]
                  <select
                    value={integration.bankInputs[p.name] ?? ""}
                    onChange={(e) => {
                      const next = { ...integration.bankInputs };
                      if (e.target.value) next[p.name] = e.target.value;
                      else delete next[p.name];
                      setIntegration({ ...integration, bankInputs: next });
                    }}
                  >
                    <option value="">Expose external rb_{p.name}</option>
                    {integration.ports
                      .filter(
                        (b) => b.direction === "output" && b.width === p.width,
                      )
                      .map((b) => (
                        <option key={b.name}>{b.name}</option>
                      ))}
                  </select>
                </label>
              ))}
            <p>
              Native address/data/enables remain explicit wrapper ports. Connect
              a bus master, map virtual inputs, or supply a protocol adapter in
              your design.
            </p>
            <pre>{wrapper}</pre>
            <button
              className="mas-primary"
              disabled={busy || discoveryKey !== currentSources}
              onClick={() => void generate(integration, true)}
            >
              Generate wrapper &amp; use as top level
            </button>
            <button onClick={() => setIntegration(undefined)}>Cancel</button>
          </div>
        )}
        {!issues.length && (
          <details>
            <summary>Manual instantiation snippet</summary>
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(generateSnippet(map))
                  .then(() => setStatus("Instantiation snippet copied"))
                  .catch((e) => setError(getErrorMessage(e)))
              }
            >
              Copy snippet
            </button>
            <pre>{generateSnippet(map)}</pre>
          </details>
        )}
      </section>
      <section className="rb-panel">
        <h2>Generated project files</h2>
        <p>
          Builder-owned files are read-only in the editor. Regeneration checks
          content hashes and refuses to overwrite unrelated or edited files.
        </p>
        <div className="rb-output-list">
          {outputs.map((path) => (
            <button key={path} onClick={() => onOpenFile(path)}>
              {path}
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
