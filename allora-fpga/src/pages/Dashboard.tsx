import { useState, useEffect } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { BoardDefinition } from "../data/boards";
import EditorSection from "./dashboard/EditorSection";
import BoardSection from "./dashboard/BoardSection";
import SynthesisSection from "./dashboard/SynthesisSection";
import TestbenchSection from "./dashboard/TestbenchSection";
import PinMappingSection from "./dashboard/PinMappingSection";
import BitstreamSection from "./dashboard/BitstreamSection";
import ProgrammingSection from "./dashboard/ProgrammingSection";
import SerialMonitorSection from "./dashboard/SerialMonitorSection";
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
  Cpu,
  Plus,
  Settings,
  Upload,
  Usb,
} from "lucide-react";
import { getBoardIconForBoardId } from "./boardIcons";
import type { SavedProject } from "../data/projects";
import type { AppSettings } from "../data/settings";
import {
  buildProjectFilePath,
  readProjectWorkspace,
} from "../lib/projectWorkspace";
import { useFileManagement } from "../hooks/useFileManagement";
import { useActiveFileTabs } from "../hooks/useActiveFileTabs";
import { useSaveProject } from "../hooks/useSaveProject";
import { isHdlFile, getSaveStatusLabel } from "../hooks/utils";
import { SettingsModal } from "../components/SettingsModal";

// Keeps a section's component mounted (and therefore its state — generated
// diagrams, bitstreams, testbench results, logs — alive) once it has been
// visited, hiding it with CSS instead of unmounting when another tab is active.
function KeepAliveSection({
  active,
  visited,
  children,
}: {
  active: boolean;
  visited: boolean;
  children: ReactNode;
}) {
  if (!visited) return null;
  return <div style={{ display: active ? "contents" : "none" }}>{children}</div>;
}

