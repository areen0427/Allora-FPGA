import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { BoardDefinition } from "../data/boards";
import EditorSection from "./dashboard/EditorSection";
import BoardSection from "./dashboard/BoardSection";
import SynthesisSection from "./dashboard/SynthesisSection";
import TestbenchSection from "./dashboard/TestbenchSection";
import PinMappingSection from "./dashboard/PinMappingSection";
import BitstreamSection from "./dashboard/BitstreamSection";
import HealthSection from "./dashboard/HealthSection";
import SidebarButton from "./dashboard/SidebarButton";
import type { DashboardSection, ProjectFile } from "./dashboard/types";
import {
  ArrowLeft,
  Binary,
  CircuitBoard,
  Code2,
  Activity,
  MapPinned,
  Waves,
  SquareTerminal,
  Plus,
  Settings,
  Upload,
} from "lucide-react";
import { getBoardIconForBoardId } from "./boardIcons";
import { saveProject } from "../data/projects";
import type { SavedProject } from "../data/projects";
import type { AppSettings } from "../data/settings";
import {
  buildProjectFilePath,
  deleteProjectFile as deleteProjectFileOnDisk,
  renameProjectFile as renameProjectFileOnDisk,
  writeProjectFile,
} from "../lib/projectWorkspace";

type DashboardProps = {
  board: BoardDefinition;
  project: SavedProject | null;
  settings: AppSettings;
  projectWarning?: string;
  onSettingsChange: (settings: AppSettings) => void;
  onBack: () => void;
  onHome: () => void;
};

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export default function Dashboard({
  board,
  project,
  settings,
  projectWarning,
  onSettingsChange,
  onBack,
  onHome,
}: DashboardProps) {
  const [activeSection, setActiveSection] =
    useState<DashboardSection>("editor");

  const [files, setFiles] = useState<ProjectFile[]>(project?.files ?? []);
  const [activeFileName, setActiveFileName] = useState<string | null>(
    project?.activeFileName ?? null
  );
  const [openFileNames, setOpenFileNames] = useState<string[]>(
    project?.activeFileName ? [project.activeFileName] : project?.files[0]?.name ? [project.files[0].name] : []
  );
  const [topLevelFileName, setTopLevelFileName] = useState<string | null>(
    project?.topLevelFileName && project.files.some((file) => file.name === project.topLevelFileName)
      ? project.topLevelFileName
      : project?.files.find((file) => isHdlFile(file.name))?.name ?? null
  );
  const [sidebarWidth, setSidebarWidth] = useState(270);
  const [lastSavedAt, setLastSavedAt] = useState(project?.updatedAt ?? "");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [dirtyFileNames, setDirtyFileNames] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [draggedFileName, setDraggedFileName] = useState<string | null>(null);
  const [dragOverFileName, setDragOverFileName] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    fileName: string;
    x: number;
    y: number;
  } | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);

  const activeFile = files.find((file) => file.name === activeFileName);
  const projectName = project?.name ?? "Untitled Project";
  const projectPath = project?.projectPath;
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const latestSaveStateRef = useRef({
    project,
    boardId: board.id,
    files,
    activeFileName,
    topLevelFileName,
    projectPath,
  });
  const showManualSaveButton =
    !settings.autoSave || settings.autoSaveInterval !== "immediate";
  const BoardHomeIcon = getBoardIconForBoardId(board.id);

  useEffect(() => {
    latestSaveStateRef.current = {
      project,
      boardId: board.id,
      files,
      activeFileName,
      topLevelFileName,
      projectPath,
    };
  }, [activeFileName, board.id, files, project, projectPath, topLevelFileName]);

  useEffect(() => {
    const hdlFiles = files.filter((file) => isHdlFile(file.name));
    if (hdlFiles.length === 0) {
      setTopLevelFileName(null);
      return;
    }

    if (!topLevelFileName || !hdlFiles.some((file) => file.name === topLevelFileName)) {
      makeTopLevelFile(hdlFiles[0].name);
    }
  }, [files, topLevelFileName]);

  useEffect(() => {
    if (!contextMenu) return;

    function closeContextMenu() {
      setContextMenu(null);
    }

    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, [contextMenu]);

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "s" || (!event.metaKey && !event.ctrlKey)) {
        return;
      }

      event.preventDefault();
      void saveCurrentProject();
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [activeFileName, board.id, files, project, projectPath]);

  async function saveCurrentProject() {
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      setSaveStatus("saving");
      return;
    }

    isSavingRef.current = true;

    try {
      do {
        pendingSaveRef.current = false;
        const snapshot = latestSaveStateRef.current;
        if (!snapshot.project) return;

        setSaveStatus("saving");
        setSaveErrorMessage("");

        const now = new Date().toISOString();
        const nextProject = {
          ...snapshot.project,
          boardId: snapshot.boardId,
          files: snapshot.files,
          activeFileName: snapshot.activeFileName,
          topLevelFileName: snapshot.topLevelFileName,
          updatedAt: now,
        };

        saveProject(nextProject);

        if (snapshot.projectPath) {
          await Promise.all(
            snapshot.files
              .filter((file) => file.path && !file.isBinary)
              .map((file) => writeProjectFile(file.path as string, file.content))
          );
        }
        setLastSavedAt(now);
      } while (pendingSaveRef.current);

      setDirtyFileNames([]);
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      setSaveErrorMessage(getErrorMessage(error));
    } finally {
      isSavingRef.current = false;
    }
  }

  useEffect(() => {
    if (!project || !settings.autoSave || saveStatus !== "unsaved") return;

    const delay =
      settings.autoSaveInterval === "5s"
        ? 5000
        : settings.autoSaveInterval === "30s"
          ? 30000
          : 0;

    if (delay === 0) {
      void saveCurrentProject();
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveCurrentProject();
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [activeFileName, board.id, files, project, projectPath, saveStatus, settings.autoSave, settings.autoSaveInterval]);

  function markWorkspaceUnsaved(fileName?: string | null) {
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
    }

    setSaveStatus("unsaved");
    setSaveErrorMessage("");

    if (!fileName) return;

    setDirtyFileNames((current) =>
      current.includes(fileName) ? current : [...current, fileName]
    );
  }

  function startSidebarResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextWidth = Math.min(Math.max(moveEvent.clientX - 24, 250), 285);
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
  const extension =
    project?.language === "SystemVerilog"
      ? "sv"
      : project?.language === "VHDL"
        ? "vhd"
        : "v";

  while (files.some((file) => file.name === `untitled-${index}.${extension}`)) {
    index++;
  }

  return `untitled-${index}.${extension}`;
}

