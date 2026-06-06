import { useEffect, useState } from "react";
import BoardSelect from "./pages/BoardSelect";
import ProjectSetup from "./pages/ProjectSetup";
import Dashboard from "./pages/Dashboard";
import { getBoardById } from "./data/boards";
import { createProject, getSavedProject, saveProject } from "./data/projects";
import type { SavedProject } from "./data/projects";
import { getSettings, saveSettings } from "./data/settings";
import type { AppSettings } from "./data/settings";
import { createProjectWorkspace, readProjectWorkspace } from "./lib/projectWorkspace";
import "./App.css";

type AppStage = "board-select" | "project-setup" | "dashboard";

function App() {
  const [stage, setStage] = useState<AppStage>("board-select");
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [project, setProject] = useState<SavedProject | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

  function goHome() {
    setStage("board-select");
    setSelectedBoardId(null);
    setProject(null);
  }

  async function openProject(projectId: string) {
    const savedProject = getSavedProject(projectId);
    if (!savedProject) return;

    let nextProject = savedProject;

    if (savedProject.projectPath) {
      try {
        const files = await readProjectWorkspace(savedProject.projectPath);
        nextProject = {
          ...savedProject,
          files,
          activeFileName:
            savedProject.activeFileName && files.some((file) => file.name === savedProject.activeFileName)
              ? savedProject.activeFileName
              : files[0]?.name ?? null,
          updatedAt: new Date().toISOString(),
        };
        saveProject(nextProject);
      } catch {
        nextProject = savedProject;
      }
    }

    setProject(nextProject);
    setSelectedBoardId(nextProject.boardId);
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
        onSelectBoard={(boardId) => {
          setSelectedBoardId(boardId);
          setStage("project-setup");
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
        onCreateProject={async (name, language, parentDirectory) => {
          const workspace = await createProjectWorkspace({
            projectName: name,
            board: selectedBoard,
            language: language as "Verilog" | "SystemVerilog" | "VHDL",
            parentDirectory,
          });

          const nextProject = createProject({
            id: workspace.projectId,
            name,
            boardId: selectedBoard.id,
            files: workspace.files,
            projectPath: workspace.projectPath,
            language,
            activeFileName: workspace.activeFileName,
          });

          setProject(nextProject);
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
        onSettingsChange={setSettings}
        onBack={() => setStage("project-setup")}
        onHome={goHome}
      />
    );
  }

  return (
    <BoardSelect
      settings={settings}
      onSettingsChange={setSettings}
      onOpenProject={openProject}
      onSelectBoard={(boardId) => {
        setSelectedBoardId(boardId);
        setStage("project-setup");
      }}
    />
  );
}

export default App;
