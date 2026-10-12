import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FolderClock,
  FolderOpen,
  Keyboard,
  Map as MapIcon,
  Play,
  Search,
  Settings,
  Zap,
  X,
} from "lucide-react";
import { getBoardById } from "../../data/boards";
import { getFpgaById } from "../../data/fpgas";
import { formatProjectTime } from "../../data/projects";
import type { SavedProject } from "../../data/projects";
import type { BoardCatalogItem } from "../../data/boardSupport";
import { getBoardDefinitions, matchesBoardSearch } from "../../data/boardSupport";
import { getBoardCapabilities } from "../../data/boardCapabilities";
import BoardCardIcon from "../../components/BoardCardIcon";
import type { ExecutionTarget } from "../dashboard/types";
import AiDesignStudioIcon from "../../components/AiDesignStudioIcon";
import PeripheralWorkbenchIcon from "../../components/PeripheralWorkbenchIcon";
import MemoryAssetStudioIcon from "../../components/MemoryAssetStudioIcon";
import RegisterBuilderIcon from "../../components/RegisterBuilderIcon";
import alloraIcon from "../../../src-tauri/icons/128x128.png";
import { version } from "../../../package.json";

type HomeViewProps = {
  path: HomePath | null;
  onPathChange: (path: HomePath | null) => void;
  showProductInfo: boolean;
  onCloseProductInfo: () => void;
  onOpenProductInfo: () => void;
  onOpenSettings: () => void;
  brandRef: React.RefObject<HTMLButtonElement | null>;
  reduceMotion: boolean;
  boards: BoardCatalogItem[];
  visibleBoards: BoardCatalogItem[];
  showAllBoards: boolean;
  recentProjects: SavedProject[];
  isOpeningExistingProject: boolean;
  openExistingProjectError: string;
  newProjectRef: React.RefObject<HTMLElement | null>;
  onToggleShowAllBoards: (showAll: boolean) => void;
  onSelectBoard: (board: BoardCatalogItem) => void;
  onOpenPinMapping: () => void;
  onOpenChat: () => void;
  onOpenExistingProject: (target: ExecutionTarget) => void;
  onCreateSimulationProject: () => void;
  onOpenProject: (projectId: string, target: ExecutionTarget) => void;
  onRemoveRecentProject: (projectId: string) => void;
  onOpenMemoryProject: (projectId: string) => void;
  onOpenExistingMemoryProject: () => void;
  onCreateMemoryProject: () => void;
  onCreateMemoryBoardProject: (board: BoardCatalogItem) => void;
};

export type HomePath = "build" | "peripheral-workbench" | "memory-asset-studio" | "register-builder";

