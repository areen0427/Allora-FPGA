// Visual harness for production components and real catalog data. Constraint
// saves stay in browser memory; it does not run tools or create a real project.
import { useState } from "react";
import ProjectSetup from "../src/pages/ProjectSetup";
import PinMappingSection from "../src/pages/dashboard/PinMappingSection";
import { PinMappingBrowser } from "../src/pages/welcome/PinMappingBrowser";
import { REAL_BOARDS } from "../src/data/boards";
import { getBoardCapabilities } from "../src/data/boardCapabilities";
import { DEFAULT_SETTINGS } from "../src/data/settings";
import "../src/index.css";
import "../src/App.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "ice";
export default function Fixture() {
  const [boardId, setBoardId] = useState(params.get("board") ?? "ulx3s-85f");
  const [view, setView] = useState(params.get("view") ?? "setup");
  const [files, setFiles] = useState([
    {
      name: "top.v",
      content:
        "module top(input clk25, input btn0, output led0, output extra); endmodule",
    },
  ]);
  const board =
    REAL_BOARDS.find((entry) => entry.id === boardId) ?? REAL_BOARDS[0];
  const supported = getBoardCapabilities(board).bitstream.supported;
  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: 12,
          height: 58,
          borderBottom: "1px solid var(--ui-border-control)",
          fontSize: 12,
        }}
      >
        <strong>UI fixture · real board data · in-memory saves</strong>
        <label>
          Board{" "}
          <select
            aria-label="Fixture board"
            value={boardId}
            onChange={(event) => setBoardId(event.target.value)}
          >
            {REAL_BOARDS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          View{" "}
          <select
            aria-label="Fixture view"
            value={view}
            onChange={(event) => setView(event.target.value)}
          >
            <option value="setup" disabled={!supported}>
              Project setup
            </option>
            <option value="workspace" disabled={!supported}>
              Project workspace
            </option>
            <option value="catalog">Read-only pin browser</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            document.documentElement.dataset.theme =
              document.documentElement.dataset.theme === "ice"
                ? "black-ice"
                : "ice";
          }}
        >
          Toggle theme
        </button>
      </header>
      <div
        className="fixture-content"
        style={{ height: "calc(100vh - 58px)", overflow: "auto" }}
      >
        {view === "setup" && supported ? (
          <ProjectSetup
            key={board.id}
            board={board}
            settings={DEFAULT_SETTINGS}
            onBack={() => setView("catalog")}
            onCreateProject={() => undefined}
          />
        ) : view === "workspace" && supported ? (
          <div style={{ padding: 16 }}>
            <PinMappingSection
              key={board.id}
              board={board}
              files={files}
              defaultMode={
                params.get("mode") === "advanced" ? "advanced" : "simple"
              }
              topLevelFileName="top.v"
              onSaveMappings={async (name, content) => {
                setFiles((current) => [
                  ...current.filter((file) => file.name !== name),
                  { name, content },
                ]);
                return true;
              }}
            />
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            <PinMappingBrowser
              boards={REAL_BOARDS}
              selectedBoardId={board.id}
              onSelectBoard={(id) => id && setBoardId(id)}
            />
          </div>
        )}
      </div>
      <style>{`.fixture-content > .project-setup-page { height: 100%; } .fixture-content .pin-browser-shell { height: calc(100vh - 106px); min-height: 450px; }`}</style>
    </>
  );
}
