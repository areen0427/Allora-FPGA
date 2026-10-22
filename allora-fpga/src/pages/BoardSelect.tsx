import { welcomeDestination } from "./dashboard/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getLandingPageLayoutPreference,
  type AppSettings,
  type LandingPageLayoutPreference,
} from "../data/settings";
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
import { UsageDialog } from "../components/UsageDialog";
import type { DashboardSection, ExecutionTarget } from "./dashboard/types";
import { ChatSessionHost } from "../components/ChatSession";
import { useCurrentDisplayKey } from "../hooks/useCurrentDisplayKey";

const WIDE_WELCOME_VIEWPORT_QUERY = "(min-width: 1640px)";
const LARGE_WELCOME_VIEWPORT_QUERY =
  "(min-width: 1640px) and (min-height: 900px)";
const MANUAL_EXPANDED_VIEWPORT_QUERY = "(min-width: 1280px)";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const updateMatch = () => setMatches(mediaQuery.matches);
    updateMatch();
    mediaQuery.addEventListener("change", updateMatch);
    return () => mediaQuery.removeEventListener("change", updateMatch);
  }, [query]);

  return matches;
}

function useWelcomeLayoutBreakpoints(preference: LandingPageLayoutPreference) {
  const wideAuto = useMediaQuery(WIDE_WELCOME_VIEWPORT_QUERY);
  const expandedAuto = useMediaQuery(LARGE_WELCOME_VIEWPORT_QUERY);
  const expandedManual = useMediaQuery(MANUAL_EXPANDED_VIEWPORT_QUERY);

  if (preference === "compact") {
    return { wideLayout: false, expandedLayout: false };
  }

  if (preference === "expanded") {
    return {
      wideLayout: expandedManual,
      expandedLayout: expandedManual,
    };
  }

  return { wideLayout: wideAuto, expandedLayout: expandedAuto };
}

