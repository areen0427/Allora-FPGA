import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRightLeft, ChevronRight, GitFork } from "lucide-react";
import BoardMigrationSection from "../src/pages/dashboard/BoardMigrationSection";
import { getBoardById } from "../src/data/boards";
import type {
  MigrationFile,
  MigrationSnapshot,
  MigrationPatch,
} from "../src/lib/boardMigration";
import "../src/App.css";

const file = (relativePath: string, content: string | null): MigrationFile => ({
  relativePath,
  content,
  size: content?.length ?? 7,
  sha256: "fixture",
});
function source(manual = false): MigrationSnapshot {
  return {
    projectPath: "/fixture/source",
    fingerprint: "a".repeat(64),
    directories: ["src", "constraints", "assets/sources"],
    topModule: "top",
    portError: null,
    excluded: ["build", ".git"],
    ports: [
      { name: "clk", direction: "input", width: 1 },
      { name: "led", direction: "output", width: 1 },
    ],
    files: [
      file(
        "allora-project.json",
        JSON.stringify({
          name: "UI Fixture",
          boardId: "icesugar-v1-5",
          topModule: "top",
          language: "SystemVerilog",
        }),
      ),
      file(
        "src/top.sv",
        "module top(input clk, output led); assign led=clk; endmodule",
      ),
      file(
        "constraints/constraints.pcf",
        `set_io clk 35\nset_io led 41\n${manual ? "set_frequency clk 24\n" : ""}`,
      ),
      file("assets/sources/image.bin", null),
    ],
  };
}
let current = source();
class FixtureChannel {
  onmessage = () => {};
}
Object.assign(window, {
  __TAURI__: {
    core: {
      Channel: FixtureChannel,
      invoke: async (
        command: string,
        args: { request: Record<string, unknown> },
      ) => {
        const request = args?.request;
        if (command === "inspect_board_migration")
          return structuredClone(current);
        if (command === "create_board_migration_copy") {
          const patches = request.patches as MigrationPatch[],
            archives = request.archivePaths as string[];
          current = {
            ...current,
            projectPath: "/fixture/migrated",
            fingerprint: "b".repeat(64),
            files: current.files
              .map((item) =>
                archives.includes(item.relativePath)
                  ? {
                      ...item,
                      relativePath: `.allora-migration/${current.fingerprint.slice(0, 16)}/${item.relativePath}.txt`,
                    }
                  : item,
              )
              .filter(
                (item) =>
                  !patches.some(
                    (patch) => patch.relativePath === item.relativePath,
                  ),
              )
              .concat(
                patches.map((patch) => file(patch.relativePath, patch.content)),
              ),
          };
          return {
            projectPath: current.projectPath,
            fileCount: current.files.length,
            excluded: current.excluded,
          };
        }
        if (command === "write_project_file") {
          const path = String(request.path).replace(
            `${current.projectPath}/`,
            "",
          );
          current.files = [
            ...current.files.filter((item) => item.relativePath !== path),
            file(path, String(request.content)),
          ];
          return;
        }
        if (command === "generate_synthesis_diagram")
          return { logs: [], nodes: [] };
        if (command === "generate_bitstream")
          return {
            timing: { status: "pass", message: "Fixture timing result" },
            artifactPath: "/fixture/migrated/build/test.bin",
          };
        throw new Error(`Unsupported fixture command: ${command}`);
      },
    },
  },
});

export function Fixture() {
  const [view, setView] = useState(0),
    [opened, setOpened] = useState(false),
    [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const metadata = JSON.parse(
    current.files.find((item) => item.relativePath === "allora-project.json")!
      .content!,
  );
  const board = getBoardById(metadata.boardId)!;
  const files = current.files.map((item) => ({
    name: item.relativePath.startsWith("src/")
      ? item.relativePath.slice(4)
      : item.relativePath === "allora-project.json"
        ? item.relativePath
        : item.relativePath,
    path: `${current.projectPath}/${item.relativePath}`,
    content: item.content ?? "",
    isBinary: item.content === null,
  }));
  const reset = (manual: boolean) => {
    current = source(manual);
    setView((value) => value + 1);
    setOpened(false);
    setStatus("");
  };
  const chooseTarget = () => {
    const select = document.querySelector<HTMLSelectElement>(
      ".migration-fields select",
    );
    if (!select) {
      setStatus("Open the migration workspace first.");
      return;
    }
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )!.set!.call(select, "icebreaker");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    setStatus("Fixture destination: iCEBreaker");
  };
  return (
    <main
      style={{
        padding: "24px",
        minHeight: "100vh",
        boxSizing: "border-box",
        color: "var(--ui-text)",
        background: "var(--ui-page-bg)",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          marginBottom: "22px",
        }}
      >
        <strong>UI fixture · native responses mocked</strong>
        <button onClick={() => reset(false)}>Reset automatic fixture</button>
        <button onClick={() => reset(true)}>Reset manual fixture</button>
        <button onClick={chooseTarget}>Preset iCEBreaker destination</button>
        <button
          onClick={() => {
            document.documentElement.dataset.theme = "ice";
          }}
        >
          Ice
        </button>
        <button
          onClick={() => {
            document.documentElement.dataset.theme = "black-ice";
          }}
        >
          Black Ice
        </button>
        <button
          onClick={() => {
            document.documentElement.dataset.reduceMotion =
              document.documentElement.dataset.reduceMotion === "true"
                ? "false"
                : "true";
          }}
        >
          Toggle Reduce Motion
        </button>
      </header>
      <section style={{ width: 250 }} aria-label="Project explorer actions">
        <button
          type="button"
          className="explorer-project-action"
          onClick={() => setStatus("Publish to GitHub fixture action")}
        >
          <GitFork size={16} />
          <span>
            <strong>Publish to GitHub</strong>
            <small>Commit, connect, and push</small>
          </span>
          <ChevronRight size={15} />
        </button>
        <button
          type="button"
          className="explorer-project-action"
          onClick={() => setOpened(true)}
        >
          <ArrowRightLeft size={16} />
          <span>
            <strong>Migrate Board</strong>
            <small>Move this project to another board</small>
          </span>
          <ChevronRight size={15} />
        </button>
      </section>
      {status && <p role="status">{status}</p>}
      {opened && (
        <BoardMigrationSection
          key={view}
          active
          board={board}
          files={files}
          projectPath={current.projectPath}
          topLevelFileName="top.sv"
          onSave={async () => true}
          onReload={async () => {
            setRevision(revision + 1);
          }}
          onOpenCopy={async () => {
            setView((value) => value + 1);
            setStatus("Migrated copy opened");
          }}
          onNavigate={(section, path) =>
            setStatus(`Requested ${section}${path ? `: ${path}` : ""}`)
          }
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
