import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import type { BoardDefinition } from "../data/boards";
import EditorSection from "./dashboard/EditorSection";
import BoardSection from "./dashboard/BoardSection";
import ConstraintsSection from "./dashboard/ConstraintsSection";
import SynthesisSection from "./dashboard/SynthesisSection";
import PinMappingSection from "./dashboard/PinMappingSection";
import BitstreamSection from "./dashboard/BitstreamSection";
import SidebarButton from "./dashboard/SidebarButton";
import type { DashboardSection, ProjectFile } from "./dashboard/types";
import { Cpu } from "lucide-react";
import { saveProject } from "../data/projects";
import type { SavedProject } from "../data/projects";
import type { AppSettings } from "../data/settings";

type DashboardProps = {
  board: BoardDefinition;
  project: SavedProject | null;
  settings: AppSettings;
  onBack: () => void;
  onHome: () => void;
};

export default function Dashboard({
  board,
  project,
  settings,
  onBack,
  onHome,
}: DashboardProps) {
  const [activeSection, setActiveSection] =
    useState<DashboardSection>("editor");

  const [files, setFiles] = useState<ProjectFile[]>(project?.files ?? []);
  const [activeFileName, setActiveFileName] = useState<string | null>(
    project?.activeFileName ?? null
  );
  const [sidebarWidth, setSidebarWidth] = useState(215);
  const [lastSavedAt, setLastSavedAt] = useState(project?.updatedAt ?? "");
  const [confirmingDeleteFileName, setConfirmingDeleteFileName] = useState<string | null>(null);

  const activeFile = files.find((file) => file.name === activeFileName);
  const projectName = project?.name ?? "Untitled Project";

  useEffect(() => {
    if (!project || !settings.autoSave) return;

    const delay =
      settings.autoSaveInterval === "5s"
        ? 5000
        : settings.autoSaveInterval === "30s"
          ? 30000
          : 0;

    const saveCurrentProject = () => {
      const now = new Date().toISOString();
      saveProject({
        ...project,
        boardId: board.id,
        files,
        activeFileName,
        updatedAt: now,
      });
      setLastSavedAt(now);
    };

    if (delay === 0) {
      saveCurrentProject();
      return;
    }

    const timeout = window.setTimeout(saveCurrentProject, delay);
    return () => window.clearTimeout(timeout);
  }, [activeFileName, board.id, files, project, settings.autoSave, settings.autoSaveInterval]);

  function startSidebarResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextWidth = Math.min(Math.max(moveEvent.clientX - 24, 180), 260);
      setSidebarWidth(nextWidth);
    }

    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function getUntitledFileName() {
  let index = 1;

  while (files.some((file) => file.name === `untitled-${index}.v`)) {
    index++;
  }

  return `untitled-${index}.v`;
}

function createNewFile(fileName = getUntitledFileName()) {
  if (files.some((file) => file.name === fileName)) return;

  setFiles((currentFiles) => [...currentFiles, { name: fileName, content: "" }]);
  setActiveFileName(fileName);
  setActiveSection("editor");
}

function renameFile(oldName: string, newName: string) {
  if (!newName || oldName === newName) return;

  if (files.some((file) => file.name === newName)) {
    alert("A file with that name already exists.");
    return;
  }

  setFiles((currentFiles) =>
    currentFiles.map((file) =>
      file.name === oldName ? { ...file, name: newName } : file
    )
  );

  if (activeFileName === oldName) {
    setActiveFileName(newName);
  }
}

function updateActiveFile(content: string) {
  if (!activeFileName) {
    const fileName = getUntitledFileName();

    setFiles([{ name: fileName, content }]);
    setActiveFileName(fileName);
    setActiveSection("editor");
    return;
  }

  setFiles((currentFiles) =>
    currentFiles.map((file) =>
      file.name === activeFileName ? { ...file, content } : file
    )
  );
}

function deleteFile(fileName: string) {
  setFiles((currentFiles) => {
    const nextFiles = currentFiles.filter((file) => file.name !== fileName);

    if (activeFileName === fileName) {
      setActiveFileName(nextFiles[0]?.name ?? null);
    }

    return nextFiles;
  });
}

