import { useRef, useState } from "react";
import type { BoardDefinition } from "../data/boards";
import type { AppSettings } from "../data/settings";
import { getLastProjectParentDirectory } from "../data/settings";
import { hasTauriInvoke } from "../lib/tauri";
import { pickProjectParentDirectory } from "../lib/projectWorkspace";
import "../styles/memory-assets.css";

export default function MemoryProjectSetup({
  board,
  settings,
  onBack,
  onCreate,
}: {
  board?: BoardDefinition;
  settings: AppSettings;
  onBack: () => void;
  onCreate: (
    name: string,
    language: "Verilog" | "SystemVerilog",
    parent: string | null,
  ) => Promise<void>;
}) {
  const [name, setName] = useState("memory-project");
  const [language, setLanguage] = useState<"Verilog" | "SystemVerilog">(
    "SystemVerilog",
  );
  const [parent, setParent] = useState<string | null>(
    settings.projectLocationMode === "last-used"
      ? getLastProjectParentDirectory()
      : null,
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const requiresLocation =
    hasTauriInvoke() && settings.projectLocationMode !== "documents" && !parent;
  async function create() {
    if (!name.trim() || requiresLocation || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await onCreate(name.trim(), language, parent);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="glass-page mas-project-page">
      <form
        className="mas-project-card"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <button
          type="button"
          className="mas-back"
          disabled={busy || picking}
          onClick={onBack}
        >
          ← Back to projects
        </button>
        <span className="mas-kicker">MEMORY ASSET STUDIO</span>
        <h1>Create a project for your assets</h1>
        <p>
          {board ? `Target board: ${board.name}` : "Virtual FPGA project"}. Your
          sources and generated memories will stay with this project.
        </p>
        <label>
          Project name
          <input
            disabled={busy || picking}
            required
            autoFocus
            value={name}
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          HDL language
          <select
            disabled={busy || picking}
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value as "Verilog" | "SystemVerilog")
            }
          >
            <option>SystemVerilog</option>
            <option>Verilog</option>
          </select>
        </label>
        <label>
          Project location
          <div className="mas-location">
            <span>
              {parent ??
                (requiresLocation
                  ? "Choose a location"
                  : "Default AlloraProjects folder")}
            </span>
            <button
              type="button"
              disabled={busy || picking}
              onClick={() => {
                if (lock.current) return;
                lock.current = true;
                setPicking(true);
                setError("");
                void pickProjectParentDirectory()
                  .then((path) => {
                    if (path) setParent(path);
                  })
                  .catch((cause) =>
                    setError(
                      cause instanceof Error ? cause.message : String(cause),
                    ),
                  )
                  .finally(() => {
                    lock.current = false;
                    setPicking(false);
                  });
              }}
            >
              Choose folder
            </button>
          </div>
        </label>
        {error && (
          <p className="mas-project-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="mas-create"
          disabled={!name.trim() || requiresLocation || busy || picking}
        >
          {busy ? "Creating…" : "Create and open Studio"}
        </button>
      </form>
    </div>
  );
}