export function HomeView({
  path,
  onPathChange: setPath,
  showProductInfo,
  onCloseProductInfo,
  onOpenProductInfo,
  onOpenSettings,
  brandRef,
  reduceMotion,
  boards,
  visibleBoards,
  showAllBoards,
  recentProjects,
  isOpeningExistingProject,
  openExistingProjectError,
  newProjectRef,
  onToggleShowAllBoards,
  onSelectBoard,
  onOpenPinMapping,
  onOpenChat,
  onOpenExistingProject,
  onCreateSimulationProject,
  onOpenProject,
  onRemoveRecentProject,
  onOpenMemoryProject,
  onOpenExistingMemoryProject,
  onCreateMemoryProject,
  onCreateMemoryBoardProject,
}: HomeViewProps) {
  const [memoryBoardId, setMemoryBoardId] = useState(boards[0]?.id ?? "");
  const [departingPath, setDepartingPath] = useState<HomePath | null>(
    null,
  );
  const productInfoRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!showProductInfo) return;
    function dismissOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (brandRef.current?.contains(target) || productInfoRef.current?.contains(target)) return;
      onCloseProductInfo();
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseProductInfo();
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [showProductInfo, onCloseProductInfo, brandRef]);

  if (path === null) {
    return (
      <section
        className={`execution-path-stage${departingPath ? ` is-transitioning transition-${departingPath}` : ""}`}
        aria-busy={departingPath !== null}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget || !departingPath) return;
          setPath(departingPath);
          setDepartingPath(null);
        }}
      >
        <div className="welcome-environment" aria-hidden="true" />
        <div className="welcome-atmosphere" aria-hidden="true" />
        {departingPath ? (
          <div
            className={`welcome-route-pulse ${departingPath}`}
            aria-hidden="true"
          />
        ) : null}
        {showProductInfo ? (
          <section
            ref={productInfoRef}
            id="welcome-product-info"
            className={`welcome-product-info welcome-logo-info${reduceMotion ? "" : " glass-unfold"}`}
            aria-label="About Allora FPGA"
          >
            <header className="welcome-product-info-header">
              <span className="welcome-product-info-eyebrow">
                Allora FPGA
              </span>
              <strong>Product information</strong>
            </header>
            <div className="welcome-product-info-meta">
              <span>
                <small>Version</small>
                <strong>{version}</strong>
              </span>
              <a
                href="https://areen0427.github.io/Allora-FPGA/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  if (!isTauri()) return;
                  event.preventDefault();
                  void openUrl(event.currentTarget.href).catch((error) => {
                    console.error("Could not open the Allora FPGA website", error);
                  });
                }}
              >
                <BookOpen size={14} /> Website{" "}
                <ExternalLink size={11} />
              </a>
            </div>
            <div className="welcome-product-info-section">
              <h3>Projects</h3>
              <div className="welcome-product-stat-row">
                <span>
                  <strong>{recentProjects.length}</strong>
                  <small>Recent</small>
                </span>
                <span>
                  <strong>{boards.length}</strong>
                  <small>Boards</small>
                </span>
              </div>
              {recentProjects[0] ? (
                <p className="welcome-product-latest">
                  Latest: <strong>{recentProjects[0].name}</strong>
                  <small>
                    {formatProjectTime(recentProjects[0].updatedAt)}
                  </small>
                </p>
              ) : (
                <p className="welcome-product-latest">
                  No recent projects yet.
                </p>
              )}
            </div>
            <div className="welcome-product-info-section">
              <h3>
                <Keyboard size={13} /> Shortcuts
              </h3>
              <dl className="welcome-shortcut-list">
                <div>
                  <dt>Save project</dt>
                  <dd>⌘/Ctrl S</dd>
                </div>
                <div>
                  <dt>Zoom waveforms</dt>
                  <dd>⌘/Ctrl + scroll</dd>
                </div>
              </dl>
            </div>
          </section>
        ) : null}
        <div className="welcome-action-stack">
          <h1 className="welcome-title">Allora FPGA</h1>
          <ExecutionPathChooser
            selectedTarget={departingPath}
            onChoose={(target) => {
              if (reduceMotion) {
                setPath(target);
                return;
              }
              setDepartingPath(target);
            }}
            onOpenChat={onOpenChat}
          />
          <div className="welcome-bottom-row">
          {recentProjects[0] ? (
            <ContinueProjectTile
              project={recentProjects[0]}
              onOpen={(target) => onOpenProject(recentProjects[0].id, target)}
            />
          ) : null}
          <div className="welcome-utilities" aria-label="Welcome tools">
            <button type="button" className="execution-path-card welcome-utility" onClick={onOpenPinMapping}><MapIcon size={22} aria-hidden="true" /><span>Pin Mapper</span></button>
            <button type="button" className="execution-path-card welcome-utility" onClick={onOpenSettings}><Settings size={22} aria-hidden="true" /><span>Settings</span></button>
            <button ref={brandRef} type="button" className="execution-path-card welcome-utility" onClick={onOpenProductInfo} title="Product information" aria-label="Product information" aria-expanded={showProductInfo} aria-controls="welcome-product-info"><img src={alloraIcon} alt="" /></button>
          </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`welcome-destination-stage ${path}${reduceMotion ? " reduce-animation" : ""}`}
    >
      <div className="welcome-environment" aria-hidden="true" />
      <div className="welcome-atmosphere" aria-hidden="true" />
      <div className="welcome-destination-content">
        {path === "memory-asset-studio" ? (
          <div className="mas-home-layout">
            <div className="mas-home-main">
              <section className="mas-home-intro">
                <span className="mas-kicker">FPGA MEMORY WORKSPACE</span>
                <h2>Bring data into your design.</h2>
                <p>Turn images, binary data, and numeric tables into project-ready memories. Preview every conversion before generating files.</p>
                <button className="mas-primary ui-action-button" disabled={isOpeningExistingProject} onClick={onOpenExistingMemoryProject}>{isOpeningExistingProject ? "Opening…" : "Open project folder"}</button>
                <div className="mas-home-formats"><span>PNG / JPEG</span><span>Binary</span><span>CSV / TXT</span><span>HEX + Verilog</span></div>
                {openExistingProjectError && <div className="open-project-error" role="alert">{openExistingProjectError}</div>}
              </section>
              <div className="mas-launch-grid">
                <section className="mas-launch-card"><span className="mas-kicker">SIMULATE</span><h3>Start with a virtual FPGA</h3><p>Create a project to develop and test your memories without a board.</p><button onClick={onCreateMemoryProject}>Create simulation project</button></section>
                <section className="mas-launch-card"><span className="mas-kicker">BUILD</span><h3>Target a physical board</h3><p>Create a project configured for your FPGA hardware.</p><label htmlFor="memory-board">Target board</label><select id="memory-board" value={memoryBoardId} onChange={event => setMemoryBoardId(event.target.value)}>{boards.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}</select><button disabled={!memoryBoardId} onClick={() => { const board = boards.find(item => item.id === memoryBoardId); if (board) onCreateMemoryBoardProject(board); }}>Create board project</button></section>
              </div>
            </div>
            <aside className="mas-home-sidebar welcome-project-sidebar"><RecentProjectsCard projects={recentProjects} onOpenProject={onOpenMemoryProject} onRemoveProject={onRemoveRecentProject} emptyMessage="Your memory projects will appear here." /></aside>
          </div>
        ) : path === "register-builder" ? (
          <div className="mas-home-layout"><div className="mas-home-main"><section className="mas-home-intro"><span className="mas-kicker">REGISTER BUILDER</span><h2>Give your hardware a software interface.</h2><p>Define registers and bit fields, validate their layout, and generate RTL, C definitions, and an integration wrapper in your Allora project.</p><button className="mas-primary ui-action-button" disabled={isOpeningExistingProject} onClick={() => onOpenExistingProject("simulate")}>{isOpeningExistingProject ? "Opening…" : "Open project folder"}</button>{openExistingProjectError && <div role="alert">{openExistingProjectError}</div>}</section><div className="mas-launch-grid"><section className="mas-launch-card"><h3>Start a simulation project</h3><p>Design and test your register bank without a board.</p><button onClick={onCreateSimulationProject}>Create simulation project</button></section><section className="mas-launch-card"><h3>Target a physical board</h3><label>Target board<select value={memoryBoardId} onChange={event => setMemoryBoardId(event.target.value)}>{boards.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}</select></label><button disabled={!memoryBoardId} onClick={() => { const board = boards.find(item => item.id === memoryBoardId); if (board) onSelectBoard(board); }}>Create board project</button></section></div></div><aside className="mas-home-sidebar welcome-project-sidebar"><RecentProjectsCard projects={recentProjects} onOpenProject={projectId => onOpenProject(projectId, "simulate")} onRemoveProject={onRemoveRecentProject} emptyMessage="Open a project to start your register map." /></aside></div>
        ) : path === "peripheral-workbench" ? (
          <WorkbenchHome
            recentProjects={recentProjects}
            isOpening={isOpeningExistingProject}
            error={openExistingProjectError}
            onOpenExisting={() => onOpenExistingProject("simulate")}
            onCreateProject={onCreateSimulationProject}
            onOpenProject={(projectId) => onOpenProject(projectId, "simulate")}
            onRemoveProject={onRemoveRecentProject}
          />
        ) : (
          <div className="welcome-home-layout">
            <SupportedBoardGrid
              reduceMotion={reduceMotion}
              boards={boards}
              visibleBoards={visibleBoards}
              showAllBoards={showAllBoards}
              newProjectRef={newProjectRef}
              onToggleShowAllBoards={onToggleShowAllBoards}
              onSelectBoard={onSelectBoard}
            />

            <div className="welcome-home-sidebar welcome-project-sidebar">
              <section className="liquid-home-card open-project-card">
                <button type="button" className="open-project-button" onClick={onCreateSimulationProject} disabled={isOpeningExistingProject}>
                  <span className="open-project-icon"><Zap size={19} /></span>
                  <span className="open-project-copy">
                    <span className="open-project-title">New board-free project</span>
                    <span className="open-project-subtitle">Build and simulate RTL without a board.</span>
                  </span>
                </button>
              </section>
              <OpenExistingProjectCard
                isOpening={isOpeningExistingProject}
                error={openExistingProjectError}
                onOpen={() => onOpenExistingProject("build")}
              />
              <RecentProjectsCard
                projects={recentProjects}
                onOpenProject={(projectId) => onOpenProject(projectId, "build")}
                onRemoveProject={onRemoveRecentProject}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ExecutionPathChooser({
  selectedTarget,
  onChoose,
  onOpenChat,
}: {
  selectedTarget: HomePath | null;
  onChoose: (target: HomePath) => void;
  onOpenChat: () => void;
}) {
  return (
    <div className="welcome-launch-panel" aria-label="Workspace and design tools">

          <div className="execution-path-option">
            <button type="button" onClick={() => onChoose("build")} className={`execution-path-card build${selectedTarget === "build" ? " is-selected" : ""}`} disabled={selectedTarget !== null}>
              <span className="glass-edge glass-edge-top" aria-hidden="true" />
              <span className="glass-specular" aria-hidden="true" />
              <svg className="welcome-launch-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3,5.99406028 L3,18.0059397 C3,19.1054862 3.8932319,20 4.99508929,20 L19.0049107,20 C20.1073772,20 21,19.1072288 21,18.0059397 L21,5.99406028 C21,4.89451376 20.1067681,4 19.0049107,4 L4.99508929,4 C3.8926228,4 3,4.8927712 3,5.99406028 Z M1,5.99406028 C1,3.78785482 2.7884002,2 4.99508929,2 L19.0049107,2 C21.210775,2 23,3.78938161 23,5.99406028 L23,18.0059397 C23,20.2121452 21.2115998,22 19.0049107,22 L4.99508929,22 C2.78922499,22 1,20.2106184 1,18.0059397 L1,5.99406028 Z M5.26674525,11.6980752 C4.91108492,11.3097909 4.91108492,10.6902091 5.26674525,10.3019248 C5.63548778,9.89935839 6.24389719,9.89935839 6.61263972,10.3019248 L10,14 L6.61263972,17.6980752 C6.24389719,18.1006416 5.63548778,18.1006416 5.26674525,17.6980752 C4.91108492,17.3097909 4.91108492,16.6902091 5.26674525,16.3019248 L7.37526073,14 L5.26674525,11.6980752 Z M11,17 C11,16.4477153 11.4530363,16 11.9970301,16 L18.0029699,16 C18.5536144,16 19,16.4438648 19,17 C19,17.5522847 18.5469637,18 18.0029699,18 L11.9970301,18 C11.4463856,18 11,17.5561352 11,17 Z M3,6 L22,6 L22,8 L3,8 L3,6 Z" /></svg>
              <div className="execution-path-copy"><h3>Build</h3><span className="execution-path-microcopy">BUILD & SIMULATE RTL</span></div>
            </button>
          </div>


          <button type="button" className="execution-path-card welcome-tool-row" onClick={onOpenChat} disabled={selectedTarget !== null}>
            <AiDesignStudioIcon size={24} /><div className="execution-path-copy"><h3>AI Design Studio</h3><span className="execution-path-microcopy">DESIGN WITH AI</span></div>
          </button>
          <button type="button" className={`execution-path-card welcome-tool-row workbench${selectedTarget === "peripheral-workbench" ? " is-selected" : ""}`} onClick={() => onChoose("peripheral-workbench")} disabled={selectedTarget !== null}>
            <PeripheralWorkbenchIcon size={24} /><div className="execution-path-copy"><h3>Peripheral Workbench</h3><span className="execution-path-microcopy">CONFIGURE PERIPHERALS</span></div>
          </button>
          <button type="button" className={`execution-path-card welcome-tool-row${selectedTarget === "memory-asset-studio" ? " is-selected" : ""}`} onClick={() => onChoose("memory-asset-studio")} disabled={selectedTarget !== null}>
            <MemoryAssetStudioIcon size={24} /><div className="execution-path-copy"><h3>Memory Asset Studio</h3><span className="execution-path-microcopy">CREATE MEMORY ASSETS</span></div>
          </button>
          <button type="button" className="execution-path-card welcome-tool-row" onClick={() => onChoose("register-builder")} disabled={selectedTarget !== null}>
            <RegisterBuilderIcon size={24} /><div className="execution-path-copy"><h3>Register Builder</h3><span className="execution-path-microcopy">DEFINE REGISTERS</span></div>
          </button>

    </div>
  );
}

function ContinueProjectTile({
  project,
  onOpen,
}: {
  project: SavedProject;
  onOpen: (target: ExecutionTarget) => void;
}) {
  const boardName = getBoardById(project.boardId)?.name ?? project.boardId;
  const updatedAt = new Date(project.updatedAt);
  const hasValidUpdatedAt = !Number.isNaN(updatedAt.getTime());
  const updatedDate = hasValidUpdatedAt
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(updatedAt)
    : "Unknown date";
  const updatedTime = hasValidUpdatedAt
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(updatedAt)
    : "Unknown time";

  return (
    <button type="button" className="welcome-continue-project" aria-label={`Resume ${project.name}`} onClick={() => onOpen("build")}>
      <span className="welcome-continue-project-copy">
        <span>Continue project</span>
        <strong>{project.name}</strong>
        <span className="welcome-continue-project-meta">
          <small>{boardName} · {updatedDate}</small>
          <time dateTime={project.updatedAt}>{updatedTime}</time>
        </span>
      </span>
    </button>
  );
}

function WorkbenchHome({
  recentProjects,
  isOpening,
  error,
  onOpenExisting,
  onCreateProject,
  onOpenProject,
  onRemoveProject,
}: {
  recentProjects: SavedProject[];
  isOpening: boolean;
  error: string;
  onOpenExisting: () => void;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
}) {
  return (
    <div className="workbench-home-layout">
      <section className="workbench-home-intro">
        <span className="workbench-home-eyebrow">
          <Zap size={15} /> Interactive RTL workspace
        </span>
        <h2>Bring your top-level signals to life.</h2>
        <p>
          Open any Allora project, including one for a physical board. Add
          buttons, switches, LEDs, direct seven-segment displays, and a UART
          terminal, then connect them to your RTL ports.
        </p>
        <div className="workbench-home-actions ui-compact-button-group">
          <button type="button" onClick={onOpenExisting} disabled={isOpening}>
            <FolderOpen size={17} />
            {isOpening ? "Opening…" : "Open existing project"}
          </button>
          <button type="button" onClick={onCreateProject}>
            <Play size={17} /> Create simulation project
          </button>
        </div>
        {error ? <div className="open-project-error" role="alert">{error}</div> : null}
        <ol className="workbench-home-steps" aria-label="Getting started">
          <li><strong>1</strong><span>Choose a project</span></li>
          <li><strong>2</strong><span>Map devices to RTL</span></li>
          <li><strong>3</strong><span>Compile and run</span></li>
        </ol>
      </section>
      <div className="workbench-home-sidebar welcome-project-sidebar">
        <RecentProjectsCard
          projects={recentProjects}
          onOpenProject={onOpenProject}
          onRemoveProject={onRemoveProject}
          emptyMessage="Create a simulation project or open an existing project folder."
          description="Choose any project to open its Peripheral Workbench."
        />
        <p>
          Physical projects keep their selected board and pin constraints.
          Peripheral connections are saved separately in the project.
        </p>
      </div>
    </div>
  );
}

function SupportedBoardGrid({
  reduceMotion,
  boards,
  visibleBoards,
  showAllBoards,
  newProjectRef,
  onToggleShowAllBoards,
  onSelectBoard,
}: {
  reduceMotion: boolean;
  boards: BoardCatalogItem[];
  visibleBoards: BoardCatalogItem[];
  showAllBoards: boolean;
  newProjectRef: React.RefObject<HTMLElement | null>;
  onToggleShowAllBoards: (showAll: boolean) => void;
  onSelectBoard: (board: BoardCatalogItem) => void;
}) {
  const [search, setSearch] = useState("");
  const isSearching = Boolean(search.trim());
  const matchingBoards = boards.filter((board) =>
    matchesBoardSearch(board, search),
  );
  const displayedBoards = isSearching ? matchingBoards : visibleBoards;
  return (
    <section ref={newProjectRef}>
      <div className="welcome-section-header">
        <div>
          <h2>New Project</h2>
          <p>Choose an FPGA Board to create a project workspace.</p>
        </div>
      </div>

      <div className="build-board-toolbar">
        <label className="board-search-field build-board-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search build boards"
            placeholder="Search boards, vendors, or FPGA parts"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear board search"
              onClick={() => setSearch("")}
            >
              <X size={15} />
            </button>
          ) : null}
        </label>
      </div>
      <div className="supported-board-grid">
        {displayedBoards.map((board) => (
          <BoardCard
            key={board.id}
            board={board}
            reduceMotion={reduceMotion}
            onSelect={onSelectBoard}
          />
        ))}
      </div>

      {displayedBoards.length === 0 ? (
        <p className="build-board-empty">
          No boards match “{search}”. Try a board name, vendor, or FPGA part.
        </p>
      ) : null}
      {!isSearching && boards.length > 8 ? (
        <button
          type="button"
          className="board-show-more"
          onClick={() => onToggleShowAllBoards(!showAllBoards)}
        >
          {showAllBoards
            ? "Show Fewer Boards"
            : `Show all ${boards.length} Boards`}
        </button>
      ) : null}
    </section>
  );
}

