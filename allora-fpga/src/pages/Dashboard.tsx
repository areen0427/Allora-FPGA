import { hasSavedProjectChat } from "../lib/chatHistory";
import { workspaceNavigationReducer, workspaceOwner } from "./dashboard/navigation";
import { listenExplorer, publishExplorer } from "../lib/explorerBridge";
import PeripheralWorkbench from "./dashboard/PeripheralWorkbench";
import MemoryAssetStudio from "./dashboard/MemoryAssetStudio";
import RegisterBuilder from "./dashboard/RegisterBuilder";
import { writeWorkbench, type Workbench } from "../lib/peripheralWorkbench";
import { useState, useEffect, useRef, useReducer, useCallback } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import type { BoardDefinition } from "../data/boards";
import EditorSection from "./dashboard/EditorSection";
import SynthesisSection from "./dashboard/SynthesisSection";
import TestbenchSection from "./dashboard/TestbenchSection";
import PinMappingSection from "./dashboard/PinMappingSection";
import BoardMigrationSection from "./dashboard/BoardMigrationSection";
import BitstreamSection from "./dashboard/BitstreamSection";
import ProgrammingSection from "./dashboard/ProgrammingSection";
import VirtualFpgaSection from "./dashboard/VirtualFpgaSection";
import { WorkspaceDock } from "./dashboard/WorkspaceDock";
import { ChatSessionHost } from "../components/ChatSession";
import type { ChatArtifact } from "../components/ChatTurnDetails";
import { queueChatArtifact, takeChatArtifact } from "../lib/chatArtifactsBridge";
import { ProjectDiagnosticsProvider, ProjectDiagnostic, TroubleshootButton } from "../components/ProjectDiagnostics";
import { projectDiagnostics, diagnosticSourceLabel } from "../lib/projectDiagnostics";
import type {
  DashboardSection,
  ProjectFile,
} from "./dashboard/types";
import {
  Plus,
  Upload,
  PanelLeftClose,
  FileCode2,
  FileJson,
  FileOutput,
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  GitFork,
  ArrowRightLeft,
} from "lucide-react";
import type { SavedProject } from "../data/projects";
import type { AppSettings } from "../data/settings";
import { buildProjectFilePath, readProjectWorkspace } from "../lib/projectWorkspace";
import { useFileManagement } from "../hooks/useFileManagement";
import { useActiveFileTabs } from "../hooks/useActiveFileTabs";
import { useSaveProject } from "../hooks/useSaveProject";
import { reconcileProjectMetadata } from "../lib/projectMetadata";
import { isHdlFile } from "../hooks/utils";
import { SettingsModal } from "../components/SettingsModal";
import { UsageDialog } from "../components/UsageDialog";
import {
  writeVirtualFpgaConfig,
  type VirtualFpgaConfig,
} from "../lib/virtualFpga";
import { GitHubPublishDialog } from "../components/GitHubPublishDialog";
import { RtlHierarchy } from "../components/RtlHierarchy";

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

