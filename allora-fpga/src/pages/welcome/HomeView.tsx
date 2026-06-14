import { FolderClock, FolderOpen } from "lucide-react";
import { getBoardById } from "../../data/boards";
import { formatProjectTime } from "../../data/projects";
import type { SavedProject } from "../../data/projects";
import type { BoardCatalogItem } from "../../data/boardSupport";
import { getBoardDefinitions } from "../../data/boardSupport";
import { getBoardIcon } from "../boardIcons";

type HomeViewProps = {
  boards: BoardCatalogItem[];
  visibleBoards: BoardCatalogItem[];
  showAllBoards: boolean;
  recentProjects: SavedProject[];
  isOpeningExistingProject: boolean;
  openExistingProjectError: string;
  newProjectRef: React.RefObject<HTMLElement | null>;
  onToggleShowAllBoards: (showAll: boolean) => void;
  onSelectBoard: (board: BoardCatalogItem) => void;
  onOpenExistingProject: () => void;
  onOpenProject: (projectId: string) => void;
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
  return (
    <>
      <PageHeader eyebrow="Allora FPGA" title="Welcome" />

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
            onOpen={onOpenExistingProject}
          />
          <RecentProjectsCard
            projects={recentProjects}
            onOpenProject={onOpenProject}
            onRemoveProject={onRemoveRecentProject}
          />
        </div>
      </div>
    </>
  );
}

function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="welcome-page-header">
      <div>
        <div className="welcome-eyebrow">{eyebrow}</div>
        <h1 className="welcome-title">{title}</h1>
      </div>
    </header>
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
    <section className="liquid-home-card open-project-card">
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
}: {
  projects: SavedProject[];
  onOpenProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
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
          <p>Start with a board on the left.</p>
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
