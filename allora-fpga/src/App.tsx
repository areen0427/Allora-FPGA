import { useEffect, useRef, useState } from "react";
import BoardSelect from "./pages/BoardSelect";
import ProjectSetup from "./pages/ProjectSetup";
import SimulationProjectSetup from "./pages/SimulationProjectSetup";
import Dashboard from "./pages/Dashboard";
import { getBoardById, VIRTUAL_BOARD } from "./data/boards";
import {
  createProject,
  getLastOpenedProjectId,
  getSavedProject,
  getSavedProjects,
  saveProject,
  saveLastOpenedProjectId,
} from "./data/projects";
import type { SavedProject } from "./data/projects";
import {
  getSettings,
  saveLastProjectParentDirectory,
  saveSettings,
} from "./data/settings";
import type { AppSettings } from "./data/settings";
import {
  createProjectWorkspace,
  createSimulationProjectWorkspace,
  pickExistingProjectDirectory,
  readProjectWorkspace,
} from "./lib/projectWorkspace";
import "./App.css";
import type { ExecutionTarget } from "./pages/dashboard/types";

type AppStage =
  | "board-select"
  | "project-setup"
  | "simulation-setup"
  | "dashboard";

type ProjectMetadata = {
  name?: string;
  boardId?: string;
  language?: string;
  topModule?: string;
  projectKind?: "simulation" | "hardware";
  template?: "blank" | "counter" | "pwm";
};

