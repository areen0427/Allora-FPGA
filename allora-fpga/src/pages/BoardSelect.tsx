import { useCallback, useMemo, useRef, useState } from "react";
import type { AppSettings } from "../data/settings";
import { getSavedProjects, removeSavedProject } from "../data/projects";
import {
  getBuildCatalogBoards,
  getPinMappingOnlyBoards,
} from "../data/boardSupport";
import type {
  BoardCatalogItem,
  VariantBoardCatalogItem,
} from "../data/boardSupport";
import { HomeView, type HomePath } from "./welcome/HomeView";
import { PinMappingBrowser } from "./welcome/PinMappingBrowser";
import { SettingsModal } from "./welcome/SettingsModal";
import { VariantSelectorModal } from "./welcome/VariantSelectorModal";
import { WelcomeShell } from "./welcome/WelcomeShell";
import type { WelcomeView } from "./welcome/WelcomeShell";
import type { ExecutionTarget } from "./dashboard/types";
import ChatPage from "./ChatPage";

type BoardSelectProps = {
  onDesignToolChange: (register: boolean) => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onSelectBoard: (boardId: string) => void;
  onOpenProject: (projectId: string, target: ExecutionTarget) => void;
  onOpenExistingProject: (target: ExecutionTarget) => Promise<void>;
  onCreateSimulationProject: () => void;
  onOpenMemoryProject: (projectId: string) => void;
  onOpenExistingMemoryProject: () => Promise<void>;
  onCreateMemoryProject: () => void;
  onCreateMemoryBoardProject: (boardId: string) => void;
  onOpenChatProject: (projectPath: string) => Promise<void>;
};