function createNewFile(fileName = getUntitledFileName(), content = "") {
  if (files.some((file) => file.name === fileName)) return;

  setFiles((currentFiles) => [
    ...currentFiles,
    {
      name: fileName,
      content,
      path: projectPath ? buildProjectFilePath(projectPath, fileName) : undefined,
    },
  ]);
  setOpenFileNames((current) => [...new Set([...current, fileName])]);
  setActiveFileName(fileName);
  setActiveSection("editor");
  markWorkspaceUnsaved(fileName);
}

async function renameFile(oldName: string, newName: string) {
  if (!newName || oldName === newName) return;

  if (files.some((file) => file.name === newName)) {
    alert("A file with that name already exists.");
    return;
  }

  const targetFile = files.find((file) => file.name === oldName);
  const nextPath =
    targetFile?.path && projectPath
      ? buildProjectFilePath(projectPath, newName)
      : targetFile?.path;

  if (targetFile?.path && nextPath && targetFile.path !== nextPath) {
    try {
      await renameProjectFileOnDisk(targetFile.path, nextPath);
    } catch (error) {
      setSaveStatus("error");
      setSaveErrorMessage(getErrorMessage(error));
      return;
    }
  }

  setFiles((currentFiles) =>
    currentFiles.map((file) =>
      file.name === oldName
        ? { ...file, name: newName, path: nextPath }
        : file
    )
  );

  if (activeFileName === oldName) {
    setActiveFileName(newName);
  }

  setOpenFileNames((current) =>
    current.map((fileName) => (fileName === oldName ? newName : fileName))
  );
  setDirtyFileNames((current) =>
    current.map((fileName) => (fileName === oldName ? newName : fileName))
  );

  if (topLevelFileName === oldName) {
    makeTopLevelFile(newName);
  }
  markWorkspaceUnsaved(newName);
}

function updateActiveFile(content: string) {
  if (!activeFileName) {
    const fileName = getUntitledFileName();

    setFiles([
      {
        name: fileName,
        content,
        path: projectPath ? buildProjectFilePath(projectPath, fileName) : undefined,
      },
    ]);
    setActiveFileName(fileName);
    setActiveSection("editor");
    markWorkspaceUnsaved(fileName);
    return;
  }

  setFiles((currentFiles) =>
    currentFiles.map((file) =>
      file.name === activeFileName ? { ...file, content } : file
    )
  );
  markWorkspaceUnsaved(activeFileName);
}

function openFile(fileName: string) {
  setOpenFileNames((current) => [...new Set([...current, fileName])]);
  setActiveFileName(fileName);
  setActiveSection("editor");
  markWorkspaceUnsaved();
}

