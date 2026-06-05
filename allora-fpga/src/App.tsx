import { useEffect, useState } from "react";
import BoardSelect from "./pages/BoardSelect";
import ProjectSetup from "./pages/ProjectSetup";
import Dashboard from "./pages/Dashboard";
import { getBoardById } from "./data/boards";
import { createProject, getSavedProject } from "./data/projects";
import type { SavedProject } from "./data/projects";
import { getSettings, saveSettings } from "./data/settings";
import type { AppSettings } from "./data/settings";
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

  function openProject(projectId: string) {
    const savedProject = getSavedProject(projectId);
    if (!savedProject) return;

    setProject(savedProject);
    setSelectedBoardId(savedProject.boardId);
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
        onCreateProject={(name) => {
          const nextProject = createProject({
            name,
            boardId: selectedBoard.id,
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
