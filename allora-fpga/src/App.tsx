import { useState } from "react";
import BoardSelect from "./pages/BoardSelect";
import ProjectSetup from "./pages/ProjectSetup";
import Dashboard from "./pages/Dashboard";
import { getBoardById } from "./data/boards";
import "./App.css";

type AppStage = "board-select" | "project-setup" | "dashboard";

function App() {
  const [stage, setStage] = useState<AppStage>("board-select");
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [language, setLanguage] = useState("Verilog");

  const selectedBoard = selectedBoardId
  ? getBoardById(selectedBoardId)
  : undefined;

  if (stage === "board-select") {
    return (
      <BoardSelect
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
        onBack={() => setStage("board-select")}
        onCreateProject={(name, selectedLanguage) => {
          setProjectName(name);
          setLanguage(selectedLanguage);
          setStage("dashboard");
        }}
      />
    );
  }

  if (stage === "dashboard" && selectedBoard) {
    return (
      <Dashboard
        board={selectedBoard}
        projectName={projectName}
        language={language}
        onBack={() => setStage("project-setup")}
      />
    );
  }

  return (
    <BoardSelect
      onSelectBoard={(boardId) => {
        setSelectedBoardId(boardId);
        setStage("project-setup");
      }}
    />
  );
}

export default App;