function App() {
  const [stage, setStage] = useState<AppStage>("board-select");
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [project, setProject] = useState<SavedProject | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  const [projectWarning, setProjectWarning] = useState("");
  const [executionTarget, setExecutionTarget] =
    useState<ExecutionTarget>("build");
  const restoredStartupRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (restoredStartupRef.current) return;
    restoredStartupRef.current = true;
    if (settings.startupView !== "last-project") return;
    const projectId = getLastOpenedProjectId();
    if (projectId) void openProject(projectId);
    // Startup restoration intentionally runs once with the persisted settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goHome() {
    setStage("board-select");
    setSelectedBoardId(null);
    setProject(null);
    setProjectWarning("");
  }

  async function openProject(projectId: string, target?: ExecutionTarget) {
    const savedProject = getSavedProject(projectId);
    if (!savedProject) return;

    let nextProject = savedProject;

    if (savedProject.projectPath) {
      try {
        // The workspace folder is the source of truth for file contents;
        // the saved record only contributes ordering and selection state.
        const diskFiles = await readProjectWorkspace(savedProject.projectPath);
        const files = orderFilesLikeSaved(diskFiles, savedProject.files);
        nextProject = {
          ...savedProject,
          files,
          activeFileName:
            savedProject.activeFileName &&
            files.some((file) => file.name === savedProject.activeFileName)
              ? savedProject.activeFileName
              : (files[0]?.name ?? null),
          topLevelFileName:
            savedProject.topLevelFileName &&
            files.some((file) => file.name === savedProject.topLevelFileName)
              ? savedProject.topLevelFileName
              : (files.find((file) => isHdlFile(file.name))?.name ?? null),
          updatedAt: new Date().toISOString(),
        };
        saveProject(nextProject);
        setProjectWarning("");
      } catch {
        nextProject = savedProject;
        setProjectWarning(
          "The project folder could not be read. File contents live on disk, so reconnect the folder to edit this project.",
        );
      }
    }

    if (!settings.restorePreviousSession) {
      nextProject = {
        ...nextProject,
        activeFileName:
          nextProject.files.find((file) => isHdlFile(file.name))?.name ??
          nextProject.files[0]?.name ??
          null,
      };
    }

    const effectiveTarget =
      target ??
      nextProject.lastExecutionTarget ??
      (nextProject.projectKind === "simulation" ? "simulate" : "build");
    nextProject = { ...nextProject, lastExecutionTarget: effectiveTarget };
    saveProject(nextProject);
    setProject(nextProject);
    saveLastOpenedProjectId(nextProject.id);
    setSelectedBoardId(nextProject.boardId);
    setExecutionTarget(effectiveTarget);
    setStage("dashboard");
  }

  async function openExistingProject(target: ExecutionTarget = "build") {
    const projectPath = await pickExistingProjectDirectory();
    if (!projectPath) return;

    const diskFiles = await readProjectWorkspace(projectPath);
    const metadataFile = diskFiles.find(
      (file) => file.name === "allora-project.json",
    );
    if (!metadataFile || metadataFile.isBinary) {
      throw new Error(
        "This folder does not look like an Allora FPGA project. Choose the top-level folder that contains allora-project.json.",
      );
    }

    let metadata: ProjectMetadata;
    try {
      metadata = JSON.parse(metadataFile.content) as ProjectMetadata;
    } catch {
      throw new Error(
        "The project metadata file could not be read. Check allora-project.json and try again.",
      );
    }

    const boardId = metadata.boardId ?? VIRTUAL_BOARD.id;
    const board = getBoardById(boardId);
    if (!board) {
      throw new Error(
        "This project references a board that is not available in this version of Allora FPGA.",
      );
    }

    const existingProject = getSavedProjects().find(
      (savedProject) => savedProject.projectPath === projectPath,
    );
    const name =
      metadata.name?.trim() ||
      folderNameFromPath(projectPath) ||
      "Untitled Project";
    const activeFileName =
      existingProject?.activeFileName &&
      diskFiles.some((file) => file.name === existingProject.activeFileName)
        ? existingProject.activeFileName
        : (findTopModuleFile(diskFiles, metadata.topModule) ??
          diskFiles.find((file) => isHdlFile(file.name))?.name ??
          diskFiles[0]?.name ??
          null);
    const topLevelFileName =
      existingProject?.topLevelFileName &&
      diskFiles.some((file) => file.name === existingProject.topLevelFileName)
        ? existingProject.topLevelFileName
        : (findTopModuleFile(diskFiles, metadata.topModule) ??
          diskFiles.find((file) => isHdlFile(file.name))?.name ??
          null);
    const now = new Date().toISOString();
    const nextProject: SavedProject = {
      id:
        existingProject?.id ?? window.crypto?.randomUUID?.() ?? `${Date.now()}`,
      name,
      boardId,
      projectKind:
        metadata.projectKind ??
        (boardId === VIRTUAL_BOARD.id ? "simulation" : "hardware"),
      starterTemplate: metadata.template,
      lastExecutionTarget: target,
      files: diskFiles,
      projectPath,
      language: metadata.language ?? existingProject?.language,
      activeFileName,
      topLevelFileName,
      createdAt: existingProject?.createdAt ?? now,
      updatedAt: now,
    };

    saveProject(nextProject);
    saveLastOpenedProjectId(nextProject.id);
    setProject(nextProject);
    setSelectedBoardId(boardId);
    setExecutionTarget(target);
    setProjectWarning("");
    setStage("dashboard");
  }

  const selectedBoard = selectedBoardId
    ? getBoardById(selectedBoardId)
    : undefined;

  if (stage === "board-select") {
    return (
      <BoardSelect
        settings={settings}
        onSettingsChange={setSettings}
        onOpenProject={openProject}
        onOpenExistingProject={openExistingProject}
        onCreateSimulationProject={() => setStage("simulation-setup")}
        onSelectBoard={(boardId) => {
          setSelectedBoardId(boardId);
          setStage("project-setup");
        }}
      />
    );
  }

  if (stage === "simulation-setup") {
    return (
      <SimulationProjectSetup
        settings={settings}
        onBack={() => setStage("board-select")}
        onCreateProject={async (
          name,
          language,
          parentDirectory,
          starterTemplate,
        ) => {
          const workspace = await createSimulationProjectWorkspace({
            projectName: name,
            language,
            parentDirectory,
            starterTemplate,
          });
          const topLevelFileName =
            workspace.files.find((file) => isHdlFile(file.name))?.name ?? null;
          const nextProject = createProject({
            id: workspace.projectId,
            name,
            boardId: VIRTUAL_BOARD.id,
            projectKind: "simulation",
            starterTemplate,
            lastExecutionTarget: "simulate",
            files: workspace.files,
            projectPath: workspace.projectPath,
            language,
            activeFileName: workspace.activeFileName,
            topLevelFileName,
          });

          if (parentDirectory) {
            saveLastProjectParentDirectory(parentDirectory);
          }
          saveLastOpenedProjectId(nextProject.id);
          setProject(nextProject);
          setSelectedBoardId(VIRTUAL_BOARD.id);
          setExecutionTarget("simulate");
          setProjectWarning("");
          setStage("dashboard");
        }}
      />
    );
  }

  if (stage === "project-setup" && selectedBoard) {
    return (
      <ProjectSetup
        board={selectedBoard}
        settings={settings}
        onBack={() => setStage("board-select")}
        onCreateProject={async (
          name,
          language,
          parentDirectory,
          templateId,
        ) => {
          const workspace = await createProjectWorkspace({
            projectName: name,
            board: selectedBoard,
            language: language as "Verilog" | "SystemVerilog" | "VHDL",
            parentDirectory,
            templateId,
          });

          const nextProject = createProject({
            id: workspace.projectId,
            name,
            boardId: selectedBoard.id,
            projectKind: "hardware",
            starterTemplate:
              templateId === "empty"
                ? "blank"
                : templateId === "counter"
                  ? "counter"
                  : templateId === "pwm-breathe"
                    ? "pwm"
                    : undefined,
            lastExecutionTarget: "build",
            files: workspace.files,
            projectPath: workspace.projectPath,
            language,
            activeFileName: workspace.activeFileName,
            topLevelFileName:
              workspace.files.find((file) => isHdlFile(file.name))?.name ??
              null,
          });

          if (parentDirectory) {
            saveLastProjectParentDirectory(parentDirectory);
          }
          saveLastOpenedProjectId(nextProject.id);

          setProject(nextProject);
          setExecutionTarget("build");
          setProjectWarning("");
          setStage("dashboard");
        }}
      />
    );
  }

  if (stage === "dashboard" && selectedBoard) {
    return (
      <Dashboard
        board={selectedBoard}
        project={project}
        settings={settings}
        projectWarning={projectWarning}
        launchTarget={executionTarget}
        onExecutionTargetChange={(target) => {
          setExecutionTarget(target);
          if (!project) return;
          const nextProject = {
            ...project,
            lastExecutionTarget: target,
            updatedAt: new Date().toISOString(),
          };
          setProject(nextProject);
          saveProject(nextProject);
        }}
        onSettingsChange={setSettings}
        onBack={() =>
          setStage(
            selectedBoard.id === VIRTUAL_BOARD.id
              ? "simulation-setup"
              : "project-setup",
          )
        }
        onHome={goHome}
      />
    );
  }

  return (
    <BoardSelect
      settings={settings}
      onSettingsChange={setSettings}
      onOpenProject={openProject}
      onOpenExistingProject={openExistingProject}
      onCreateSimulationProject={() => setStage("simulation-setup")}
      onSelectBoard={(boardId) => {
        setSelectedBoardId(boardId);
        setStage("project-setup");
      }}
    />
  );
}

export default App;

function folderNameFromPath(path: string) {
  return path.replace(/\/$/, "").split("/").pop() ?? "";
}

function isHdlFile(fileName: string) {
  return (
    fileName.endsWith(".v") ||
    fileName.endsWith(".sv") ||
    fileName.endsWith(".vhd") ||
    fileName.endsWith(".vhdl")
  );
}

function findTopModuleFile(files: SavedProject["files"], topModule?: string) {
  if (!topModule) return null;

  return (
    files.find((file) => {
      const fileBaseName = file.name.replace(/\.(sv|v|vhd|vhdl)$/i, "");
      return fileBaseName === topModule;
    })?.name ?? null
  );
}

function orderFilesLikeSaved(
  diskFiles: SavedProject["files"],
  savedFiles: SavedProject["files"],
) {
  if (savedFiles.length === 0) return diskFiles;

  const savedOrder = new Map(
    savedFiles.map((file, index) => [file.name, index]),
  );

  return [...diskFiles].sort((left, right) => {
    const leftOrder = savedOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = savedOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}
