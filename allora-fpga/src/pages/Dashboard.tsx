import { useState, useEffect } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import type { BoardDefinition } from "../data/boards";
import EditorSection from "./dashboard/EditorSection";
import SynthesisSection from "./dashboard/SynthesisSection";
import TestbenchSection from "./dashboard/TestbenchSection";
import PinMappingSection from "./dashboard/PinMappingSection";
import BitstreamSection from "./dashboard/BitstreamSection";
import ProgrammingSection from "./dashboard/ProgrammingSection";
import SerialMonitorSection from "./dashboard/SerialMonitorSection";
import HealthSection from "./dashboard/HealthSection";
import VirtualFpgaSection from "./dashboard/VirtualFpgaSection";
import SidebarButton from "./dashboard/SidebarButton";
import type {
  DashboardSection,
  ExecutionTarget,
  ProjectFile,
} from "./dashboard/types";
import {
  ArrowLeft,
  Home,
  Binary,
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
  Zap,
  Hammer,
  Play,
  PanelLeftClose,
  PanelLeftOpen,
  FileCode2,
  FileJson,
  FileOutput,
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  GitFork,
} from "lucide-react";
import type { SavedProject } from "../data/projects";
import type { AppSettings } from "../data/settings";
import { buildProjectFilePath } from "../lib/projectWorkspace";
import { useFileManagement } from "../hooks/useFileManagement";
import { useActiveFileTabs } from "../hooks/useActiveFileTabs";
import { useSaveProject } from "../hooks/useSaveProject";
import { isHdlFile } from "../hooks/utils";
import { SettingsModal } from "../components/SettingsModal";
import {
  writeVirtualFpgaConfig,
  type VirtualFpgaConfig,
} from "../lib/virtualFpga";
import { GitHubPublishDialog } from "../components/GitHubPublishDialog";

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
  return (
    <div style={{ display: active ? "contents" : "none" }}>{children}</div>
  );
}

type DashboardProps = {
  board: BoardDefinition;
  project: SavedProject | null;
  settings: AppSettings;
  projectWarning?: string;
  launchTarget: ExecutionTarget;
  onSettingsChange: (settings: AppSettings) => void;
  onExecutionTargetChange: (target: ExecutionTarget) => void;
  onBack: () => void;
  onHome: () => void;
};