function BoardCard({
  reduceMotion,
  board,
  onSelect,
}: {
  reduceMotion: boolean;
  board: BoardCatalogItem;
  onSelect: (board: BoardCatalogItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = `board-info-${board.id}`;
  const panelRef = useRef<HTMLElement>(null);
  const definitions = getBoardDefinitions(board);

  useLayoutEffect(() => {
    if (!expanded || !panelRef.current) return;
    const panel = panelRef.current;
    panel.showPopover();
    function positionPanel() {
      const card = triggerRef.current?.getBoundingClientRect();
      if (!card) return;
      const width = Math.min(definitions.length * 300 + 36, window.innerWidth - 32);
      panel.style.width = `${width}px`;
      panel.style.maxHeight = `${window.innerHeight - 32}px`;
      const height = panel.offsetHeight;
      const below = card.bottom + 8;
      const opensBelow = below + height <= window.innerHeight - 16;
      panel.dataset.placement = opensBelow ? "below" : "above";
      const top = opensBelow
        ? below
        : Math.max(16, card.top - height - 8);
      panel.style.top = `${top}px`;
      panel.style.left = `${Math.max(16, Math.min(card.left, window.innerWidth - width - 16))}px`;
    }
    positionPanel();
    if (!reduceMotion) panel.classList.add("board-info-animate");
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
      panel.classList.remove("board-info-animate");
      panel.hidePopover();
    };
  }, [expanded, definitions.length, reduceMotion]);

  useEffect(() => {
    if (!expanded) return;
    function dismissOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setExpanded(false);
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpanded(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [expanded]);

  return (
    <div className={`board-info-anchor${expanded ? " is-expanded" : ""}`} ref={containerRef}>
      <button
        ref={triggerRef}
        className="board-card welcome-board-card"
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="board-icon-badge"><BoardCardIcon /></div>
        <div className="board-card-title-row">
          <h3>{board.name}</h3>
          {"variants" in board ? (
            <span className="board-count-pill board-family-pill">{board.variants.length}</span>
          ) : null}
        </div>
        <p>{getBoardSummary(board).join(" · ")}</p>
        {definitions.some((definition) => !getBoardCapabilities(definition).bitstream.supported) ? (
          <span className="build-board-unresolved">FPGA identity needs verification</span>
        ) : null}
      </button>
      {expanded ? (
        <section ref={panelRef} popover="manual" id={panelId} className="welcome-product-info board-info-popup" aria-label={`${board.name} specifications`}>
          <header className="board-info-header">
            <strong>{board.name}</strong>
          </header>
          <div className="board-info-variants">
            {definitions.map((variant) => {
              const fpga = getFpgaById(variant.fpgaId);
              const peripherals = [...new Set(variant.pins
                .filter((pin) => pin.type !== "clock" && pin.type !== "led" && pin.type !== "button")
                .map((pin) => pin.group || pin.type.toUpperCase()))];
              return (
                <section key={variant.id} className="board-info-variant">
                  <h4>{variant.name}</h4>
                  {!getBoardCapabilities(variant).bitstream.supported ? (
                    <p>{getBoardCapabilities(variant).bitstream.detail}</p>
                  ) : null}
                  <p>{variant.device} · {variant.package}</p>
                  <dl>
                    <div><dt>LUTs / logic cells</dt><dd>{fpga?.logicCells?.toLocaleString() ?? "Unknown"}</dd></div>
                    <div><dt>Block RAM</dt><dd>{fpga?.bramKb !== undefined ? `${fpga.bramKb.toLocaleString()} Kbit` : "Unknown"}</dd></div>
                    <div><dt>DSP blocks</dt><dd>{fpga?.dsp ?? "Unknown"}</dd></div>
                    <div><dt>Board clocks</dt><dd>{variant.clocks.length ? variant.clocks.map((clock) => `${clock.name}: ${clock.frequency / 1_000_000} MHz`).join(" · ") : "Unknown"}</dd></div>
                    <div><dt>LEDs / buttons</dt><dd>{variant.leds.length} / {variant.buttons.length}</dd></div>
                    <div><dt>Peripherals / connectors</dt><dd>{peripherals.join(" · ") || "Unknown"}</dd></div>
                  </dl>
                  <button type="button" className="board-show-more board-info-select" onClick={() => onSelect(variant)}>Select {variant.name}<ChevronRight size={16} /></button>
                </section>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function OpenExistingProjectCard({
  isOpening,
  error,
  onOpen,
}: {
  isOpening: boolean;
  error: string;
  onOpen: () => void;
}) {
  return (
    <section
      className={
        isOpening
          ? "liquid-home-card open-project-card is-opening"
          : "liquid-home-card open-project-card"
      }
    >
      <button
        type="button"
        className="open-project-button"
        onClick={onOpen}
        disabled={isOpening}
      >
        <span className="open-project-icon">
          <FolderOpen size={19} />
        </span>
        <span className="open-project-copy">
          <span className="open-project-title">
            {isOpening ? "Opening Project" : "Open Existing Project"}
          </span>
          <span className="open-project-subtitle">
            Choose the project's top folder.
          </span>
        </span>
      </button>

      {error ? <div className="open-project-error">{error}</div> : null}
    </section>
  );
}

function RecentProjectsCard({
  projects,
  onOpenProject,
  onRemoveProject,
  emptyMessage,
  description,
  showSimulationSummary = false,
}: {
  projects: SavedProject[];
  onOpenProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
  emptyMessage?: string;
  description?: string;
  showSimulationSummary?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const recentProjects = projects.slice(0, 5);
  const visibleProjects = recentProjects.slice(0, expanded ? 5 : 3);

  return (
    <aside className="liquid-home-card recent-projects-card">
      <div className="recent-projects-header">
        <h2>Recent Projects</h2>
        <p>{description ?? "Your latest FPGA workspaces will appear here."}</p>
      </div>

      {projects.length === 0 ? (
        <div className="recent-project-empty">
          <FolderClock size={34} strokeWidth={1.8} />
          <div>No recent projects</div>
          <p>{emptyMessage ?? "Start with a board on the left."}</p>
        </div>
      ) : (
        <div className="recent-project-list">
          {visibleProjects.map((project) => (
            <div
              className="recent-project-row"
              key={project.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenProject(project.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenProject(project.id);
                }
              }}
            >
              <div className="recent-project-copy">
                <div className="recent-project-title">{project.name}</div>
                <div className="recent-project-meta">
                  {getRecentProjectBoardName(project.boardId)}
                  <br />
                  Last saved {formatProjectTime(project.updatedAt)} ·{" "}
                  {project.files.length} files
                </div>
                {showSimulationSummary ? (
                  <SimulationRecentSummary project={project} />
                ) : null}
              </div>
              <button
                type="button"
                className="recent-project-remove"
                aria-label={`Remove ${project.name} from recent projects`}
                title="Remove from recent projects"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveProject(project.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
          {recentProjects.length > 3 ? (
            <button
              type="button"
              className="recent-projects-expand"
              aria-label={expanded ? "Show three recent projects" : `Show ${recentProjects.length - 3} more recent projects`}
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
            >
              ⋯
            </button>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function SimulationRecentSummary({ project }: { project: SavedProject }) {
  const result = project.lastSimulation;
  if (!result) {
    return <div className="recent-simulation-empty">No simulation run yet</div>;
  }

  return (
    <div className="recent-simulation-summary">
      <div className="recent-simulation-wave" aria-label="Last waveform preview">
        {(result.waveform.length ? result.waveform : [0, 0, 0, 0, 0, 0]).map(
          (value, index) => (
            <i className={value ? "high" : "low"} key={index} />
          ),
        )}
      </div>
      <span className={`recent-simulation-result ${result.status}`}>
        {result.status === "passed" ? <CheckCircle2 size={11} /> : <X size={11} />}
        {result.status === "passed" ? "Passed" : "Failed"}
      </span>
      <small>{formatCycleCount(result.cycles)} cycles · {result.signalCount} signals</small>
    </div>
  );
}

function formatCycleCount(cycles: number) {
  if (cycles >= 1_000_000) return `${(cycles / 1_000_000).toFixed(1)}M`;
  if (cycles >= 1_000) return `${Math.round(cycles / 1_000)}K`;
  return cycles.toLocaleString();
}

function getRecentProjectBoardName(boardId: string) {
  return getBoardById(boardId)?.name ?? boardId;
}

function getBoardSummary(board: BoardCatalogItem) {
  if ("variants" in board) {
    if (board.id === "arty-a7")
      return [board.vendor, "Artix-7", "XC7AxxT", "CSG324-1L"];
    if (board.id === "tinyfpga")
      return [board.vendor, "iCE40 LP", board.device, "CM81"];
    if (board.id === "colorlight-i5-family")
      return [board.vendor, "ECP5", "LFE5U-25F", "CABGA"];
    if (board.id === "butterstick")
      return [board.vendor, "ECP5", "LFE5UM5G", "BG381C"];
    if (board.id === "ecpix-5")
      return [board.vendor, "ECP5", "LFE5UM5G", "BG554I"];
    if (board.id === "tang-nano")
      return [board.vendor, "Gowin", "9K / 20K", "QN88"];
    if (board.id === "icebreaker-bitsy")
      return [board.vendor, "iCE40 UltraPlus", "UP5K", "SG48"];
    if (board.id === "icepi-zero")
      return [board.vendor, "ECP5", "25F / 45F", "BG256C"];
    if (board.id === "kosagi-netv2")
      return [board.vendor, "Artix-7", "A7-35 / A7-100", "FGG484"];
    if (board.id === "sqrl-acorn")
      return [board.vendor, "Artix-7", "A100T / A200T", "FGG/FBG484"];

    const boardDefinitions = getBoardDefinitions(board);
    const families = [
      ...new Set(boardDefinitions.map((definition) => definition.family)),
    ];
    const devices = [
      ...new Set(boardDefinitions.map((definition) => definition.device)),
    ];

    return [
      board.vendor,
      families.length === 1 ? families[0] : `${families.length} families`,
      `${board.variants.length} variants`,
      devices.length === 1 ? devices[0] : "Mixed FPGAs",
    ];
  }

  return [board.vendor, board.family, board.device, board.package];
}