export default function BoardSelect({
  onDesignToolChange,
  settings,
  onSettingsChange,
  onSelectBoard,
  onOpenProject,
  onOpenExistingProject,
  onCreateSimulationProject,
  onOpenMemoryProject,
  onOpenExistingMemoryProject,
  onCreateMemoryProject,
  onCreateMemoryBoardProject,
  onOpenChatProject,
}: BoardSelectProps) {
  const [selectedVariantBoard, setSelectedVariantBoard] =
    useState<VariantBoardCatalogItem | null>(null);
  const [memoryBoardChoice, setMemoryBoardChoice] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<"general" | "ai">("general");
  const [savedProjects, setSavedProjects] = useState(() => getSavedProjects());
  const [showAllBoards, setShowAllBoards] = useState(false);
  const [isOpeningExistingProject, setIsOpeningExistingProject] =
    useState(false);
  const [openExistingProjectError, setOpenExistingProjectError] = useState("");
  const [activeView, setActiveView] = useState<WelcomeView>("home");
  const [homePath, setHomePath] = useState<HomePath | null>(null);
  const [showProductInfo, setShowProductInfo] = useState(false);
  const brandRef = useRef<HTMLButtonElement | null>(null);
  const closeProductInfo = useCallback(() => setShowProductInfo(false), []);
  const [homeViewKey, setHomeViewKey] = useState(0);
  const [selectedPinBoard, setSelectedPinBoard] = useState<string | null>(null);
  const newProjectRef = useRef<HTMLElement | null>(null);

  const supportedBoards = useMemo(() => getBuildCatalogBoards(), []);
  const pinMappingBoards = useMemo(() => getPinMappingOnlyBoards(), []);
  const recentProjects = savedProjects.slice(0, 5);
  const visibleBoards = showAllBoards
    ? supportedBoards
    : supportedBoards.slice(0, 8);

  function handleSelectBoard(board: BoardCatalogItem) {
    if ("variants" in board) {
      setSelectedVariantBoard(board);
      return;
    }

    onSelectBoard(board.id);
  }

  function removeRecentProject(projectId: string) {
    removeSavedProject(projectId);
    setSavedProjects(getSavedProjects());
  }

  async function handleOpenExistingProject(target: ExecutionTarget) {
    setOpenExistingProjectError("");
    setIsOpeningExistingProject(true);

    try {
      await onOpenExistingProject(target);
    } catch (error) {
      setOpenExistingProjectError(
        error instanceof Error
          ? error.message
          : "Unable to open that project folder.",
      );
    } finally {
      setIsOpeningExistingProject(false);
    }
  }

  function handleViewChange(view: WelcomeView) {
    onDesignToolChange(false);
    setActiveView(view);
    setHomePath(null);
    setShowProductInfo(false);
    if (view === "home") {
      setSelectedPinBoard(null);
      setHomeViewKey((current) => current + 1);
    }
  }

  return (
    <WelcomeShell
      activeView={activeView}
      onBack={activeView === "chat"
        ? () => { handleViewChange("home"); setHomePath("build"); }
        : activeView === "pin-mapping"
        ? () => handleViewChange("home")
        : activeView === "home" && homePath !== null
          ? () => setHomePath(null)
          : undefined}
      brandRef={brandRef}
      showProductInfo={showProductInfo}
      onOpenProductInfo={activeView === "home" && homePath === null
        ? () => setShowProductInfo((visible) => !visible)
        : undefined}
      maxWidth={activeView === "home" ? "1280px" : "1680px"}
      newProjectRef={newProjectRef}
      onViewChange={handleViewChange}
      onOpenSettings={() => { setSettingsCategory("general"); setShowSettings(true); }}
    >
      {activeView === "home" ? (
        <HomeView
          key={homeViewKey}
          path={homePath}
          onPathChange={(path) => {
            setHomePath(path);
            onDesignToolChange(path === "register-builder");
            setShowProductInfo(false);
          }}
          showProductInfo={showProductInfo}
          onCloseProductInfo={closeProductInfo}
          brandRef={brandRef}
          reduceMotion={settings.reduceMotion}
          settings={settings}
          boards={supportedBoards}
          visibleBoards={visibleBoards}
          showAllBoards={showAllBoards}
          recentProjects={recentProjects}
          isOpeningExistingProject={isOpeningExistingProject}
          openExistingProjectError={openExistingProjectError}
          newProjectRef={newProjectRef}
          onToggleShowAllBoards={setShowAllBoards}
          onSelectBoard={handleSelectBoard}
          onOpenPinMapping={() => handleViewChange("pin-mapping")}
          onOpenChat={() => handleViewChange("chat")}
          onOpenExistingProject={(target) =>
            void handleOpenExistingProject(target)
          }
          onCreateSimulationProject={onCreateSimulationProject}
          onOpenProject={onOpenProject}
          onRemoveRecentProject={removeRecentProject}
          onSettingsChange={onSettingsChange}
          onOpenMemoryProject={onOpenMemoryProject}
          onOpenExistingMemoryProject={() => {
            if (isOpeningExistingProject) return;
            setIsOpeningExistingProject(true);
            setOpenExistingProjectError("");
            void onOpenExistingMemoryProject().catch(error => setOpenExistingProjectError(error instanceof Error ? error.message : "Unable to open project.")).finally(() => setIsOpeningExistingProject(false));
          }}
          onCreateMemoryProject={onCreateMemoryProject}
          onCreateMemoryBoardProject={(board) => {
            if ("variants" in board) { setMemoryBoardChoice(true); setSelectedVariantBoard(board); }
            else onCreateMemoryBoardProject(board.id);
          }}
        />
      ) : activeView === "chat" ? (
        <ChatPage onOpenSettings={() => { setSettingsCategory("ai"); setShowSettings(true); }} onOpenProject={onOpenChatProject} />
      ) : (
        <PinMappingBrowser
          boards={pinMappingBoards}
          selectedBoardId={selectedPinBoard}
          onSelectBoard={setSelectedPinBoard}
        />
      )}

      {selectedVariantBoard ? (
        <VariantSelectorModal
          board={selectedVariantBoard}
          onClose={() => { setSelectedVariantBoard(null); setMemoryBoardChoice(false); }}
          onSelectVariant={(boardId) => {
            setSelectedVariantBoard(null);
            if (memoryBoardChoice) { setMemoryBoardChoice(false); onCreateMemoryBoardProject(boardId); }
            else onSelectBoard(boardId);
          }}
        />
      ) : null}

      {showSettings ? (
        <SettingsModal
          settings={settings}
          initialCategory={settingsCategory}
          onChange={onSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </WelcomeShell>
  );
}