type BoardSelectProps = {
  initialView?: WelcomeView;
  chatProjectPath?: string;
  onChatOriginChange: (active: boolean) => void;
  onDesignToolChange: (section: DashboardSection | undefined) => void;
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
  onChatOriginChange,
  initialView = "home",
  chatProjectPath,
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
  const [usageAnchor, setUsageAnchor] = useState<HTMLButtonElement | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<"general" | "ai">("general");
  const [savedProjects, setSavedProjects] = useState(() => getSavedProjects());
  const [showAllBoards, setShowAllBoards] = useState(false);
  const [isOpeningExistingProject, setIsOpeningExistingProject] =
    useState(false);
  const [openExistingProjectError, setOpenExistingProjectError] = useState("");
  const [activeView, setActiveView] = useState<WelcomeView>(initialView);
  const [returnToConversation, setReturnToConversation] = useState(false);
  const [chatVisited, setChatVisited] = useState(initialView === "chat");
  const [homePath, setHomePath] = useState<HomePath | null>(null);
  const [showProductInfo, setShowProductInfo] = useState(false);
  const brandRef = useRef<HTMLButtonElement | null>(null);
  const closeProductInfo = useCallback(() => setShowProductInfo(false), []);
  const [homeViewKey, setHomeViewKey] = useState(0);
  const [selectedPinBoard, setSelectedPinBoard] = useState<string | null>(null);
  const { displayKey, resolved: displayResolved } = useCurrentDisplayKey();
  const layoutPreference = displayResolved
    ? getLandingPageLayoutPreference(settings, displayKey)
    : "auto";
  const { wideLayout, expandedLayout } =
    useWelcomeLayoutBreakpoints(layoutPreference);
  const newProjectRef = useRef<HTMLElement | null>(null);
  const buildSidebarRef = useRef<HTMLDivElement | null>(null);
  const [largeBoardLayout, setLargeBoardLayout] = useState({
    rows: 4,
    cardMinHeight: 136,
  });

  const supportedBoards = useMemo(() => getBuildCatalogBoards(), []);
  const pinMappingBoards = useMemo(() => getPinMappingOnlyBoards(), []);
  const recentProjects = savedProjects.slice(0, 5);
  useEffect(() => {
    const sidebar = buildSidebarRef.current;
    if (
      !expandedLayout ||
      activeView !== "home" ||
      homePath !== null ||
      !sidebar ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const updateLayout = (height: number) => {
      const rowGap = 14;
      const preferredCardHeight = 136;
      const rows = Math.max(
        1,
        Math.min(
          6,
          Math.round((height + rowGap) / (preferredCardHeight + rowGap)),
        ),
      );
      const availableCardHeight =
        (height - rowGap * (rows - 1)) / rows;
      const cardMinHeight = Math.max(
        96,
        Math.min(preferredCardHeight, Math.floor(availableCardHeight)),
      );

      setLargeBoardLayout((current) =>
        current.rows === rows && current.cardMinHeight === cardMinHeight
          ? current
          : { rows, cardMinHeight },
      );
    };

    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height !== undefined) updateLayout(height);
    });
    observer.observe(sidebar);
    updateLayout(sidebar.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, [activeView, homePath, expandedLayout]);

  const initialBoardCount = expandedLayout
    ? largeBoardLayout.rows * 4
    : 8;
  const visibleBoards = showAllBoards
    ? supportedBoards
    : supportedBoards.slice(0, initialBoardCount);

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
    onDesignToolChange(undefined);
    setReturnToConversation(false);
    onChatOriginChange(view === "chat");
    if (view === "chat") setChatVisited(true);
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
      wideLayout={wideLayout}
      expandedLayout={expandedLayout}
      onWorkspaceSection={(section) => {
        setReturnToConversation(true);
        onDesignToolChange(section);
        setShowProductInfo(false);
        const destination = welcomeDestination(section);
        if (destination === "pin-mapping") {
          setActiveView("pin-mapping");
        } else {
          setActiveView("home");
          setHomePath(destination);
        }
      }}
      onOpenUsage={setUsageAnchor}
      backLabel={returnToConversation ? "Back to AI Design Studio" : "Back to welcome"}
      onBack={returnToConversation
        ? () => { setActiveView("chat"); setHomePath(null); setReturnToConversation(false); onDesignToolChange(undefined); }
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
      maxWidth={activeView === "pin-mapping" ? "none" : activeView === "home" ? "1280px" : "1680px"}
      newProjectRef={newProjectRef}
      onViewChange={handleViewChange}
      onOpenSettings={() => { setSettingsCategory("general"); setShowSettings(true); }}
    >
      {chatVisited && <ChatSessionHost hidden={activeView !== "chat"} initialProjectPath={chatProjectPath} resumeLatest
        onOpenSettings={() => { setSettingsCategory("ai"); setShowSettings(true); }}
        onOpenProject={onOpenChatProject} onProjectCreated={onOpenChatProject} />}
      {activeView === "home" ? (
        <HomeView
          key={homeViewKey}
          path={homePath}
          onPathChange={(path) => {
            setHomePath(path);
            onDesignToolChange(path === "register-builder" || path === "peripheral-workbench" ? path : undefined);
            setShowProductInfo(false);
          }}
          showProductInfo={showProductInfo}
          onCloseProductInfo={closeProductInfo}
          onOpenProductInfo={() => setShowProductInfo((visible) => !visible)}
          onOpenSettings={() => { setSettingsCategory("general"); setShowSettings(true); }}
          brandRef={brandRef}
          reduceMotion={settings.reduceMotion}
          boards={supportedBoards}
          visibleBoards={visibleBoards}
          largeBoardLayout={largeBoardLayout}
          showAllBoards={showAllBoards}
          recentProjects={recentProjects}
          isOpeningExistingProject={isOpeningExistingProject}
          openExistingProjectError={openExistingProjectError}
          newProjectRef={newProjectRef}
          buildSidebarRef={buildSidebarRef}
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
        null
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

      {usageAnchor && <UsageDialog anchor={usageAnchor} onClose={() => setUsageAnchor(null)} />}

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