function requestCloseFile(fileName: string) {
  if (settings.confirmBeforeDelete) {
    setConfirmingDeleteFileName(fileName);
    return;
  }

  deleteFile(fileName);
}

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    selectedFiles.forEach((file) => {
      const allowed =
        file.name.endsWith(".v") ||
        file.name.endsWith(".sv") ||
        file.name.endsWith(".vhd") ||
        file.name.endsWith(".vhdl");

      if (!allowed) return;

      const reader = new FileReader();

      reader.onload = () => {
        const content = String(reader.result ?? "");

        setFiles((currentFiles) => {
          const alreadyExists = currentFiles.some((f) => f.name === file.name);

          if (alreadyExists) {
            return currentFiles.map((f) =>
              f.name === file.name ? { ...f, content } : f
            );
          }

          return [...currentFiles, { name: file.name, content }];
        });

        setActiveFileName(file.name);
        setActiveSection("editor");
      };

      reader.readAsText(file);
    });

    event.target.value = "";
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        padding: "24px",
        gap: "24px",
        color: "#0f172a",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        alignItems: "flex-start",
      }}
    >
      <aside
        style={{
          width: `${sidebarWidth}px`,
          height: "calc(100vh - 48px)",
          overflow: "hidden",
          minWidth: "180px",
          maxWidth: "260px",
          background:
        "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",

        border: "1px solid rgba(226,232,240,0.5)",

        borderRadius: "24px",

        boxShadow:
        "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px rgba(15,23,42,0.08)",

        padding: "18px 14px",
          position: "sticky",
          top: "24px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "26px" }}>
        <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "18px",
  }}
