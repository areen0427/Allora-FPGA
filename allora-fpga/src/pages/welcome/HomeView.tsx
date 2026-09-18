import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Binary,
  CircuitBoard,
  Code2,
  FolderClock,
  FolderOpen,
  Hammer,
  Play,
  SlidersHorizontal,
  Sparkles,
  Waves,
  Zap,
} from "lucide-react";
import { getBoardById } from "../../data/boards";
import { formatProjectTime } from "../../data/projects";
import type { SavedProject } from "../../data/projects";
import type { BoardCatalogItem } from "../../data/boardSupport";
import { getBoardDefinitions } from "../../data/boardSupport";
import { getBoardIcon } from "../boardIcons";
import type { ExecutionTarget } from "../dashboard/types";

type HomeViewProps = {
  theme: "ice" | "black-ice";
  boards: BoardCatalogItem[];
  visibleBoards: BoardCatalogItem[];
  showAllBoards: boolean;
  recentProjects: SavedProject[];
  isOpeningExistingProject: boolean;
  openExistingProjectError: string;
  newProjectRef: React.RefObject<HTMLElement | null>;
  onToggleShowAllBoards: (showAll: boolean) => void;
  onSelectBoard: (board: BoardCatalogItem) => void;
  onOpenExistingProject: (target: ExecutionTarget) => void;
  onOpenProject: (projectId: string, target: ExecutionTarget) => void;
  onRemoveRecentProject: (projectId: string) => void;
};