function TroubleshootChatEntrance({ active, request, children }: {
  active: boolean;
  request: number;
  children: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const lastRequest = useRef(0);
  useEffect(() => {
    if (!active || request === 0 || request === lastRequest.current) return;
    lastRequest.current = request;
    if (document.documentElement.dataset.reduceMotion === "true"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = surface.current?.animate?.([
      { opacity: 0, transform: "translateY(12px) scale(.99)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ], { duration: 420, easing: "cubic-bezier(0.22, 0.72, 0.18, 1)" });
    return () => animation?.cancel();
  }, [active, request]);
  return <div ref={surface} className="dashboard-chat-surface">{children}</div>;
}

type DashboardProps = {
  board: BoardDefinition;
  project: SavedProject | null;
  settings: AppSettings;
  projectWarning?: string;
  initialSection?: DashboardSection;
  onSettingsChange: (settings: AppSettings) => void;
  onBack: () => void;
  onHome: () => void;
  onOpenChatProject: (path: string) => Promise<void>;
  onRefreshChatProject: (path: string, files: ProjectFile[]) => void;
  onOpenMigrationProject: (path: string, section: DashboardSection) => Promise<void>;
};

const DEFAULT_SIDEBAR_WIDTH = 368;

export default function Dashboard({
  board,
  project,
  settings,
  projectWarning,
  initialSection,
  onSettingsChange,
  onBack,
  onHome,
  onOpenChatProject,
  onRefreshChatProject,
  onOpenMigrationProject,
}: DashboardProps) {
  const [navigation, dispatchNavigation] = useReducer(workspaceNavigationReducer, null, () => ({
    current: initialSection ?? (hasSavedProjectChat(project?.projectPath) ? "chat" : "editor"),
    history: [],
  }));
  const activeSection = navigation.current;
  const setActiveSection = useCallback((section: DashboardSection) => {
    dispatchNavigation({ type: "visit", section });
  }, []);
  const activeWorkspaceSection = workspaceOwner(activeSection);
  // Track which sections have been opened so we can keep them mounted (and
  // their generated output intact) after the user switches away.
  const [visitedSections, setVisitedSections] = useState<Set<DashboardSection>>(
    () => new Set<DashboardSection>(["editor"]),
  );
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [troubleshootChatRequest, setTroubleshootChatRequest] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [usageAnchor, setUsageAnchor] = useState<HTMLButtonElement | null>(
    null,
  );
  const [showGitHubPublish, setShowGitHubPublish] = useState(false);
  const [explorerView, setExplorerView] = useState<"files" | "hierarchy">(
    "files",
  );
  const [editorNavigation, setEditorNavigation] = useState<{
    fileName: string;
    line: number;
    endLine?: number;
    column?: number;
    endColumn?: number;
    id: number;
  } | null>(null);
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
    if (initialSection) setActiveSection(initialSection);
  }, [initialSection, setActiveSection]);

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
  const dirtyFilesRef = useRef(activeTabs.dirtyFileNames);
  useEffect(() => { dirtyFilesRef.current = activeTabs.dirtyFileNames; }, [activeTabs.dirtyFileNames]);

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
  const diagnosticsProjectKey = projectPath ?? `project:${project?.id ?? projectName}`;
  const [requestedChatWaveform, setRequestedChatWaveform] = useState<{ path: string; id: number }>();

  async function reloadChatFiles(path: string) {
    if (path !== projectPath) return;
    const diskFiles = await readProjectWorkspace(path);
    const mergedFiles = [
      ...diskFiles.map(file => dirtyFilesRef.current.includes(file.name) ? fileMgmt.files.find(item => item.name === file.name) ?? file : file),
      ...fileMgmt.files.filter(file => dirtyFilesRef.current.includes(file.name) && !diskFiles.some(item => item.name === file.name)),
    ];
    fileMgmt.setFiles(mergedFiles);
    if (project) {
      const refreshed = reconcileProjectMetadata(project, diskFiles);
      if (refreshed.topLevelFileName !== project.topLevelFileName) {
        activeTabs.makeTopLevelFile(refreshed.topLevelFileName ?? null);
      }
    }
    onRefreshChatProject(path, mergedFiles);
    return diskFiles;
  }

  async function openChatArtifact(artifact: ChatArtifact) {
    if (artifact.projectPath && artifact.projectPath !== projectPath) {
      queueChatArtifact(artifact);
      await onOpenChatProject(artifact.projectPath);
      return;
    }
    if (artifact.kind === "file" && !artifact.path) {
      setActiveSection("editor");
      return;
    }
    const loadedFiles = projectPath ? await reloadChatFiles(projectPath) : fileMgmt.files;
    const sections: Record<ChatArtifact["kind"], DashboardSection> = { waveform: "testbench", synthesis: "synthesis", timing: "health", bitstream: "bitstream", file: "editor" };
    if (artifact.kind === "file" && artifact.path) {
      const target = loadedFiles?.find(file => file.path === artifact.path || artifact.path?.endsWith(`/${file.name}`));
      if (target) activeTabs.openFile(target.name);
      else throw new Error("The saved report is no longer available in this project.");
    }
    if (artifact.kind === "waveform" && artifact.path) setRequestedChatWaveform(current => ({ path: artifact.path!, id: (current?.id ?? 0) + 1 }));
    setActiveSection(sections[artifact.kind]);
  }

  useEffect(() => {
    if (!projectPath) return;
    const artifact = takeChatArtifact(projectPath);
    if (artifact) void openChatArtifact(artifact).catch(error => saveProject.setSaveErrorMessage(String(error)));
    // A queued card belongs to a single project-open transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

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

  function handleOpenDefinition(fileName: string, line: number) {
    setEditorNavigation((current) => ({
      fileName,
      line,
      id: (current?.id ?? 0) + 1,
    }));
    handleOpenFile(fileName);
  }

  useEffect(() => listenExplorer(message => {
    if (message.type !== "rtl-navigate" || message.projectKey !== (projectPath ?? projectName)) return;
    const file = fileMgmt.files.find(file => file.name === message.fileName);
    if (!file || file.content !== message.content) {
      void publishExplorer({ type: "navigation-result", projectKey: message.projectKey, message: "Source changed since synthesis. Re-run synthesis before editor navigation." });
      return;
    }
    setEditorNavigation(current => ({ fileName: file.name, line: message.start, endLine: message.end, column: message.startColumn, endColumn: message.endColumn, id: (current?.id ?? 0) + 1 }));
    activeTabs.openFile(file.name);
    setActiveSection("editor");
    void publishExplorer({ type: "navigation-result", projectKey: message.projectKey, message: `Opened ${file.name}:${message.start} in the editor.` });
  }), [projectPath, projectName, fileMgmt.files, activeTabs, setActiveSection]);

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
    if (oldName.startsWith("Register_Map/")) return;
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
    if (fileName.startsWith("Register_Map/")) {
      saveProject.setSaveStatus("error");
      saveProject.setSaveErrorMessage("Register Builder owns this file. Edit the map and regenerate from Register Builder.");
      return;
    }
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

  function handleUpdateWorkbench(config: Workbench) {
    const metadata = fileMgmt.files.find(file => file.name === "allora-project.json");
    try {
      if (!metadata || metadata.isBinary) throw new Error("Peripheral Workbench requires readable project metadata.");
      const content = writeWorkbench(metadata.content, config);
      fileMgmt.setFiles(current => current.map(file => file.name === metadata.name ? { ...file, content } : file));
      markWorkspaceUnsaved(metadata.name);
    } catch (error) {
      saveProject.setSaveStatus("error");
      saveProject.setSaveErrorMessage(String(error));
    }
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
    if (event.detail > 1) return;

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
    <ProjectDiagnosticsProvider projectKey={diagnosticsProjectKey} projectPath={projectPath} boardId={board.id}
      onTroubleshoot={entry => {
        projectDiagnostics.troubleshoot({ projectKey: diagnosticsProjectKey, diagnosticId: entry.id,
          prompt: `Help me troubleshoot the recent ${diagnosticSourceLabel(entry.source)} error in this project.` });
        setTroubleshootChatRequest(request => request + 1);
        setActiveSection("chat");
      }}>
    <ProjectDiagnostic source="editor" message={saveProject.saveStatus === "error" ? saveProject.saveErrorMessage || "Project save failed." : undefined} />
    <div
      className="dashboard-workspace"
      style={
        {
          "--dashboard-sidebar-width": `${explorerCollapsed ? 72 : sidebarWidth}px`,
          height: "100vh",
          overflow: "hidden",
          background: "var(--ui-page-bg)",
          padding: "12px 24px",
          gap: "14px",
          color: "var(--ui-text)",
          fontFamily:
            "var(--font-ui)",
          display: "flex",
          alignItems: "stretch",
        } as CSSProperties
      }
    >
      <div
        className={`dashboard-sidebar${explorerCollapsed ? " explorer-collapsed" : ""}`}
        style={{
          width: explorerCollapsed ? "72px" : `${sidebarWidth}px`,
          height: "calc(100vh - 24px)",
          overflow: "visible",
          gap: explorerCollapsed ? 0 : "14px",
          minWidth: explorerCollapsed ? "72px" : "300px",
          maxWidth: explorerCollapsed ? "72px" : "480px",
          padding: 0,
          position: "sticky",
          top: "12px",
          display: "flex",
          flexDirection: "row",
        }}
      >
        <WorkspaceDock
          activeSection={activeWorkspaceSection}
          explorerCollapsed={explorerCollapsed}
          saving={saveProject.saveStatus === "saving"}
          onSectionChange={setActiveSection}
          onExpandExplorer={() => setExplorerCollapsed(false)}
          onHome={async () => {
            if (saveProject.saveStatus !== "saved" && !(await saveProject.saveCurrentProject())) return;
            onHome();
          }}
          onChat={async () => {
            // Keep failed-save diagnostics reachable without discarding the dirty editor state.
            if (saveProject.saveStatus !== "saved") await saveProject.saveCurrentProject();
            setActiveSection("chat");
          }}
          backLabel={navigation.history.length ? "Back to previous workspace" : "Back to project setup"}
          onBack={async () => {
            if (saveProject.saveStatus !== "saved" && !(await saveProject.saveCurrentProject())) return;
            if (navigation.history.length) dispatchNavigation({ type: "back" });
            else onBack();
          }}
          onSettings={() => setShowSettings(true)}
          onUsage={(event) => setUsageAnchor(event.currentTarget)}
          onMigrateBoard={() => setActiveSection("board-migration")}
        />

        {!explorerCollapsed ? (
          <aside className="dashboard-glass-card dashboard-explorer" aria-label="Project explorer">
            <header className="explorer-project-header">
              <div className="explorer-project-copy">
                <strong title={projectName}>
                  {projectName || "Untitled Project"}
                </strong>
                <span title={board.name}>{board.name}</span>
              </div>
              <button
                type="button"
                className="explorer-collapse-button ui-icon-button ui-icon-button-hover ui-glass-control"
                aria-label="Collapse explorer"
                title="Collapse explorer"
                onClick={() => setExplorerCollapsed(true)}
              >
                <PanelLeftClose size={17} />
              </button>
            </header>

            <button
              type="button"
              className="explorer-project-action"
              onClick={() => setShowGitHubPublish(true)}
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
              onClick={() => setActiveSection("board-migration")}
            >
              <ArrowRightLeft size={16} />
              <span>
                <strong>Migrate Board</strong>
                <small>Move this project to another board</small>
              </span>
              <ChevronRight size={15} />
            </button>

            <section className="project-explorer-panel">
              <div className="project-explorer-heading">
                <div>
                  <span className="project-explorer-eyebrow">Explorer</span>
                  <strong>Project files</strong>
                </div>
                <div className="project-explorer-actions ui-compact-button-group">
                  <button
                    type="button"
                    className="ui-icon-button ui-icon-button-hover ui-glass-control"
                    title="New file"
                    aria-label="New file"
                    onClick={() => handleCreateNewFile()}
                  >
                    <Plus size={14} />
                  </button>

                  <label
                    className="project-file-import ui-button ui-icon-button ui-icon-button-hover ui-glass-control"
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
              <div
                className="project-explorer-view-switch ui-button-group ui-selection-group"
                role="group"
                aria-label="Explorer view"
              >
                <button
                  type="button"
                  className={explorerView === "files" ? "active" : ""}
                  aria-pressed={explorerView === "files"}
                  onClick={() => setExplorerView("files")}
                >
                  Files
                </button>
                <button
                  type="button"
                  className={explorerView === "hierarchy" ? "active" : ""}
                  aria-pressed={explorerView === "hierarchy"}
                  onClick={() => setExplorerView("hierarchy")}
                >
                  Hierarchy
                </button>
              </div>
              <div className="project-tree-scroll">
                {explorerView === "files" ? (
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
                    onOpenContextMenu={(fileName, x, y) =>
                      setContextMenu({ fileName, x, y })
                    }
                  />
                ) : (
                  <RtlHierarchy
                    files={fileMgmt.files}
                    topLevelFileName={activeTabs.topLevelFileName}
                    onOpenDefinition={handleOpenDefinition}
                  />
                )}
              </div>
              {saveProject.saveStatus === "error" ? (
                <div
                  className="explorer-save-error"
                  title={saveProject.saveErrorMessage}
                >
                  Autosave failed
                  <TroubleshootButton source="editor" />
                </div>
              ) : null}
            </section>
          </aside>
        ) : null}

        {!explorerCollapsed ? (
          <div
            onMouseDown={startSidebarResize}
            onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
            className="dashboard-sidebar-resizer"
            title="Double-click to restore default width"
          />
        ) : null}
      </div>

      <main
        className={`dashboard-main${activeWorkspaceSection === "peripheral-workbench" || activeWorkspaceSection === "register-builder" ? "" : " ui-borderless-workspace ui-workspace-dot-grid"}`}
        style={{
          flex: 1,
          padding: "0",
          overflowY:
            activeSection === "editor" ||
            activeSection === "pin-mapping" ||
            activeSection === "synthesis"
              ? "hidden"
              : "auto",
          height: "calc(100vh - 24px)",
          minHeight: 0,
        }}
      >
        {projectWarning ? (
          <div
            className="dashboard-glass-card"
            style={{
              marginBottom: "14px",
              borderRadius: "var(--ui-radius-lg)",
              padding: "12px 14px",
              color: "var(--ui-warning-text)",
              fontSize: "13px",
              fontWeight: 750,
              lineHeight: 1.45,
            }}
          >
            {projectWarning}
          </div>
        ) : null}

        <KeepAliveSection active={activeSection === "board-migration"} visited={visitedSections.has("board-migration")}>
          <BoardMigrationSection active={activeSection === "board-migration"} board={board} files={fileMgmt.files} projectPath={projectPath} topLevelFileName={activeTabs.topLevelFileName}
            onSave={saveProject.saveCurrentProject} onReload={() => projectPath ? reloadChatFiles(projectPath) : Promise.resolve()}
            onOpenCopy={async (path, section) => {
              if (!(await saveProject.saveCurrentProject())) throw new Error("Save the source project before opening its migrated copy.");
              await onOpenMigrationProject(path, section);
            }}
            onNavigate={(section, path, line) => {
              if (path) {
                const file = fileMgmt.files.find(item => item.path?.replaceAll("\\", "/").endsWith(`/${path}`) || item.name === path);
                if (file) { handleOpenFile(file.name); setEditorNavigation({ fileName: file.name, line: line ?? 1, id: Date.now() }); }
              }
              setActiveSection(section);
            }} />
        </KeepAliveSection>
        <KeepAliveSection active={activeSection === "chat"} visited={visitedSections.has("chat")}>
          <TroubleshootChatEntrance active={activeSection === "chat"} request={troubleshootChatRequest}>
          <ChatSessionHost hidden={activeSection !== "chat"} initialProjectPath={projectPath ?? undefined} diagnosticsProjectKey={diagnosticsProjectKey} resumeLatest onWorkspaceChanged={async path => { await reloadChatFiles(path); }}
            onOpenArtifact={openChatArtifact}
            onProjectCreated={onOpenChatProject} onOpenSettings={() => setShowSettings(true)} onOpenProject={onOpenChatProject} />
          </TroubleshootChatEntrance>
        </KeepAliveSection>
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
            navigation={editorNavigation}
            explorerProjectKey={projectPath ?? projectName}
          />
        )}

        <KeepAliveSection active={activeSection === "peripheral-workbench"} visited={visitedSections.has("peripheral-workbench")}>
          <PeripheralWorkbench files={fileMgmt.files} topLevelFileName={activeTabs.topLevelFileName} active={activeSection === "peripheral-workbench"} projectPath={projectPath} onChange={handleUpdateWorkbench} />
        </KeepAliveSection>
        <KeepAliveSection active={activeSection === "register-builder"} visited={visitedSections.has("register-builder")}>
          <RegisterBuilder projectPath={projectPath} files={fileMgmt.files} topLevelFileName={activeTabs.topLevelFileName} onOpenFile={handleOpenFile} onGenerated={(generated, removed) => {
            fileMgmt.setFiles(current => [...current.filter(file => !removed.includes(file.name) && !generated.some(item => item.name === file.name)), ...generated]);
          }} onActivateTop={(name, module) => {
            const metadata = fileMgmt.files.find(file => file.name === "allora-project.json");
            if (!metadata) throw new Error("Project metadata is missing. Select the generated wrapper as top level manually.");
            const parsed = JSON.parse(metadata.content);
            fileMgmt.setFiles(current => current.map(file => file.name === metadata.name ? { ...file, content: JSON.stringify({ ...parsed, topModule: module, sourceFileName: name }, null, 2) + "\n" } : file));
            handleMakeTopLevelFile(name);
          }} />
        </KeepAliveSection>
        <KeepAliveSection active={activeSection === "memory-asset-studio"} visited={visitedSections.has("memory-asset-studio")}>
          <MemoryAssetStudio projectPath={projectPath} onOpenFile={handleOpenFile} onGenerated={(generated, removed) => {
            fileMgmt.setFiles(current => [...current.filter(file => !removed.includes(file.name) && !generated.some(item => item.name === file.name)), ...generated]);
            markWorkspaceUnsaved();
          }}/>
        </KeepAliveSection>
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
        <KeepAliveSection
          active={activeSection === "synthesis"}
          visited={visitedSections.has("synthesis")}
        >
          <SynthesisSection
            board={board}
            files={fileMgmt.files}
            projectName={projectName}
            projectPath={projectPath}
            topLevelFileName={activeTabs.topLevelFileName}
            onTopLevelFileNameChange={handleMakeTopLevelFile}
          />
        </KeepAliveSection>
        <KeepAliveSection
          active={activeSection === "testbench"}
          visited={visitedSections.has("testbench")}
        >
          <TestbenchSection
            requestedWaveform={requestedChatWaveform}
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
          active={activeWorkspaceSection === "bitstream"}
          visited={visitedSections.has("bitstream") || visitedSections.has("health")}
        >
          <BitstreamSection
            initialTab="health"
            board={board}
            files={fileMgmt.files}
            projectName={projectName}
            projectPath={projectPath}
            topLevelFileName={activeTabs.topLevelFileName}
            dirtyFileNames={activeTabs.dirtyFileNames}
            onNavigate={setActiveSection}
            onUpdateConstraints={async (fileName, content) => {
              await handleUpdateConstraintFile(fileName, content);
            }}
            onAddArtifact={async ({ fileName, content, isBinary, path }) => {
              const artifactPath = path ?? (projectPath
                ? `${projectPath}/build/${fileName}`
                : undefined);

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
                          path: artifactPath ?? file.path,
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
        {activeWorkspaceSection === "programming" && (
          <ProgrammingSection
            initialTab={activeSection === "serial" ? "serial" : "program"}
            board={board}
            files={fileMgmt.files}
            projectName={projectName}
            projectPath={projectPath}
            topLevelFileName={activeTabs.topLevelFileName}
          />
        )}
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
      {usageAnchor ? (
        <UsageDialog
          anchor={usageAnchor}
          onClose={() => setUsageAnchor(null)}
        />
      ) : null}

      {contextMenu ? (
        <div
          className="dashboard-glass-card dashboard-context-menu ui-context-menu"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="ui-button ui-button-secondary ui-menu-item"
            disabled={!isHdlFile(contextMenu.fileName)}
            onClick={() => {
              if (!isHdlFile(contextMenu.fileName)) return;
              handleMakeTopLevelFile(contextMenu.fileName);
              setContextMenu(null);
            }}
          >
            Set as Top Level
          </button>
          <button
            type="button"
            className="ui-button ui-button-secondary ui-menu-item ui-menu-item-danger"
            onClick={() => {
              const fileName = contextMenu.fileName;
              setContextMenu(null);
              if (settings.confirmBeforeDelete) {
                setDeletingFileName(fileName);
              } else {
                void handleDeleteFileFromProject(fileName);
              }
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
            </div>

            <div
              style={{ color: "var(--ui-text-muted)", fontSize: "14px", lineHeight: 1.6 }}
            >
              Delete <strong>{deletingFileName}</strong> from the project?
            </div>

            <div
              className="ui-compact-button-group"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              <button
                type="button"
                className="ui-button ui-button-secondary"
                onClick={() => setDeletingFileName(null)}

              >
                Cancel
              </button>
              <button
                type="button"
                className="ui-button"
                onClick={async () => {
                  const fileName = deletingFileName;
                  setDeletingFileName(null);
                  await handleDeleteFileFromProject(fileName);
                }}

              >
                Delete from Project
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </ProjectDiagnosticsProvider>
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
    <div className="project-tree-root">
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
      <span className="project-tree-file-name">{node.name.split("/").pop()}</span>
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
  ...props
}: ProjectTreeDirectoryProps) {
  const generatedDirectory = ["build", "sim"].includes(node.name.toLowerCase());
  const [expanded, setExpanded] = useState(node.path === "src" || node.name === "Register_Map");
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
        {generatedDirectory ? (
          <small>{fileCount} generated</small>
        ) : (
          <small>{fileCount}</small>
        )}
      </button>
      {expanded ? (
        <div className="project-tree-children">
          {node.children.map((child) => (
            <ProjectTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              {...props}
            />
          ))}
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