export default function Dashboard({
  board,
  project,
  settings,
  projectWarning,
  launchTarget,
  onSettingsChange,
  onExecutionTargetChange,
  onBack,
  onHome,
}: DashboardProps) {
  const [executionTarget, setExecutionTarget] =
    useState<ExecutionTarget>(launchTarget);
  const [activeSection, setActiveSection] = useState<DashboardSection>(
    launchTarget === "simulate" ? "virtual-fpga" : "editor",
  );
  // Track which sections have been opened so we can keep them mounted (and
  // their generated output intact) after the user switches away.
  const [visitedSections, setVisitedSections] = useState<Set<DashboardSection>>(
    () => new Set<DashboardSection>(["editor"]),
  );
  const [sidebarWidth, setSidebarWidth] = useState(368);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGitHubPublish, setShowGitHubPublish] = useState(false);
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

  useEffect(() => {
    setExecutionTarget(launchTarget);
    setActiveSection(launchTarget === "simulate" ? "virtual-fpga" : "editor");
  }, [launchTarget]);

  function changeExecutionTarget(target: ExecutionTarget) {
    if (board.id === "allora-virtual" && target === "build") return;
    setExecutionTarget(target);
    setActiveSection(target === "simulate" ? "virtual-fpga" : "editor");
    onExecutionTargetChange(target);
  }

  // --- File management hook ---
  const fileMgmt = useFileManagement(project);

  // --- Active file / tabs hook ---
  const activeTabs = useActiveFileTabs({
    projectFiles: fileMgmt.files,
    initialActiveFileName: project?.activeFileName,
    initialTopLevelFileName: project?.topLevelFileName,
    setFiles: fileMgmt.setFiles,
  });
  const setDirtyFileNames = activeTabs.setDirtyFileNames;

  // --- Save project hook ---
  const saveProject = useSaveProject({
    project,
    board,
    files: fileMgmt.files,
    activeFileName: activeTabs.activeFileName,
    topLevelFileName: activeTabs.topLevelFileName,
  });

  const projectName = project?.name ?? "Untitled Project";
  const projectPath = project?.projectPath;

  useEffect(() => {
    if (saveProject.saveStatus === "saved") {
      setDirtyFileNames([]);
    }
  }, [saveProject.lastSavedAt, saveProject.saveStatus, setDirtyFileNames]);

  // --- Coordinating functions that wire hooks together ---

  function markWorkspaceUnsaved(fileName?: string | null) {
    saveProject.markWorkspaceUnsaved(fileName);
    if (fileName) {
      activeTabs.setDirtyFileNames((current) =>
        current.includes(fileName) ? current : [...current, fileName],
      );
    }
  }

  function handleOpenFile(fileName: string) {
    activeTabs.openFile(fileName);
    setActiveSection("editor");
  }

  function handleCloseOpenFile(fileName: string) {
    activeTabs.closeOpenFile(fileName);
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
      return false;
    }
    markWorkspaceUnsaved(fileName);
    return true;
  }

  function handleUpdateVirtualConfig(config: VirtualFpgaConfig) {
    const metadata = fileMgmt.files.find(
      (file) => file.name === "allora-project.json",
    );
    if (!metadata || metadata.isBinary) {
      saveProject.setSaveStatus("error");
      saveProject.setSaveErrorMessage(
        "Virtual FPGA mappings require a readable allora-project.json file.",
      );
      return;
    }
    const content = writeVirtualFpgaConfig(metadata.content, config);
    fileMgmt.setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.name === metadata.name ? { ...file, content } : file,
      ),
    );
    markWorkspaceUnsaved(metadata.name);
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
      const nextWidth = Math.min(Math.max(moveEvent.clientX - 24, 300), 480);
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
      style={
        {
          "--dashboard-sidebar-width": `${explorerCollapsed ? 64 : sidebarWidth}px`,
          height: "100vh",
          overflow: "hidden",
          background: "#f1f5f9",
          padding: "24px",
          gap: "14px",
          color: "#0f172a",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          display: "flex",
          alignItems: "stretch",
        } as CSSProperties
      }
    >
      <aside
        className={`dashboard-glass-card dashboard-sidebar${explorerCollapsed ? " explorer-collapsed" : ""}`}
        style={{
          width: explorerCollapsed ? "64px" : `${sidebarWidth}px`,
          height: "calc(100vh - 48px)",
          overflow: "hidden",
          minWidth: explorerCollapsed ? "64px" : "300px",
          maxWidth: explorerCollapsed ? "64px" : "480px",
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",

          border: "1px solid rgba(226,232,240,0.5)",

          borderRadius: "24px",

          boxShadow:
            "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px rgba(15,23,42,0.08)",

          padding: 0,
          position: "sticky",
          top: "24px",
          display: "flex",
          flexDirection: "row",
        }}
      >
        <div className="dashboard-activity-rail">
          <div className="activity-rail-top">
            <button
              type="button"
              aria-label="Go to home page"
              title="Home"
              onClick={onHome}
              className="activity-home-button"
            >
              <Home size={18} color="white" strokeWidth={2.2} />
            </button>
            {explorerCollapsed ? (
              <button
                type="button"
                className="explorer-expand-button"
                aria-label="Open explorer"
                title="Open explorer"
                onClick={() => setExplorerCollapsed(false)}
              >
                <PanelLeftOpen size={18} />
              </button>
            ) : null}
          </div>
          <nav className="activity-rail-nav" aria-label="Dashboard sections">
            <SidebarButton
              label="Editor"
              icon={<Code2 size={19} />}
              active={activeSection === "editor"}
              onClick={() => setActiveSection("editor")}
            />
            {executionTarget === "simulate" ? (
              <SidebarButton
                label="Virtual"
                icon={<Zap size={19} />}
                active={activeSection === "virtual-fpga"}
                onClick={() => setActiveSection("virtual-fpga")}
              />
            ) : null}
            <SidebarButton
              label="Testbench"
              icon={<Waves size={19} />}
              active={activeSection === "testbench"}
              onClick={() => setActiveSection("testbench")}
            />
            {executionTarget === "build" ? (
              <>
                <SidebarButton
                  label="Synthesis"
                  icon={<Binary size={19} />}
                  active={activeSection === "synthesis"}
                  onClick={() => setActiveSection("synthesis")}
                />
                <SidebarButton
                  label="Pins"
                  icon={<MapPinned size={19} />}
                  active={activeSection === "pin-mapping"}
                  onClick={() => setActiveSection("pin-mapping")}
                />
              </>
            ) : null}
            <SidebarButton
              label="Health"
              icon={<Activity size={19} />}
              active={activeSection === "health"}
              onClick={() => setActiveSection("health")}
            />
            {executionTarget === "build" ? (
              <>
                <SidebarButton
                  label="Bitstream"
                  icon={<SquareTerminal size={19} />}
                  active={activeSection === "bitstream"}
                  onClick={() => setActiveSection("bitstream")}
                />
                <SidebarButton
                  label="Program"
                  icon={<Cpu size={19} />}
                  active={activeSection === "programming"}
                  onClick={() => setActiveSection("programming")}
                />
                <SidebarButton
                  label="Serial"
                  icon={<Usb size={19} />}
                  active={activeSection === "serial"}
                  onClick={() => setActiveSection("serial")}
                />
              </>
            ) : null}
          </nav>

          <div className="activity-rail-bottom">
            <button
              type="button"
              aria-label="Settings"
              title="Settings"
              onClick={() => setShowSettings(true)}
            >
              <Settings size={18} />
            </button>
            <button
              type="button"
              aria-label="Back to project setup"
              title="Back to project setup"
              onClick={onBack}
            >
              <ArrowLeft size={18} />
            </button>
          </div>
        </div>

        {!explorerCollapsed ? (
          <div className="dashboard-explorer">
            <header className="explorer-project-header">
              <div className="explorer-project-copy">
                <strong title={projectName}>
                  {projectName || "Untitled Project"}
                </strong>
                <span>
                  {executionTarget === "simulate"
                    ? "Simulation workspace"
                    : "FPGA build workspace"}
                </span>
              </div>
              <button
                type="button"
                className="explorer-collapse-button"
                aria-label="Collapse explorer"
                title="Collapse explorer"
                onClick={() => setExplorerCollapsed(true)}
              >
                <PanelLeftClose size={17} />
              </button>
            </header>

            <div
              className="dashboard-target-switch"
              aria-label="Execution target"
            >
              <button
                type="button"
                className={
                  executionTarget === "simulate" ? "active simulate" : ""
                }
                onClick={() => changeExecutionTarget("simulate")}
              >
                <Play size={13} fill="currentColor" /> Simulate
              </button>
              <button
                type="button"
                className={executionTarget === "build" ? "active build" : ""}
                onClick={() => changeExecutionTarget("build")}
                disabled={board.id === "allora-virtual"}
                title={
                  board.id === "allora-virtual"
                    ? "Choose a physical board before opening the Build workspace."
                    : "Open the physical FPGA build workspace"
                }
              >
                <Hammer size={13} />{" "}
                {board.id === "allora-virtual" ? "Build unavailable" : "Build"}
              </button>
            </div>

            <button
              type="button"
              className="explorer-github-publish"
              onClick={() => setShowGitHubPublish(true)}
            >
              <GitFork size={16} />
              <span>
                <strong>Publish to GitHub</strong>
                <small>Commit, connect, and push</small>
              </span>
              <ChevronRight size={15} />
            </button>

            <section className="project-explorer-panel">
              <div className="project-explorer-heading">
                <div>
                  <span className="project-explorer-eyebrow">Explorer</span>
                  <strong>Project files</strong>
                </div>
                <div className="project-explorer-actions">
                  <button
                    type="button"
                    title="New file"
                    aria-label="New file"
                    onClick={() => handleCreateNewFile()}
                  >
                    <Plus size={14} />
                  </button>

                  <label
                    className="project-file-import"
                    title="Import files"
                    aria-label="Import files"
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
              <div className="project-tree-scroll">
                <ProjectTree
                  files={
                    settings.showGeneratedArtifacts
                      ? fileMgmt.files
                      : fileMgmt.files.filter(
                          (file) => !isGeneratedArtifact(file),
                        )
                  }
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
                  onOpenGitHub={() => setShowGitHubPublish(true)}
                  onOpenContextMenu={(fileName, x, y) =>
                    setContextMenu({ fileName, x, y })
                  }
                />
              </div>
              {saveProject.saveStatus === "error" ? (
                <div
                  className="explorer-save-error"
                  title={saveProject.saveErrorMessage}
                >
                  Autosave failed
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {!explorerCollapsed ? (
          <div
            onMouseDown={startSidebarResize}
            className="dashboard-sidebar-resizer"
          />
        ) : null}
      </aside>

      <main
        className="dashboard-main"
        style={{
          flex: 1,
          padding: "0",
          overflowY:
            activeSection === "editor" ||
            activeSection === "pin-mapping" ||
            activeSection === "synthesis"
              ? "hidden"
              : "auto",
          height: "calc(100vh - 48px)",
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
            activeFileName={activeTabs.activeFileName}
            setActiveFileName={handleOpenFile}
            activeFile={activeTabs.activeFile}
            dirtyFileNames={activeTabs.dirtyFileNames}
            saveStatus={saveProject.saveStatus}
            lastSavedAt={saveProject.lastSavedAt}
            updateActiveFile={handleUpdateActiveFile}
            createNewFile={() => handleCreateNewFile()}
            closeOpenFile={handleCloseOpenFile}
            renameFile={handleRenameFile}
            settings={settings}
          />
        )}

        <KeepAliveSection
          active={activeSection === "virtual-fpga"}
          visited={visitedSections.has("virtual-fpga")}
        >
          <VirtualFpgaSection
            files={fileMgmt.files}
            projectPath={projectPath}
            projectId={project?.id}
            topLevelFileName={activeTabs.topLevelFileName}
            settings={settings}
            onConfigChange={handleUpdateVirtualConfig}
            guidedTemplate={project?.starterTemplate}
          />
        </KeepAliveSection>
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
            settings={settings}
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
            defaultMode="advanced"
            topLevelFileName={activeTabs.topLevelFileName}
            onSaveMappings={handleUpdateConstraintFile}
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
            onUpdateConstraints={async (fileName, content) => {
              await handleUpdateConstraintFile(fileName, content);
            }}
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

      {showGitHubPublish ? (
        <GitHubPublishDialog
          projectName={projectName}
          projectPath={projectPath}
          workspaceDirty={saveProject.saveStatus !== "saved"}
          onClose={() => setShowGitHubPublish(false)}
        />
      ) : null}

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
              const fileName = contextMenu.fileName;
              setContextMenu(null);
              if (settings.confirmBeforeDelete) {
                setDeletingFileName(fileName);
              } else {
                void handleDeleteFileFromProject(fileName);
              }
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

function isGeneratedArtifact(file: ProjectFile) {
  const normalizedPath = file.path?.replace(/\\/g, "/").toLowerCase() ?? "";
  const normalizedName = file.name.toLowerCase();
  return (
    normalizedPath.includes("/build/") ||
    normalizedPath.includes("/sim/") ||
    /\.(vcd|bin|bit|asc|json\.gz)$/.test(normalizedName)
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
  onOpenGitHub,
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
  onOpenGitHub: () => void;
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
          onOpenGitHub={onOpenGitHub}
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
  onOpenGitHub,
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
  onOpenGitHub: () => void;
  onOpenContextMenu: (fileName: string, x: number, y: number) => void;
}) {
  if (node.type === "directory") {
    return (
      <ProjectTreeDirectory
        node={node}
        depth={depth}
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
        onOpenGitHub={onOpenGitHub}
        onOpenContextMenu={onOpenContextMenu}
      />
    );
  }

  const isActive = node.name === activeFileName;
  const isOpen = openFileNames.includes(node.name);
  const isDirty = dirtyFileNames.includes(node.name);
  const isTopLevel = node.name === topLevelFileName;
  const isDragged = node.name === draggedFileName;
  const isDragTarget =
    node.name === dragOverFileName && node.name !== draggedFileName;
  const FileIcon = getProjectFileIcon(node.name);

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        "project-tree-file",
        isActive ? "active" : "",
        isOpen ? "open" : "",
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
        if (dragOverFileName === node.name) onDragOverFile(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceFileName =
          event.dataTransfer.getData("text/plain") || draggedFileName || null;
        if (sourceFileName) onDropFile(sourceFileName, node.name);
      }}
      style={{
        paddingLeft: `${10 + depth * 16}px`,
        opacity: isDragged ? 0.64 : 1,
      }}
      title={node.path}
    >
      <FileIcon
        size={15}
        className="project-tree-file-icon"
        aria-hidden="true"
      />
      <span className="project-tree-file-name">{node.name}</span>
      {isDirty ? (
        <span
          className="project-tree-dirty-indicator"
          title="Unsaved changes"
        />
      ) : null}
      {isTopLevel ? (
        <span className="project-tree-top-badge" title="Top-level module">
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

type ProjectTreeDirectoryProps = Omit<
  Parameters<typeof ProjectTreeNode>[0],
  "node"
> & {
  node: Extract<TreeNode, { type: "directory" }>;
};

function ProjectTreeDirectory({
  node,
  depth,
  onOpenGitHub,
  ...props
}: ProjectTreeDirectoryProps) {
  const generatedDirectory = ["build", "sim"].includes(node.name.toLowerCase());
  const gitDirectory = node.kind === "git-metadata";
  const [expanded, setExpanded] = useState(
    !generatedDirectory && !gitDirectory,
  );
  const fileCount = countTreeFiles(node);

  return (
    <div className="project-tree-directory">
      <button
        type="button"
        className="project-tree-folder"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        title={`${expanded ? "Collapse" : "Expand"} ${node.name}`}
      >
        <ChevronRight
          size={14}
          className="project-tree-chevron"
          aria-hidden="true"
        />
        {expanded ? (
          <FolderOpen size={16} aria-hidden="true" />
        ) : (
          <Folder size={16} aria-hidden="true" />
        )}
        <span>{node.name}</span>
        {gitDirectory ? (
          <small>Git</small>
        ) : generatedDirectory ? (
          <small>{fileCount} generated</small>
        ) : (
          <small>{fileCount}</small>
        )}
      </button>
      {expanded ? (
        <div className="project-tree-children">
          {gitDirectory ? (
            <button
              type="button"
              className="project-tree-git-action"
              style={{ paddingLeft: `${26 + depth * 16}px` }}
              onClick={onOpenGitHub}
            >
              <GitFork size={15} aria-hidden="true" />
              <span>
                <strong>Publish to GitHub</strong>
                <small>Commit, connect, and push</small>
              </span>
            </button>
          ) : (
            node.children.map((child) => (
              <ProjectTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onOpenGitHub={onOpenGitHub}
                {...props}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function countTreeFiles(node: TreeNode): number {
  if (node.type === "file") return 1;
  return node.children.reduce(
    (count, child) => count + countTreeFiles(child),
    0,
  );
}

function getProjectFileIcon(fileName: string) {
  if (/\.(v|sv|vhd|vhdl)$/i.test(fileName)) return FileCode2;
  if (/\.json$/i.test(fileName)) return FileJson;
  if (/\.(bit|bin|asc|vcd)$/i.test(fileName)) return FileOutput;
  return FileText;
}

type TreeNode =
  | {
      type: "directory";
      name: string;
      path: string;
      order: number;
      children: TreeNode[];
      kind?: "git-metadata";
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

  // Keep Git's implementation details out of the editor while still giving
  // version control a predictable home in the project explorer.
  root.push({
    type: "directory",
    name: ".git",
    path: ".git",
    order: Number.MAX_SAFE_INTEGER,
    children: [],
    kind: "git-metadata",
  });

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
  if (node.type === "directory" && node.kind === "git-metadata") {
    return 2;
  }

  if (node.type === "file" && node.isTopLevel) {
    return -2;
  }

  if (node.type === "directory" && node.name.toLowerCase() === "src") {
    return -1;
  }

  return 0;
}