export function HomeView({
  boards,
  visibleBoards,
  showAllBoards,
  recentProjects,
  isOpeningExistingProject,
  openExistingProjectError,
  newProjectRef,
  onToggleShowAllBoards,
  onSelectBoard,
  onOpenExistingProject,
  onOpenProject,
  onRemoveRecentProject,
}: HomeViewProps) {
  const [path, setPath] = useState<ExecutionTarget | null>(null);
  if (path === null) {
    return (
      <section className="execution-path-stage">
        <div className="welcome-environment" aria-hidden="true" />
        <div className="welcome-atmosphere" aria-hidden="true" />
        <header className="welcome-brand-lockup">
          <span className="welcome-brand-mark"><CircuitBoard size={18} /></span>
          <span>
            <strong>ALLORA</strong>
            <small>FPGA development environment</small>
          </span>
        </header>
        <ExecutionPathChooser onChoose={setPath} />
        <div className="welcome-stage-caption" aria-hidden="true">
          <span>One RTL source</span><i />
          <span>Two execution targets</span>
        </div>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Allora FPGA"
        title={path === "simulate" ? "Simulate" : "Build"}
        subtitle={
          path === "simulate"
            ? "Bring RTL to life before hardware."
            : "Target a board and take your design to silicon."
        }
        onBack={() => setPath(null)}
      />

      {path === "simulate" ? (
        <SimulationHome
          recentProjects={recentProjects}
          isOpening={isOpeningExistingProject}
          error={openExistingProjectError}
          onOpenExisting={() => onOpenExistingProject("simulate")}
          onOpenProject={(projectId) => onOpenProject(projectId, "simulate")}
          onRemoveProject={onRemoveRecentProject}
        />
      ) : (
        <div className="welcome-home-layout">
          <SupportedBoardGrid
            boards={boards}
            visibleBoards={visibleBoards}
            showAllBoards={showAllBoards}
            newProjectRef={newProjectRef}
            onToggleShowAllBoards={onToggleShowAllBoards}
            onSelectBoard={onSelectBoard}
          />

          <div className="welcome-home-sidebar">
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
    </>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
  onBack,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <header className="welcome-page-header">
      {onBack ? (
        <button className="welcome-back-button" type="button" onClick={onBack}>
          <ArrowLeft size={17} />
        </button>
      ) : null}
      <div>
        <div className="welcome-eyebrow">{eyebrow}</div>
        <h1 className="welcome-title">{title}</h1>
        {subtitle ? <p className="welcome-subtitle">{subtitle}</p> : null}
      </div>
    </header>
  );
}

function ExecutionPathChooser({
  onChoose,
}: {
  onChoose: (target: ExecutionTarget) => void;
}) {
  return (
    <section className="execution-path-grid">
      <button
        type="button"
        onClick={() => onChoose("simulate")}
        className="execution-path-card simulate"
      >
        <span className="glass-edge glass-edge-top" aria-hidden="true" />
        <span className="glass-edge glass-edge-side" aria-hidden="true" />
        <span className="glass-specular" aria-hidden="true" />
        <div className="execution-path-copy">
          <span className="execution-path-kicker">
            <Sparkles size={15} /> Virtual FPGA
          </span>
          <h2>Simulate</h2>
          <p>
            Write RTL, touch virtual inputs, watch outputs, inspect signals, and
            debug without plugging in a board.
          </p>
          <span className="execution-path-cta">
            <Play size={15} fill="currentColor" /> Enter simulator
            <ArrowUpRight size={15} />
          </span>
        </div>
        <div className="execution-path-clear-field" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
        <div className="execution-path-features">
          <span>
            <Code2 size={14} /> Same RTL
          </span>
          <span>
            <SlidersHorizontal size={14} /> Live controls
          </span>
          <span>
            <Waves size={14} /> Signals
          </span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onChoose("build")}
        className="execution-path-card build"
      >
        <span className="glass-edge glass-edge-top" aria-hidden="true" />
        <span className="glass-edge glass-edge-side" aria-hidden="true" />
        <span className="glass-specular" aria-hidden="true" />
        <div className="execution-path-copy">
          <span className="execution-path-kicker">
            <CircuitBoard size={15} /> Physical FPGA
          </span>
          <h2>Build</h2>
          <p>
            Choose an open-source board, map pins, synthesize, place and route,
            generate a bitstream, and program hardware.
          </p>
          <span className="execution-path-cta">
            <Hammer size={15} /> Choose a board
            <ArrowUpRight size={15} />
          </span>
        </div>
        <div className="execution-path-clear-field" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
        <div className="execution-path-features">
          <span>
            <Binary size={14} /> Synthesis
          </span>
          <span>
            <CircuitBoard size={14} /> Pin mapping
          </span>
          <span>
            <Zap size={14} /> Program
          </span>
        </div>
      </button>
    </section>
  );
}

function MiniVirtualBoard() {
  return (
    <div className="mini-virtual-board" aria-hidden="true">
      <div className="mini-leds">
        {[true, false, true, true, false, true].map((active, index) => (
          <i className={active ? "on" : ""} key={index} />
        ))}
      </div>
      <div className="mini-chip">
        <small>ALLORA</small>
        <strong>VIRTUAL</strong>
        <em>FPGA</em>
      </div>
      <div className="mini-controls">
        <span />
        <span className="up" />
        <span />
        <b />
        <b />
      </div>
    </div>
  );
}

function SimulationHome({
  recentProjects,
  isOpening,
  error,
  onOpenExisting,
  onOpenProject,
  onRemoveProject,
}: {
  recentProjects: SavedProject[];
  isOpening: boolean;
  error: string;
  onOpenExisting: () => void;
  onOpenProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
}) {
  return (
    <div className="simulation-home-layout">
      <section className="simulation-welcome-card">
        <div className="simulation-orbit one" />
        <div className="simulation-orbit two" />
        <div className="simulation-welcome-copy">
          <span>
            <Sparkles size={15} /> No hardware required
          </span>
          <h2>Your RTL, running on a virtual board.</h2>
          <p>
            Open any Allora project, map its ports to interactive peripherals,
            and compile the actual design with Verilator.
          </p>
          <button type="button" onClick={onOpenExisting} disabled={isOpening}>
            <FolderOpen size={17} />
            {isOpening ? "Opening…" : "Open project to simulate"}
          </button>
          {error ? <div className="open-project-error">{error}</div> : null}
        </div>
        <MiniVirtualBoard />
      </section>
      <RecentProjectsCard
        projects={recentProjects}
        onOpenProject={onOpenProject}
        onRemoveProject={onRemoveProject}
        emptyMessage="Open an Allora project to begin simulating."
      />
    </div>
  );
}

function SupportedBoardGrid({
  boards,
  visibleBoards,
  showAllBoards,
  newProjectRef,
  onToggleShowAllBoards,
  onSelectBoard,
}: {
  boards: BoardCatalogItem[];
  visibleBoards: BoardCatalogItem[];
  showAllBoards: boolean;
  newProjectRef: React.RefObject<HTMLElement | null>;
  onToggleShowAllBoards: (showAll: boolean) => void;
  onSelectBoard: (board: BoardCatalogItem) => void;
}) {
  return (
    <section ref={newProjectRef}>
      <div className="welcome-section-header">
        <div>
          <h2>New Project</h2>
          <p>Choose an FPGA Board to create a project workspace.</p>
        </div>
      </div>

      <div className="supported-board-grid">
        {visibleBoards.map((board) => (
          <BoardCard
            key={board.id}
            board={board}
            onSelect={() => onSelectBoard(board)}
          />
        ))}
      </div>

      {boards.length > 8 ? (
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
  board,
  onSelect,
}: {
  board: BoardCatalogItem;
  onSelect: () => void;
}) {
  const BoardIcon = getBoardIcon(board);

  return (
    <button
      className="board-card welcome-board-card"
      type="button"
      onClick={onSelect}
    >
      <div className="board-icon-badge">
        <BoardIcon size={17} strokeWidth={2.2} />
      </div>

      <div className="board-card-title-row">
        <h3>{board.name}</h3>
        {"variants" in board ? (
          <span className="board-count-pill board-family-pill">
            {board.variants.length}
          </span>
        ) : null}
      </div>

      <p>{getBoardSummary(board).join(" · ")}</p>
    </button>
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
}: {
  projects: SavedProject[];
  onOpenProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
  emptyMessage?: string;
}) {
  return (
    <aside className="liquid-home-card recent-projects-card">
      <div className="recent-projects-header">
        <h2>Recent Projects</h2>
        <p>Your latest FPGA workspaces will appear here.</p>
      </div>

      {projects.length === 0 ? (
        <div className="recent-project-empty">
          <FolderClock size={34} strokeWidth={1.8} />
          <div>No recent projects</div>
          <p>{emptyMessage ?? "Start with a board on the left."}</p>
        </div>
      ) : (
        <div className="recent-project-list">
          {projects.map((project) => (
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
        </div>
      )}
    </aside>
  );
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