>
  <button
    type="button"
    aria-label="Go to home page"
    title="Home"
    onClick={onHome}
    style={{
      width: "34px",
      height: "34px",
      borderRadius: "10px",
      border: "none",
      background:
        "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
      flexShrink: 0,
      cursor: "pointer",
      padding: 0,
    }}
  >
    <Cpu size={18} color="white" strokeWidth={2.2} />
  </button>

  <div style={{ minWidth: 0 }}>
    <div
      style={{
        fontSize: "15px",
        fontWeight: 800,
        color: "#0f172a",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {projectName || "Untitled Project"}
    </div>

    <div
      style={{
        fontSize: "12px",
        color: "#64748b",
        fontWeight: 600,
      }}
    >
      FPGA Project
    </div>
    <div
      style={{
        marginTop: "4px",
        fontSize: "11px",
        color: "#94a3b8",
        fontWeight: 700,
      }}
    >
      {lastSavedAt ? "Saved" : "Not saved"}
    </div>
  </div>
</div>
        </div>

        <nav style={{ display: "grid", gap: "8px" }}>
          <SidebarButton label="Editor" active={activeSection === "editor"} onClick={() => setActiveSection("editor")} />
          <SidebarButton label="Board" active={activeSection === "board"} onClick={() => setActiveSection("board")} />
          <SidebarButton label="Synthesis" active={activeSection === "synthesis"} onClick={() => setActiveSection("synthesis")} />
          <SidebarButton label="Pin Mapping" active={activeSection === "pin-mapping"} onClick={() => setActiveSection("pin-mapping")} />
          <SidebarButton label="Constraints" active={activeSection === "constraints"} onClick={() => setActiveSection("constraints")} />
          <SidebarButton label="Bitstream" active={activeSection === "bitstream"} onClick={() => setActiveSection("bitstream")} />
        </nav>

        <div
            style={{
                marginTop: "28px",
                paddingTop: "22px",
                borderTop: "1px solid #e2e8f0",

                flex: 1,
                minHeight: 0,

                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
        >
          <div
            style={{
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <div
              style={{
                color: "#64748b",
                fontSize: "12px",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Files
            </div>

            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
              <button
                type="button"
                title="New file"
                aria-label="New file"
                onClick={() => createNewFile()}
                style={{
                  height: "28px",
                  borderRadius: "9px",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontWeight: 850,
                  cursor: "pointer",
                  fontSize: "12px",
                  lineHeight: 1,
                  padding: "0 9px",
                }}
              >
                Add
              </button>

              <label
                title="Import HDL"
                aria-label="Import HDL"
                style={{
                  height: "28px",
                  borderRadius: "9px",
                  border: "1px solid #dbe4f0",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: 850,
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                  padding: "0 9px",
                }}
              >
                Import
                <input
                  type="file"
                  multiple
                  accept=".v,.sv,.vhd,.vhdl"
                  onChange={importFiles}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>
            <div
                style={{
                    overflowY: "auto",
                    flex: 1,
                    minHeight: 0,
                    paddingRight: "4px",
                }}
            >
          {files.map((file) => (
            <div
                key={file.name}
                style={{
                marginTop: "4px",
                }}
                className="fileItem"
            >
                <button
                onClick={() => {
                    setActiveFileName(file.name);
                    setActiveSection("editor");
                }}
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",

                    padding: "10px",
                    borderRadius: "12px",
                    border: "none",

                    background:
                    activeSection === "editor" &&
                    file.name === activeFileName
                        ? "#eef2ff"
                        : "transparent",

                    color:
                    activeSection === "editor" &&
                    file.name === activeFileName
                        ? "#2563eb"
                        : "#475569",

                    cursor: "pointer",
                }}
                >
                <span>📄</span>

                <span
                    style={{
                    flex: 1,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    textAlign: "left",
                    fontWeight: 700,
                    }}
                >
                    {file.name}
                </span>

                <button
                    type="button"
                    className="fileClose"
                    aria-label={`Close ${file.name}`}
                    title={`Close ${file.name}`}
                    onClick={(e) => {
                    e.stopPropagation();
                    requestCloseFile(file.name);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                    }}
                >
                    ×
                </button>
                </button>
            </div>
            ))}
        </div>
        </div>

        <button
          onClick={onBack}
          style={{
            marginTop: "auto",
            border: "1px solid #e2e8f0",
            background: "#ffffff",
            color: "#475569",
            borderRadius: "14px",
            padding: "13px 14px",
            fontSize: "15px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ← Back to setup
        </button>

        <div
          onMouseDown={startSidebarResize}
          style={{
            position: "absolute",
            top: 0,
            right: "-5px",
            width: "10px",
            height: "100%",
            cursor: "col-resize",
          }}
        />
      </aside>

      <main
        style={{
          flex: 1,
          padding: "0",
          overflowY:
            activeSection === "editor" || activeSection === "pin-mapping"
              ? "hidden"
              : "visible",
          minHeight: 0,
        }}
      >
        {activeSection === "editor" && (
        <EditorSection
            files={files}
            activeFileName={activeFileName}
            setActiveFileName={setActiveFileName}
            activeFile={activeFile}
            updateActiveFile={updateActiveFile}
            createNewFile={() => createNewFile()}
            requestCloseFile={requestCloseFile}
            renameFile={renameFile}
            settings={settings}
          />
        )}

        {activeSection === "board" && <BoardSection board={board} />}
        {activeSection === "constraints" && <ConstraintsSection board={board} />}
        {activeSection === "synthesis" && (
          <SynthesisSection
            board={board}
            files={files}
            projectName={projectName}
          />
        )}
        {activeSection === "pin-mapping" && (
          <PinMappingSection
            board={board}
            files={files}
            defaultMode={settings.defaultPinMappingMode}
          />
        )}
        {activeSection === "bitstream" && (
          <BitstreamSection
            board={board}
            files={files}
            projectName={projectName}
          />
        )}
      </main>

      {confirmingDeleteFileName ? (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmingDeleteFileName(null)}
        >
          <div
            className="variant-modal"
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: "420px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                marginBottom: "14px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Close File
              </h2>

              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setConfirmingDeleteFileName(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "24px",
                  lineHeight: 1,
                  color: "#64748b",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>

            <p
              style={{
                margin: 0,
                color: "#475569",
                fontSize: "15px",
                lineHeight: 1.6,
              }}
            >
              Remove <strong>{confirmingDeleteFileName}</strong> from this project?
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "24px",
              }}
            >
              <button
                type="button"
                onClick={() => setConfirmingDeleteFileName(null)}
                style={{
                  border: "1px solid #dbe4f0",
                  background: "#ffffff",
                  color: "#475569",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  deleteFile(confirmingDeleteFileName);
                  setConfirmingDeleteFileName(null);
                }}
                style={{
                  border: "none",
                  background: "#2563eb",
                  color: "#ffffff",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  fontSize: "14px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Remove File
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
