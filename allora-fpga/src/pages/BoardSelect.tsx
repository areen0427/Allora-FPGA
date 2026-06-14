import { useMemo, useRef, useState } from "react";
import type { AppSettings } from "../data/settings";
import { getSavedProjects, removeSavedProject } from "../data/projects";
import {
  getBuildSupportedBoards,
  getPinMappingOnlyBoards,
} from "../data/boardSupport";
import type {
  BoardCatalogItem,
  VariantBoardCatalogItem,
} from "../data/boardSupport";
import { HomeView } from "./welcome/HomeView";
import { PinMappingBrowser } from "./welcome/PinMappingBrowser";
import { SettingsModal } from "./welcome/SettingsModal";
import { VariantSelectorModal } from "./welcome/VariantSelectorModal";
import { WelcomeShell } from "./welcome/WelcomeShell";
import type { WelcomeView } from "./welcome/WelcomeShell";

type BoardSelectProps = {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onSelectBoard: (boardId: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenExistingProject: () => Promise<void>;
};

export default function BoardSelect({
  settings,
  onSettingsChange,
  onSelectBoard,
  onOpenProject,
  onOpenExistingProject,
}: BoardSelectProps) {
  const [selectedVariantBoard, setSelectedVariantBoard] =
    useState<VariantBoardCatalogItem | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savedProjects, setSavedProjects] = useState(() => getSavedProjects());
  const [showAllBoards, setShowAllBoards] = useState(false);
  const [isOpeningExistingProject, setIsOpeningExistingProject] =
    useState(false);
  const [openExistingProjectError, setOpenExistingProjectError] = useState("");
  const [activeView, setActiveView] = useState<WelcomeView>("home");
  const [selectedPinBoard, setSelectedPinBoard] = useState<string | null>(null);
  const newProjectRef = useRef<HTMLElement | null>(null);

  const supportedBoards = useMemo(() => getBuildSupportedBoards(), []);
  const pinMappingBoards = useMemo(() => getPinMappingOnlyBoards(), []);
  const recentProjects = savedProjects.slice(0, settings.recentProjectsLimit);
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

  async function handleOpenExistingProject() {
    setOpenExistingProjectError("");
    setIsOpeningExistingProject(true);

    try {
      await onOpenExistingProject();
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
    setActiveView(view);
    if (view === "home") {
      setSelectedPinBoard(null);
    }
  }

  return (
    <WelcomeShell
      activeView={activeView}
      maxWidth={activeView === "home" ? "1280px" : "1680px"}
      newProjectRef={newProjectRef}
      onViewChange={handleViewChange}
      onOpenSettings={() => setShowSettings(true)}
    >
      {activeView === "home" ? (
        <HomeView
          boards={supportedBoards}
          visibleBoards={visibleBoards}
          showAllBoards={showAllBoards}
          recentProjects={recentProjects}
          isOpeningExistingProject={isOpeningExistingProject}
          openExistingProjectError={openExistingProjectError}
          newProjectRef={newProjectRef}
          onToggleShowAllBoards={setShowAllBoards}
          onSelectBoard={handleSelectBoard}
          onOpenExistingProject={() => void handleOpenExistingProject()}
          onOpenProject={onOpenProject}
          onRemoveRecentProject={removeRecentProject}
        />
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
          onClose={() => setSelectedVariantBoard(null)}
          onSelectVariant={(boardId) => {
            setSelectedVariantBoard(null);
            onSelectBoard(boardId);
          }}
        />
      ) : null}

      {showSettings ? (
        <SettingsModal
          settings={settings}
          onChange={onSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </WelcomeShell>
  );
}