function closeOpenFile(fileName: string) {
  setOpenFileNames((current) => {
    const nextOpenFiles = current.filter((name) => name !== fileName);

    if (activeFileName === fileName) {
      setActiveFileName(nextOpenFiles[0] ?? null);
    }

    return nextOpenFiles;
  });
  markWorkspaceUnsaved();
}

async function deleteFileFromProject(fileName: string) {
  const targetFile = files.find((file) => file.name === fileName);

  if (targetFile?.path) {
    try {
      await deleteProjectFileOnDisk(targetFile.path);
    } catch (error) {
      setSaveStatus("error");
      setSaveErrorMessage(getErrorMessage(error));
      return;
    }
  }

  const remainingFiles = files.filter((file) => file.name !== fileName);
  setFiles(remainingFiles);
  setOpenFileNames((current) => current.filter((name) => name !== fileName));

  if (activeFileName === fileName) {
    const nextActiveFile = remainingFiles.find((file) =>
      openFileNames.filter((name) => name !== fileName).includes(file.name)
    );
    setActiveFileName(nextActiveFile?.name ?? null);
  }

  if (topLevelFileName === fileName) {
    const nextTopLevel = remainingFiles.find((file) => isHdlFile(file.name));
    makeTopLevelFile(nextTopLevel?.name ?? null);
  }
  markWorkspaceUnsaved();
}

function reorderFiles(sourceFileName: string, targetFileName: string) {
  if (sourceFileName === targetFileName) return;

  setFiles((currentFiles) => {
    const sourceIndex = currentFiles.findIndex((file) => file.name === sourceFileName);
    const targetIndex = currentFiles.findIndex((file) => file.name === targetFileName);

    if (sourceIndex === -1 || targetIndex === -1) return currentFiles;

    const nextFiles = [...currentFiles];
    const [movedFile] = nextFiles.splice(sourceIndex, 1);
    nextFiles.splice(targetIndex, 0, movedFile);
    return nextFiles;
  });
  markWorkspaceUnsaved();
}

function makeTopLevelFile(fileName: string | null) {
  setTopLevelFileName(fileName);
  if (!fileName) return;

  setFiles((currentFiles) => moveFileToTop(currentFiles, fileName));
  markWorkspaceUnsaved();
}

async function updateConstraintFile(fileName: string, content: string) {
  const existing = files.find((file) => file.name === fileName);
  const nextPath =
    existing?.path ??
    (projectPath ? `${projectPath}/constraints/${fileName}` : undefined);

  if (nextPath) {
    try {
      await writeProjectFile(nextPath, content);
    } catch (error) {
      setSaveStatus("error");
      setSaveErrorMessage(getErrorMessage(error));
      return;
    }
  }

  setFiles((currentFiles) => {
    const currentFile = currentFiles.find((file) => file.name === fileName);

    if (currentFile) {
      return currentFiles.map((file) =>
        file.name === fileName
          ? { ...file, content, path: file.path ?? nextPath }
          : file
      );
    }

    return [
      ...currentFiles,
      {
        name: fileName,
        content,
        path: nextPath,
      },
    ];
  });
  markWorkspaceUnsaved(fileName);
}

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    selectedFiles.forEach((file) => {
      const allowed =
        file.name.endsWith(".v") ||
        file.name.endsWith(".sv") ||
        file.name.endsWith(".vhd") ||
        file.name.endsWith(".vhdl") ||
        file.name.endsWith(".vcd");

      if (!allowed) return;

      const reader = new FileReader();

      reader.onload = () => {
        const content = String(reader.result ?? "");
        const nextPath = projectPath
          ? buildProjectFilePath(projectPath, file.name)
          : undefined;

        setFiles((currentFiles) => {
          const alreadyExists = currentFiles.some((f) => f.name === file.name);

          if (alreadyExists) {
            return currentFiles.map((f) =>
              f.name === file.name ? { ...f, content, path: f.path ?? nextPath } : f
            );
          }

          return [...currentFiles, { name: file.name, content, path: nextPath }];
        });

        openFile(file.name);
        markWorkspaceUnsaved(file.name);
      };

      reader.readAsText(file);
    });

    event.target.value = "";
  }

  return (
    <div
      className="dashboard-workspace"
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        padding: "24px",
        gap: "14px",
        color: "#0f172a",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        alignItems: "flex-start",
      }}
    >
      <aside
        className="dashboard-glass-card dashboard-sidebar"
        style={{
          width: `${sidebarWidth}px`,
          height: "calc(100vh - 48px)",
          overflow: "hidden",
          minWidth: "250px",
          maxWidth: "285px",
          background:
        "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",

        border: "1px solid rgba(226,232,240,0.5)",

        borderRadius: "24px",

        boxShadow:
        "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px rgba(15,23,42,0.08)",

        padding: "14px 12px",
          position: "sticky",
          top: "24px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "14px" }}>
        <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
  }}