type DashboardProps = {
  board: BoardDefinition;
  project: SavedProject | null;
  settings: AppSettings;
  projectWarning?: string;
  onSettingsChange: (settings: AppSettings) => void;
  onBack: () => void;
  onHome: () => void;
};

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
  // Track which sections have been opened so we can keep them mounted (and
  // their generated output intact) after the user switches away.
  const [visitedSections, setVisitedSections] = useState<Set<DashboardSection>>(
    () => new Set<DashboardSection>(["editor"]),
  );
  const [sidebarWidth, setSidebarWidth] = useState(270);
  const [showSettings, setShowSettings] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    fileName: string;
    x: number;
    y: number;
  } | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);

  // Mark the active section as visited so it stays mounted from now on.
  useEffect(() => {
    setVisitedSections((prev) => {
      if (prev.has(activeSection)) return prev;
      const next = new Set(prev);
      next.add(activeSection);
      return next;
    });
  }, [activeSection]);

  // --- File management hook ---
  const fileMgmt = useFileManagement(project);

  // --- Active file / tabs hook ---
  const activeTabs = useActiveFileTabs({
    projectFiles: fileMgmt.files,
    initialActiveFileName: project?.activeFileName,
    initialTopLevelFileName: project?.topLevelFileName,
    setFiles: fileMgmt.setFiles,
  });

  // --- Save project hook ---
  const saveProject = useSaveProject({
    project,
    board,
    files: fileMgmt.files,
    activeFileName: activeTabs.activeFileName,
    topLevelFileName: activeTabs.topLevelFileName,
    autoSave: settings.autoSave,
    autoSaveInterval: settings.autoSaveInterval,
  });

  const projectName = project?.name ?? "Untitled Project";
  const projectPath = project?.projectPath;
  const BoardHomeIcon = getBoardIconForBoardId(board.id);

  // --- Coordinating functions that wire hooks together ---

  function markWorkspaceUnsaved(fileName?: string | null) {
    saveProject.markWorkspaceUnsaved(fileName);
    if (fileName) {
      activeTabs.setDirtyFileNames((current) =>
        current.includes(fileName) ? current : [...current, fileName],
      );
    }
  }

  async function reloadWorkspaceFromDisk() {
    if (!projectPath) return;

    const diskFiles = await readProjectWorkspace(projectPath);
    fileMgmt.setFiles(diskFiles);
    activeTabs.setDirtyFileNames([]);
    saveProject.setSaveStatus("saved");
    saveProject.setLastSavedAt(new Date().toISOString());
  }

  function handleOpenFile(fileName: string) {
    activeTabs.openFile(fileName);
    setActiveSection("editor");
    markWorkspaceUnsaved();
  }

  function handleCloseOpenFile(fileName: string) {
    activeTabs.closeOpenFile(fileName);
    markWorkspaceUnsaved();
  }

  function handleCreateNewFile(fileName?: string, content?: string) {
    const result = fileMgmt.createNewFile(fileName, content);
    if (!result) return;
    activeTabs.openFile(result);
    setActiveSection("editor");
    markWorkspaceUnsaved(result);
  }

  function handleUpdateActiveFile(content: string) {
    if (!activeTabs.activeFileName) {
      const fileName = fileMgmt.getUntitledFileName();
      fileMgmt.setFiles([
        {
          name: fileName,
          content,
          path: projectPath
            ? buildProjectFilePath(projectPath, fileName)
            : undefined,
        },
      ]);
      activeTabs.setActiveFileName(fileName);
      setActiveSection("editor");
      markWorkspaceUnsaved(fileName);
      return;
    }

    fileMgmt.setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.name === activeTabs.activeFileName ? { ...file, content } : file,
      ),
    );
    markWorkspaceUnsaved(activeTabs.activeFileName);
  }

  async function handleRenameFile(oldName: string, newName: string) {
    const result = await fileMgmt.renameFile(oldName, newName);
    if (!result) return;
    if ("error" in result) {
      saveProject.setSaveStatus("error");
      saveProject.setSaveErrorMessage(result.error);
      return;
    }
    activeTabs.setActiveFileName(result.newName);
    activeTabs.updateOpenFileAfterRename(result.oldName, result.newName);
    if (activeTabs.topLevelFileName === result.oldName) {
      handleMakeTopLevelFile(result.newName);
    }
    markWorkspaceUnsaved(result.newName);
  }

  async function handleDeleteFileFromProject(fileName: string) {
    const result = await fileMgmt.deleteFileFromProject(fileName);
    if (!result) return;
    if ("error" in result) {
      saveProject.setSaveStatus("error");
      saveProject.setSaveErrorMessage(result.error);
      return;
    }
    activeTabs.removeOpenFile(fileName);

    if (activeTabs.activeFileName === fileName) {
      const nextActiveFile = result.remainingFiles.find((file) =>
        activeTabs.openFileNames
          .filter((name) => name !== fileName)
          .includes(file.name),
      );
      activeTabs.setActiveFileName(nextActiveFile?.name ?? null);
    }

    if (activeTabs.topLevelFileName === fileName) {
      const nextTopLevel = result.remainingFiles.find((file) =>
        isHdlFile(file.name),
      );
      handleMakeTopLevelFile(nextTopLevel?.name ?? null);
    }
    markWorkspaceUnsaved();
  }

  function handleReorderFiles(sourceFileName: string, targetFileName: string) {
    fileMgmt.reorderFiles(sourceFileName, targetFileName);
    markWorkspaceUnsaved();
  }

  function handleMakeTopLevelFile(fileName: string | null) {
    activeTabs.makeTopLevelFile(fileName);
    fileMgmt.moveFileToTopLevel(fileName);
    markWorkspaceUnsaved();
  }

  async function handleUpdateConstraintFile(fileName: string, content: string) {
    const result = await fileMgmt.updateConstraintFile(fileName, content);
    if (result.error) {
      saveProject.setSaveStatus("error");
      saveProject.setSaveErrorMessage(result.error);
      return;
    }
    markWorkspaceUnsaved(fileName);
  }

  function handleImportFiles(event: ChangeEvent<HTMLInputElement>) {
    fileMgmt.importFiles(event);
    // Note: importFiles triggers setFiles internally; we mark unsaved via the files effect
    markWorkspaceUnsaved();
  }

  function handleSidebarDrop(sourceFileName: string, targetFileName: string) {
    if (!sourceFileName) return;
    handleReorderFiles(sourceFileName, targetFileName);
    fileMgmt.setDraggedFileName(null);
    fileMgmt.setDragOverFileName(null);
  }

  // --- Context menu close ---
  useEffect(() => {
    if (!contextMenu) return;

    function closeContextMenu() {
      setContextMenu(null);
    }

    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, [contextMenu]);

  // --- Sidebar resize ---
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
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",

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
                background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
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
          <SidebarButton
            label="Editor"
            icon={<Code2 size={16} />}
            active={activeSection === "editor"}
            onClick={() => setActiveSection("editor")}
          />
          <SidebarButton
            label="Board"
            icon={<CircuitBoard size={16} />}
            active={activeSection === "board"}
            onClick={() => setActiveSection("board")}
          />
          <SidebarButton
            label="Synthesis"
            icon={<Binary size={16} />}
            active={activeSection === "synthesis"}
            onClick={() => setActiveSection("synthesis")}
          />
          <SidebarButton
            label="Testbench"
            icon={<Waves size={16} />}
            active={activeSection === "testbench"}
            onClick={() => setActiveSection("testbench")}
          />
          <SidebarButton
            label="Pins"
            icon={<MapPinned size={16} />}
            active={activeSection === "pin-mapping"}
            onClick={() => setActiveSection("pin-mapping")}
          />
          <SidebarButton
            label="Health"
            icon={<Activity size={16} />}
            active={activeSection === "health"}
            onClick={() => setActiveSection("health")}
          />
          <SidebarButton
            label="Bitstream"
            icon={<SquareTerminal size={16} />}
            active={activeSection === "bitstream"}
            onClick={() => setActiveSection("bitstream")}
          />
          <SidebarButton
            label="Program"
            icon={<Cpu size={16} />}
            active={activeSection === "programming"}
            onClick={() => setActiveSection("programming")}
          />
          <SidebarButton
            label="Serial"
            icon={<Usb size={16} />}
            active={activeSection === "serial"}
            onClick={() => setActiveSection("serial")}
          />
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
                onClick={() => handleCreateNewFile()}
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
                  onChange={handleImportFiles}
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
              files={fileMgmt.files}
              projectPath={projectPath}
              activeFileName={activeTabs.activeFileName}
              openFileNames={activeTabs.openFileNames}
              dirtyFileNames={activeTabs.dirtyFileNames}
              topLevelFileName={activeTabs.topLevelFileName}
              draggedFileName={fileMgmt.draggedFileName}
              dragOverFileName={fileMgmt.dragOverFileName}
              onOpenFile={handleOpenFile}
              onCloseFile={handleCloseOpenFile}
              onDragStartFile={fileMgmt.setDraggedFileName}
              onDragOverFile={fileMgmt.setDragOverFileName}
              onDropFile={handleSidebarDrop}
              onSetTopLevelFile={handleMakeTopLevelFile}
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
              color: saveProject.saveStatus === "error" ? "#dc2626" : "#94a3b8",
              fontSize: "11px",
              fontWeight: 750,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={
              saveProject.saveErrorMessage ||
              getSaveStatusLabel(
                saveProject.saveStatus,
                saveProject.lastSavedAt,
              )
            }
          >
            {getSaveStatusLabel(
              saveProject.saveStatus,
              saveProject.lastSavedAt,
            )}
          </div>

          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
            {saveProject.showManualSaveButton ? (
              <button
                type="button"
                aria-label="Save now"
                title="Save now"
                disabled={
                  saveProject.saveStatus === "saving" ||
                  saveProject.saveStatus === "saved"
                }
                onClick={() => void saveProject.saveCurrentProject()}
                style={{
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  color: "#475569",
                  borderRadius: "10px",
                  width: "30px",
                  height: "30px",
                  cursor:
                    saveProject.saveStatus === "saving" ||
                    saveProject.saveStatus === "saved"
                      ? "not-allowed"
                      : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  opacity:
                    saveProject.saveStatus === "saving" ||
                    saveProject.saveStatus === "saved"
                      ? 0.56
                      : 1,
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
            openFiles={fileMgmt.files.filter((file) =>
              activeTabs.openFileNames.includes(file.name),
            )}
            projectFiles={fileMgmt.files}
            projectPath={projectPath}
            activeFileName={activeTabs.activeFileName}
            setActiveFileName={handleOpenFile}
            activeFile={activeTabs.activeFile}
            dirtyFileNames={activeTabs.dirtyFileNames}
            updateActiveFile={handleUpdateActiveFile}
            createNewFile={() => handleCreateNewFile()}
            closeOpenFile={handleCloseOpenFile}
            renameFile={handleRenameFile}
            onWorkspaceChanged={reloadWorkspaceFromDisk}
            settings={settings}
          />
        )}

        {activeSection === "board" && <BoardSection board={board} />}
        {activeSection === "health" && (
          <HealthSection
            board={board}
            files={fileMgmt.files}
            topLevelFileName={activeTabs.topLevelFileName}
          />
        )}
        <KeepAliveSection
          active={activeSection === "synthesis"}
          visited={visitedSections.has("synthesis")}
        >
          <SynthesisSection
            board={board}
            files={fileMgmt.files}
            projectName={projectName}
            topLevelFileName={activeTabs.topLevelFileName}
            onTopLevelFileNameChange={handleMakeTopLevelFile}
          />
        </KeepAliveSection>
        <KeepAliveSection
          active={activeSection === "testbench"}
          visited={visitedSections.has("testbench")}
        >
          <TestbenchSection
            board={board}
            files={fileMgmt.files}
            projectName={projectName}
            projectPath={projectPath}
            topLevelFileName={activeTabs.topLevelFileName}
            onCreateTestbench={(fileName, content) =>
              handleCreateNewFile(fileName, content)
            }
            onOpenFile={handleOpenFile}
            onAddArtifact={async ({ fileName, content, path }) => {
              const artifactPath =
                path ??
                (projectPath ? `${projectPath}/sim/${fileName}` : undefined);

              fileMgmt.setFiles((currentFiles) => {
                const existing = currentFiles.find(
                  (file) => file.name === fileName,
                );
                if (existing) {
                  return currentFiles.map((file) =>
                    file.name === fileName
                      ? { ...file, content, path: file.path ?? artifactPath }
                      : file,
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
        </KeepAliveSection>
        {activeSection === "pin-mapping" && (
          <PinMappingSection
            board={board}
            files={fileMgmt.files}
            defaultMode={settings.defaultPinMappingMode}
            topLevelFileName={activeTabs.topLevelFileName}
          />
        )}
        <KeepAliveSection
          active={activeSection === "bitstream"}
          visited={visitedSections.has("bitstream")}
        >
          <BitstreamSection
            board={board}
            files={fileMgmt.files}
            projectName={projectName}
            projectPath={projectPath}
            topLevelFileName={activeTabs.topLevelFileName}
            onUpdateConstraints={handleUpdateConstraintFile}
            onAddArtifact={async ({ fileName, content, isBinary }) => {
              const artifactPath = projectPath
                ? `${projectPath}/build/${fileName}`
                : undefined;

              fileMgmt.setFiles((currentFiles) => {
                const existing = currentFiles.find(
                  (file) => file.name === fileName,
                );
                if (existing) {
                  return currentFiles.map((file) =>
                    file.name === fileName
                      ? {
                          ...file,
                          content,
                          path: file.path ?? artifactPath,
                          isBinary,
                        }
                      : file,
                  );
                }

                return [
                  ...currentFiles,
                  { name: fileName, content, path: artifactPath, isBinary },
                ];
              });
            }}
          />
        </KeepAliveSection>
        {activeSection === "programming" && (
          <ProgrammingSection
            board={board}
            files={fileMgmt.files}
            projectName={projectName}
            projectPath={projectPath}
            topLevelFileName={activeTabs.topLevelFileName}
          />
        )}
        {activeSection === "serial" && <SerialMonitorSection board={board} />}
      </main>

      {showSettings ? (
        <SettingsModal
          settings={settings}
          onChange={onSettingsChange}
          onClose={() => setShowSettings(false)}
          projectNameLabel="Project Name"
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
              handleMakeTopLevelFile(contextMenu.fileName);
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
              cursor: isHdlFile(contextMenu.fileName)
                ? "pointer"
                : "not-allowed",
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
        <div
          className="modal-backdrop"
          onClick={() => setDeletingFileName(null)}
        >
          <div
            className="variant-modal"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "420px" }}
          >
            <div className="variant-modal-header">
              <h2>Delete File</h2>
              <button onClick={() => setDeletingFileName(null)}>×</button>
            </div>

            <div
              style={{ color: "#475569", fontSize: "14px", lineHeight: 1.6 }}
            >
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
                  await handleDeleteFileFromProject(fileName);
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
  const isDragTarget =
    node.name === dragOverFileName && node.name !== draggedFileName;

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        "project-tree-file",
        isActive ? "active" : "",
        isDragTarget ? "drag-target" : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
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
  | {
      type: "directory";
      name: string;
      path: string;
      order: number;
      children: TreeNode[];
    }
  | {
      type: "file";
      name: string;
      path: string;
      order: number;
      isTopLevel: boolean;
    };

function buildProjectTree(
  files: ProjectFile[],
  projectPath: string | undefined,
  topLevelFileName: string | null,
) {
  const root: TreeNode[] = [];

  files.forEach((file, fileIndex) => {
    const relativePath = getRelativeProjectPath(file, projectPath);
    const parts = relativePath.split("/").filter(Boolean);
    let currentLevel = root;
    let currentPath = "";

    parts.forEach((part: string, index: number) => {
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
          node.type === "directory" && node.name === part,
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
        : node,
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