>
  <button
    type="button"
    aria-label="Go to home page"
    title="Home"
    onClick={onHome}
    style={{
      width: "32px",
      height: "32px",
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
    <BoardHomeIcon size={18} color="white" strokeWidth={2.2} />
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
  </div>
</div>
        </div>

        <nav
          aria-label="Dashboard sections"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "6px",
          }}
        >
          <SidebarButton label="Editor" icon={<Code2 size={16} />} active={activeSection === "editor"} onClick={() => setActiveSection("editor")} />
          <SidebarButton label="Board" icon={<CircuitBoard size={16} />} active={activeSection === "board"} onClick={() => setActiveSection("board")} />
          <SidebarButton label="Synthesis" icon={<Binary size={16} />} active={activeSection === "synthesis"} onClick={() => setActiveSection("synthesis")} />
          <SidebarButton label="Testbench" icon={<Waves size={16} />} active={activeSection === "testbench"} onClick={() => setActiveSection("testbench")} />
          <SidebarButton label="Pins" icon={<MapPinned size={16} />} active={activeSection === "pin-mapping"} onClick={() => setActiveSection("pin-mapping")} />
          <SidebarButton label="Health" icon={<Activity size={16} />} active={activeSection === "health"} onClick={() => setActiveSection("health")} />
          <SidebarButton label="Bitstream" icon={<SquareTerminal size={16} />} active={activeSection === "bitstream"} onClick={() => setActiveSection("bitstream")} />
        </nav>

        <div
            style={{
                marginTop: "16px",
                paddingTop: "14px",
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
                  width: "28px",
                  borderRadius: "9px",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontWeight: 850,
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={14} />
              </button>

              <label
                className="project-file-import"
                title="Import files"
                aria-label="Import files"
                style={{
                  height: "28px",
                  width: "28px",
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
                  padding: 0,
                }}
              >
                <Upload size={14} />
                <input
                  type="file"
                  multiple
                  accept=".v,.sv,.vhd,.vhdl,.vcd"
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
          <ProjectTree
            files={files}
            projectPath={projectPath}
            activeFileName={activeFileName}
            openFileNames={openFileNames}
            dirtyFileNames={dirtyFileNames}
            topLevelFileName={topLevelFileName}
            draggedFileName={draggedFileName}
            dragOverFileName={dragOverFileName}
            onOpenFile={openFile}
            onCloseFile={closeOpenFile}
            onDragStartFile={setDraggedFileName}
            onDragOverFile={setDragOverFileName}
            onDropFile={(sourceFileName, targetFileName) => {
              if (!sourceFileName) return;
              reorderFiles(sourceFileName, targetFileName);
              setDraggedFileName(null);
              setDragOverFileName(null);
            }}
            onSetTopLevelFile={makeTopLevelFile}
            onOpenContextMenu={(fileName, x, y) =>
              setContextMenu({ fileName, x, y })
            }
          />
        </div>
        </div>

        <div
          style={{
            marginTop: "10px",
            paddingTop: "10px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <div
            style={{
              minWidth: 0,
              color: saveStatus === "error" ? "#dc2626" : "#94a3b8",
              fontSize: "11px",
              fontWeight: 750,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={saveErrorMessage || getSaveStatusLabel(saveStatus, lastSavedAt)}
          >
            {getSaveStatusLabel(saveStatus, lastSavedAt)}
          </div>

          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          {showManualSaveButton ? (
            <button
              type="button"
              aria-label="Save now"
              title="Save now"
              disabled={saveStatus === "saving" || saveStatus === "saved"}
              onClick={() => void saveCurrentProject()}
              style={{
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: "#475569",
                borderRadius: "10px",
                width: "30px",
                height: "30px",
                cursor:
                  saveStatus === "saving" || saveStatus === "saved"
                    ? "not-allowed"
                    : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                opacity: saveStatus === "saving" || saveStatus === "saved" ? 0.56 : 1,
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: 900 }}>S</span>
            </button>
          ) : null}

          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={() => setShowSettings(true)}
            style={{
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              color: "#475569",
              borderRadius: "10px",
              width: "30px",
              height: "30px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <Settings size={14} />
          </button>

          <button
            type="button"
            aria-label="Back to project setup"
            title="Back to project setup"
            onClick={onBack}
            style={{
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              color: "#475569",
              borderRadius: "10px",
              width: "30px",
              height: "30px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <ArrowLeft size={14} />
          </button>
          </div>
        </div>

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
        {projectWarning ? (
          <div
            className="dashboard-glass-card"
            style={{
              marginBottom: "14px",
              borderRadius: "16px",
              padding: "12px 14px",
              color: "#92400e",
              fontSize: "13px",
              fontWeight: 750,
              lineHeight: 1.45,
            }}
          >
            {projectWarning}
          </div>
        ) : null}

        {activeSection === "editor" && (
        <EditorSection
            openFiles={files.filter((file) => openFileNames.includes(file.name))}
            activeFileName={activeFileName}
            setActiveFileName={openFile}
            activeFile={activeFile}
            dirtyFileNames={dirtyFileNames}
            updateActiveFile={updateActiveFile}
            createNewFile={() => createNewFile()}
            closeOpenFile={closeOpenFile}
            renameFile={renameFile}
            settings={settings}
          />
        )}

        {activeSection === "board" && <BoardSection board={board} />}
        {activeSection === "health" && (
          <HealthSection
            board={board}
            files={files}
            topLevelFileName={topLevelFileName}
          />
        )}
        {activeSection === "synthesis" && (
          <SynthesisSection
            board={board}
            files={files}
            projectName={projectName}
            topLevelFileName={topLevelFileName}
            onTopLevelFileNameChange={makeTopLevelFile}
          />
        )}
        {activeSection === "testbench" && (
          <TestbenchSection
            board={board}
            files={files}
            projectName={projectName}
            projectPath={projectPath}
            topLevelFileName={topLevelFileName}
            onCreateTestbench={(fileName, content) => createNewFile(fileName, content)}
            onOpenFile={openFile}
            onAddArtifact={async ({ fileName, content, path }) => {
              const artifactPath =
                path ?? (projectPath ? `${projectPath}/sim/${fileName}` : undefined);

              setFiles((currentFiles) => {
                const existing = currentFiles.find((file) => file.name === fileName);
                if (existing) {
                  return currentFiles.map((file) =>
                    file.name === fileName
                      ? { ...file, content, path: file.path ?? artifactPath }
                      : file
                  );
                }

                return [
                  ...currentFiles,
                  { name: fileName, content, path: artifactPath },
                ];
              });
              markWorkspaceUnsaved(fileName);
            }}
          />
        )}
        {activeSection === "pin-mapping" && (
          <PinMappingSection
            board={board}
            files={files}
            defaultMode={settings.defaultPinMappingMode}
            topLevelFileName={topLevelFileName}
          />
        )}
        {activeSection === "bitstream" && (
          <BitstreamSection
            board={board}
            files={files}
            projectName={projectName}
            projectPath={projectPath}
            topLevelFileName={topLevelFileName}
            onUpdateConstraints={updateConstraintFile}
            onAddArtifact={async ({ fileName, content, isBinary }) => {
              const artifactPath = projectPath
                ? `${projectPath}/build/${fileName}`
                : undefined;

              setFiles((currentFiles) => {
                const existing = currentFiles.find((file) => file.name === fileName);
                if (existing) {
                  return currentFiles.map((file) =>
                    file.name === fileName
                      ? {
                          ...file,
                          content,
                          path: file.path ?? artifactPath,
                          isBinary,
                        }
                      : file
                  );
                }

                return [
                  ...currentFiles,
                  { name: fileName, content, path: artifactPath, isBinary },
                ];
              });
            }}
          />
        )}
      </main>

      {showSettings ? (
        <SettingsModal
          settings={settings}
          onChange={onSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      ) : null}

      {contextMenu ? (
        <div
          className="dashboard-glass-card dashboard-context-menu"
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 50,
            minWidth: "180px",
            borderRadius: "12px",
            border: "1px solid #dbe4f0",
            background: "#ffffff",
            boxShadow: "0 18px 40px rgba(15,23,42,0.14)",
            padding: "6px",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={!isHdlFile(contextMenu.fileName)}
            onClick={() => {
              if (!isHdlFile(contextMenu.fileName)) return;
              makeTopLevelFile(contextMenu.fileName);
              setContextMenu(null);
            }}
            style={{
              width: "100%",
              border: "none",
              borderRadius: "8px",
              background: "transparent",
              color: isHdlFile(contextMenu.fileName) ? "#0f172a" : "#94a3b8",
              textAlign: "left",
              padding: "10px 12px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: isHdlFile(contextMenu.fileName) ? "pointer" : "not-allowed",
            }}
          >
            Set as Top Level
          </button>
          <button
            type="button"
            onClick={() => {
              setDeletingFileName(contextMenu.fileName);
              setContextMenu(null);
            }}
            style={{
              width: "100%",
              border: "none",
              borderRadius: "8px",
              background: "transparent",
              color: "#dc2626",
              textAlign: "left",
              padding: "10px 12px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Delete from Project
          </button>
        </div>
      ) : null}

      {deletingFileName ? (
        <div className="modal-backdrop" onClick={() => setDeletingFileName(null)}>
          <div
            className="variant-modal"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "420px" }}
          >
            <div className="variant-modal-header">
              <h2>Delete File</h2>
              <button onClick={() => setDeletingFileName(null)}>×</button>
            </div>

            <div style={{ color: "#475569", fontSize: "14px", lineHeight: 1.6 }}>
              Delete <strong>{deletingFileName}</strong> from the project?
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              <button
                type="button"
                onClick={() => setDeletingFileName(null)}
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
                onClick={async () => {
                  const fileName = deletingFileName;
                  setDeletingFileName(null);
                  await deleteFileFromProject(fileName);
                }}
                style={{
                  border: "1px solid #fecaca",
                  background: "#fee2e2",
                  color: "#b91c1c",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  fontSize: "14px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Delete from Project
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProjectTree({
  files,
  projectPath,
  activeFileName,
  openFileNames,
  dirtyFileNames,
  topLevelFileName,
  draggedFileName,
  dragOverFileName,
  onOpenFile,
  onCloseFile,
  onDragStartFile,
  onDragOverFile,
  onDropFile,
  onSetTopLevelFile,
  onOpenContextMenu,
}: {
  files: ProjectFile[];
  projectPath?: string;
  activeFileName: string | null;
  openFileNames: string[];
  dirtyFileNames: string[];
  topLevelFileName: string | null;
  draggedFileName: string | null;
  dragOverFileName: string | null;
  onOpenFile: (fileName: string) => void;
  onCloseFile: (fileName: string) => void;
  onDragStartFile: (fileName: string | null) => void;
  onDragOverFile: (fileName: string | null) => void;
  onDropFile: (sourceFileName: string, targetFileName: string) => void;
  onSetTopLevelFile: (fileName: string | null) => void;
  onOpenContextMenu: (fileName: string, x: number, y: number) => void;
}) {
  const nodes = buildProjectTree(files, projectPath, topLevelFileName);

  return (
    <div style={{ display: "grid", gap: "2px" }}>
      {nodes.map((node) => (
        <ProjectTreeNode
          key={node.path}
          node={node}
          depth={0}
          activeFileName={activeFileName}
          openFileNames={openFileNames}
          dirtyFileNames={dirtyFileNames}
          topLevelFileName={topLevelFileName}
          draggedFileName={draggedFileName}
          dragOverFileName={dragOverFileName}
          onOpenFile={onOpenFile}
          onCloseFile={onCloseFile}
          onDragStartFile={onDragStartFile}
          onDragOverFile={onDragOverFile}
          onDropFile={onDropFile}
          onSetTopLevelFile={onSetTopLevelFile}
          onOpenContextMenu={onOpenContextMenu}
        />
      ))}
    </div>
  );
}

function ProjectTreeNode({
  node,
  depth,
  activeFileName,
  openFileNames,
  dirtyFileNames,
  topLevelFileName,
  draggedFileName,
  dragOverFileName,
  onOpenFile,
  onCloseFile,
  onDragStartFile,
  onDragOverFile,
  onDropFile,
  onSetTopLevelFile,
  onOpenContextMenu,
}: {
  node: TreeNode;
  depth: number;
  activeFileName: string | null;
  openFileNames: string[];
  dirtyFileNames: string[];
  topLevelFileName: string | null;
  draggedFileName: string | null;
  dragOverFileName: string | null;
  onOpenFile: (fileName: string) => void;
  onCloseFile: (fileName: string) => void;
  onDragStartFile: (fileName: string | null) => void;
  onDragOverFile: (fileName: string | null) => void;
  onDropFile: (sourceFileName: string, targetFileName: string) => void;
  onSetTopLevelFile: (fileName: string | null) => void;
  onOpenContextMenu: (fileName: string, x: number, y: number) => void;
}) {
  if (node.type === "directory") {
    return (
      <div>
        <div
          style={{
            padding: `8px 10px 8px ${10 + depth * 14}px`,
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {node.name}
        </div>
        <div style={{ display: "grid", gap: "2px" }}>
          {node.children.map((child) => (
            <ProjectTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFileName={activeFileName}
              openFileNames={openFileNames}
              dirtyFileNames={dirtyFileNames}
              topLevelFileName={topLevelFileName}
              draggedFileName={draggedFileName}
              dragOverFileName={dragOverFileName}
              onOpenFile={onOpenFile}
              onCloseFile={onCloseFile}
              onDragStartFile={onDragStartFile}
              onDragOverFile={onDragOverFile}
              onDropFile={onDropFile}
              onSetTopLevelFile={onSetTopLevelFile}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </div>
      </div>
    );
  }

  const isActive = node.name === activeFileName;
  const isOpen = openFileNames.includes(node.name);
  const isDirty = dirtyFileNames.includes(node.name);
  const isTopLevel = node.name === topLevelFileName;
  const isDragged = node.name === draggedFileName;
  const isDragTarget = node.name === dragOverFileName && node.name !== draggedFileName;

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        "project-tree-file",
        isActive ? "active" : "",
        isDragTarget ? "drag-target" : "",
      ].filter(Boolean).join(" ")}
      draggable
      onClick={() => onOpenFile(node.name)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenFile(node.name);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenContextMenu(node.name, event.clientX, event.clientY);
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", node.name);
        onDragStartFile(node.name);
      }}
      onDragEnd={() => {
        onDragStartFile(null);
        onDragOverFile(null);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOverFile(node.name);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if (dragOverFileName === node.name) {
          onDragOverFile(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceFileName =
          event.dataTransfer.getData("text/plain") || draggedFileName || null;
        if (sourceFileName) {
          onDropFile(sourceFileName, node.name);
        }
      }}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: `9px 10px 9px ${10 + depth * 14}px`,
        borderRadius: "12px",
        border: isDragTarget ? "1px solid #93c5fd" : "1px solid transparent",
        background: isDragTarget
          ? "#eff6ff"
          : isActive
            ? "#eef2ff"
            : "transparent",
        color: isActive ? "#2563eb" : "#475569",
        opacity: isDragged ? 0.72 : 1,
        cursor: "pointer",
      }}
    >
      <span
        className="project-tree-open-indicator"
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "3px",
          border: `1.5px solid ${isOpen ? "#2563eb" : "#94a3b8"}`,
          background: isOpen ? "#2563eb" : "transparent",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textAlign: "left",
          fontWeight: isActive ? 800 : 700,
          fontSize: "13px",
        }}
      >
        {node.name}
      </span>

      {isDirty ? (
        <span
          className="project-tree-dirty-indicator"
          title="Unsaved changes"
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "999px",
            background: "#2563eb",
            flexShrink: 0,
          }}
        />
      ) : null}

      {isTopLevel ? (
        <span
          className="project-tree-top-badge"
          style={{
            padding: "2px 6px",
            borderRadius: "999px",
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            color: "#2563eb",
            fontSize: "10px",
            fontWeight: 900,
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          TOP
        </span>
      ) : null}

      {isOpen ? (
        <button
          type="button"
          className="project-tree-close"
          aria-label={`Close ${node.name}`}
          title={`Close ${node.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onCloseFile(node.name);
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

type TreeNode =
  | { type: "directory"; name: string; path: string; order: number; children: TreeNode[] }
  | { type: "file"; name: string; path: string; order: number; isTopLevel: boolean };

function buildProjectTree(
  files: ProjectFile[],
  projectPath: string | undefined,
  topLevelFileName: string | null
) {
  const root: TreeNode[] = [];

  files.forEach((file, fileIndex) => {
    const relativePath = getRelativeProjectPath(file, projectPath);
    const parts = relativePath.split("/").filter(Boolean);
    let currentLevel = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;

      if (isLeaf) {
        currentLevel.push({
          type: "file",
          name: file.name,
          path: currentPath,
          order: fileIndex,
          isTopLevel: file.name === topLevelFileName,
        });
        return;
      }

      let directory = currentLevel.find(
        (node): node is Extract<TreeNode, { type: "directory" }> =>
          node.type === "directory" && node.name === part
      );

      if (!directory) {
        directory = {
          type: "directory",
          name: part,
          path: currentPath,
          order: fileIndex,
          children: [],
        };
        currentLevel.push(directory);
      }

      currentLevel = directory.children;
    });
  });

  return sortTreeNodes(root);
}

function getRelativeProjectPath(file: ProjectFile, projectPath?: string) {
  if (file.path && projectPath && file.path.startsWith(projectPath)) {
    return file.path
      .slice(projectPath.length)
      .replace(/^[/\\]+/, "")
      .replace(/\\/g, "/");
  }

  return file.name;
}

function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes]
    .sort(compareTreeNodes)
    .map((node) =>
      node.type === "directory"
        ? { ...node, children: sortTreeNodes(node.children) }
        : node
    );
}

function compareTreeNodes(first: TreeNode, second: TreeNode) {
  const firstPriority = getTreeNodePriority(first);
  const secondPriority = getTreeNodePriority(second);

  if (firstPriority !== secondPriority) {
    return firstPriority - secondPriority;
  }

  if (first.type !== second.type) {
    return first.type === "directory" ? -1 : 1;
  }

  return first.order - second.order;
}

function getTreeNodePriority(node: TreeNode) {
  if (node.type === "file" && node.isTopLevel) {
    return -2;
  }

  if (node.type === "directory" && node.name.toLowerCase() === "src") {
    return -1;
  }

  return 0;
}

function moveFileToTop(files: ProjectFile[], fileName: string) {
  const fileIndex = files.findIndex((file) => file.name === fileName);
  if (fileIndex <= 0) return files;

  const nextFiles = [...files];
  const [topLevelFile] = nextFiles.splice(fileIndex, 1);
  return [topLevelFile, ...nextFiles];
}

function getSaveStatusLabel(status: SaveStatus, lastSavedAt: string) {
  if (status === "saving") return "Saving...";
  if (status === "unsaved") return "Unsaved changes";
  if (status === "error") return "Save failed";
  return lastSavedAt ? "Saved" : "Not saved";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "The project could not be saved.";
}

function isHdlFile(fileName: string) {
  return (
    fileName.endsWith(".v") ||
    fileName.endsWith(".sv") ||
    fileName.endsWith(".vhd") ||
    fileName.endsWith(".vhdl")
  );
}

function SettingsModal({
  settings,
  onChange,
  onClose,
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}) {
  function updateSetting<Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key]
  ) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="variant-modal"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "640px" }}
      >
        <div className="variant-modal-header">
          <h2>Settings</h2>
          <button onClick={onClose}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <SettingSelect label="Theme" value={settings.theme} onChange={(value) => updateSetting("theme", value as AppSettings["theme"])} options={["light", "ice", "solar", "aero", "dark", "black-ice"]} />
          <SettingSelect label="Default HDL" value={settings.defaultLanguage} onChange={(value) => updateSetting("defaultLanguage", value as AppSettings["defaultLanguage"])} options={["Verilog", "SystemVerilog", "VHDL"]} />
          <SettingSelect label="Project Name" value={settings.defaultProjectNamePattern} onChange={(value) => updateSetting("defaultProjectNamePattern", value as AppSettings["defaultProjectNamePattern"])} options={["my_fpga_project", "{board}_project"]} />
          <SettingSelect label="Auto-save Interval" value={settings.autoSaveInterval} onChange={(value) => updateSetting("autoSaveInterval", value as AppSettings["autoSaveInterval"])} options={["immediate", "5s", "30s"]} />
          <SettingNumber label="Editor Font Size" value={settings.editorFontSize} min={11} max={24} onChange={(value) => updateSetting("editorFontSize", value)} />
          <SettingNumber label="Editor Tab Size" value={settings.editorTabSize} min={2} max={8} onChange={(value) => updateSetting("editorTabSize", value)} />
          <SettingSelect label="Pin Mapping Mode" value={settings.defaultPinMappingMode} onChange={(value) => updateSetting("defaultPinMappingMode", value as AppSettings["defaultPinMappingMode"])} options={["simple", "advanced"]} />
          <SettingNumber label="Recent Projects Limit" value={settings.recentProjectsLimit} min={1} max={12} onChange={(value) => updateSetting("recentProjectsLimit", value)} />
          <SettingToggle label="Auto-save" checked={settings.autoSave} onChange={(value) => updateSetting("autoSave", value)} />
          <SettingToggle label="Editor Word Wrap" checked={settings.editorWordWrap} onChange={(value) => updateSetting("editorWordWrap", value)} />
          <SettingToggle label="Confirm Delete" checked={settings.confirmBeforeDelete} onChange={(value) => updateSetting("confirmBeforeDelete", value)} />
        </div>
      </div>
    </div>
  );
}

function SettingSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="setting-field">
      {label}
      <select className="setting-control" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{formatSettingOption(option)}</option>
        ))}
      </select>
    </label>
  );
}

function SettingNumber({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting-field">
      {label}
      <input className="setting-control" type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="setting-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function formatSettingOption(option: string) {
  if (option === "light") return "Light";
  if (option === "ice") return "Ice";
  if (option === "solar") return "Solar";
  if (option === "aero") return "Aero";
  if (option === "dark") return "Dark";
  if (option === "black-ice") return "Black Ice";
  if (option === "immediate") return "Immediate";
  if (option === "simple") return "Simple";
  if (option === "advanced") return "Advanced";
  if (option === "board-default") return "Board Default";
  if (option === "my_fpga_project") return "my_fpga_project";
  if (option === "{board}_project") return "{board}_project";
  return option;
}
