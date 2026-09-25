import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  CircuitBoard,
  ExternalLink,
  FolderClock,
  FolderOpen,
  Gauge,
  Info,
  Keyboard,
  Layers3,
  Map as MapIcon,
  Play,
  Radio,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Zap,
  X,
} from "lucide-react";
import { getBoardById } from "../../data/boards";
import { formatProjectTime } from "../../data/projects";
import type { SavedProject } from "../../data/projects";
import type { BoardCatalogItem } from "../../data/boardSupport";
import { getBoardDefinitions } from "../../data/boardSupport";
import { getBoardIcon } from "../boardIcons";
import type { ExecutionTarget } from "../dashboard/types";
import type { AppSettings } from "../../data/settings";
import VirtualPcbDiagram from "../../components/VirtualPcbDiagram";

type HomeViewProps = {
  theme: "ice" | "black-ice";
  reduceMotion: boolean;
  settings: AppSettings;
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
  onOpenExistingProject: (target: ExecutionTarget) => void;
  onCreateSimulationProject: () => void;
  onOpenProject: (projectId: string, target: ExecutionTarget) => void;
  onRemoveRecentProject: (projectId: string) => void;
  onSettingsChange: (settings: AppSettings) => void;
};

export function HomeView({
  reduceMotion,
  settings,
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
  onOpenExistingProject,
  onCreateSimulationProject,
  onOpenProject,
  onRemoveRecentProject,
  onSettingsChange,
}: HomeViewProps) {
  const [path, setPath] = useState<ExecutionTarget | null>(null);
  const [departingPath, setDepartingPath] = useState<ExecutionTarget | null>(
    null,
  );
  const [showProductInfo, setShowProductInfo] = useState(false);
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
        <div className="welcome-action-stack">
          <button
            type="button"
            className="welcome-brand-lockup"
            aria-expanded={showProductInfo}
            aria-controls="welcome-product-info"
            onClick={() => setShowProductInfo((visible) => !visible)}
          >
            <span className="welcome-brand-mark">
              <CircuitBoard size={18} />
            </span>
            <span className="welcome-brand-copy">
              <strong>ALLORA</strong>
              <small>FPGA development environment</small>
            </span>
            <Info
              className="welcome-brand-info-icon"
              size={15}
              aria-hidden="true"
            />
          </button>
          {showProductInfo ? (
            <section
              id="welcome-product-info"
              className="welcome-product-info"
              aria-label="About Allora FPGA"
            >
              <button
                type="button"
                className="welcome-product-info-close"
                aria-label="Close product information"
                onClick={() => setShowProductInfo(false)}
              >
                <X size={15} />
              </button>
              <header className="welcome-product-info-header">
                <span className="welcome-product-info-eyebrow">
                  Allora FPGA
                </span>
                <strong>Product information</strong>
              </header>
              <div className="welcome-product-info-meta">
                <span>
                  <small>Version</small>
                  <strong>0.0.0</strong>
                </span>
                <a
                  href="https://github.com/areen0427/Allora-FPGA#readme"
                  target="_blank"
                  rel="noreferrer"
                >
                  <BookOpen size={14} /> Documentation{" "}
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
                    <small>Supported boards</small>
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
          <ExecutionPathChooser
            selectedTarget={departingPath}
            onChoose={(target) => {
              if (reduceMotion) {
                setPath(target);
                return;
              }
              setDepartingPath(target);
            }}
            onOpenPinMapping={onOpenPinMapping}
          />
          {recentProjects[0] ? (
            <ContinueProjectTile
              project={recentProjects[0]}
              onOpen={(target) => onOpenProject(recentProjects[0].id, target)}
            />
          ) : null}
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
            onCreateProject={onCreateSimulationProject}
            onOpenProject={(projectId) => onOpenProject(projectId, "simulate")}
            onRemoveProject={onRemoveRecentProject}
            settings={settings}
            onSettingsChange={onSettingsChange}
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
                expandableToFive
              />
            </div>
          </div>
        )}
      </div>
    </section>
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
        <button
          className="welcome-back-button"
          type="button"
          aria-label="Back to welcome"
          onClick={onBack}
        >
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
  selectedTarget,
  onChoose,
  onOpenPinMapping,
}: {
  selectedTarget: ExecutionTarget | null;
  onChoose: (target: ExecutionTarget) => void;
  onOpenPinMapping: () => void;
}) {
  return (
    <section className="execution-path-grid">
      <div className="execution-path-option">
        <button
          type="button"
          onClick={() => onChoose("simulate")}
          className={`execution-path-card simulate${selectedTarget === "simulate" ? " is-selected" : ""}`}
          disabled={selectedTarget !== null}
        >
          <span className="glass-edge glass-edge-top" aria-hidden="true" />
          <span className="glass-edge glass-edge-side" aria-hidden="true" />
          <span className="glass-specular" aria-hidden="true" />
          <div className="execution-path-copy">
            <span className="execution-path-kicker">
              <Sparkles size={14} aria-hidden="true" /> Virtual FPGA
            </span>
            <span className="execution-path-title-row">
              <h2>Simulate</h2>
              <i className="execution-path-glyph" aria-hidden="true">
                <b />
                <b />
                <b />
              </i>
            </span>
            <span className="execution-path-microcopy">
              RTL · Signals · No hardware
            </span>
          </div>
        </button>
      </div>

      <div className="execution-path-option build-option">
        <button
          type="button"
          onClick={() => onChoose("build")}
          className={`execution-path-card build${selectedTarget === "build" ? " is-selected" : ""}`}
          disabled={selectedTarget !== null}
        >
          <span className="glass-edge glass-edge-top" aria-hidden="true" />
          <span className="glass-edge glass-edge-side" aria-hidden="true" />
          <span className="glass-specular" aria-hidden="true" />
          <div className="execution-path-copy">
            <span className="execution-path-kicker">
              <CircuitBoard size={14} aria-hidden="true" /> Physical FPGA
            </span>
            <span className="execution-path-title-row">
              <h2>Build</h2>
              <i className="execution-path-glyph" aria-hidden="true">
                <b />
                <b />
                <b />
              </i>
            </span>
            <span className="execution-path-microcopy">
              Synthesis · Bitstream · Program
            </span>
          </div>
        </button>
        <button
          type="button"
          className="pin-mapping-quick-action"
          onClick={onOpenPinMapping}
          disabled={selectedTarget !== null}
        >
          <MapIcon size={14} /> Open Pin Mapper
        </button>
      </div>
    </section>
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
  const resumeTarget =
    project.lastExecutionTarget ??
    (project.projectKind === "simulation" ? "simulate" : null);

  return (
    <section className="welcome-continue-project" aria-label="Continue project">
      <div className="welcome-continue-project-copy">
        <span>Continue project</span>
        <strong>{project.name}</strong>
        <div className="welcome-continue-project-meta">
          <small>
            {boardName} · {updatedDate}
          </small>
          <time dateTime={project.updatedAt}>{updatedTime}</time>
        </div>
      </div>
      <div className="welcome-continue-actions">
        {resumeTarget ? (
          <button type="button" onClick={() => onOpen(resumeTarget)}>
            {resumeTarget === "simulate" ? (
              <Sparkles size={13} />
            ) : (
              <CircuitBoard size={13} />
            )}
            Resume {resumeTarget === "simulate" ? "Simulation" : "Build"}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onOpen("simulate")}>
              <Sparkles size={13} /> Simulate
            </button>
            <button type="button" onClick={() => onOpen("build")}>
              <CircuitBoard size={13} /> Build
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function ProfessionalVirtualBoard({ clockHz }: { clockHz: number }) {
  const [inputs, setInputs] = useState([true, false, true, false]);

  const toggleInput = (index: number) => {
    setInputs((current) =>
      current.map((active, inputIndex) =>
        inputIndex === index ? !active : active,
      ),
    );
  };

  return (
    <div className="simulation-board-stage">
      <div className="simulation-board-toolbar">
        <span>
          <Radio size={13} /> Interactive preview
        </span>
        <span className="simulation-board-live">
          <i /> Live
        </span>
      </div>

      <VirtualPcbDiagram
        ariaLabel="Interactive virtual FPGA board preview"
        clockHz={clockHz}
        inputs={inputs}
        onToggleInput={toggleInput}
      />

      <div className="simulation-board-caption">
        <span><Zap size={13} /> Click the switches to test virtual inputs</span>
        <span>4 inputs · 4 outputs</span>
      </div>
    </div>
  );
}

function SimulationHome({
  recentProjects,
  isOpening,
  error,
  onOpenExisting,
  onCreateProject,
  onOpenProject,
  onRemoveProject,
  settings,
  onSettingsChange,
}: {
  recentProjects: SavedProject[];
  isOpening: boolean;
  error: string;
  onOpenExisting: () => void;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  return (
    <div className="simulation-home-layout">
      <section className="simulation-welcome-card">
        <div className="simulation-console-header">
          <div className="simulation-welcome-copy">
            <span>
              <Sparkles size={15} /> Hardware-free RTL workspace
            </span>
            <h2>Validate your design before it reaches the board.</h2>
            <p>
              Compile real RTL, exercise mapped inputs, and inspect every signal
              in one focused simulation workspace.
            </p>
          </div>
          <div className="simulation-welcome-actions">
            <button type="button" onClick={onCreateProject}>
              <Play size={17} fill="currentColor" /> New simulation
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onOpenExisting}
              disabled={isOpening}
            >
              <FolderOpen size={17} />
              {isOpening ? "Opening…" : "Open project"}
            </button>
          </div>
        </div>

        {error ? <div className="open-project-error">{error}</div> : null}

        <ProfessionalVirtualBoard clockHz={settings.simulatorDefaultClockHz} />

        <div className="simulation-capability-strip" aria-label="Simulation capabilities">
          <span><Activity size={15} /><strong>Waveforms</strong><small>VCD capture</small></span>
          <span><Layers3 size={15} /><strong>RTL compile</strong><small>Verilator</small></span>
          <span><Timer size={15} /><strong>Clock control</strong><small>Cycle precise</small></span>
          <span><Gauge size={15} /><strong>I/O mapping</strong><small>Live controls</small></span>
        </div>
      </section>

      <div className="simulation-sidebar-stack">
        <SimulationLaunchDefaults
          settings={settings}
          onChange={onSettingsChange}
        />
        <RecentProjectsCard
          projects={recentProjects}
          onOpenProject={onOpenProject}
          onRemoveProject={onRemoveProject}
          emptyMessage="Open an Allora project to begin simulating."
          showSimulationSummary
        />
      </div>
    </div>
  );
}

function SimulationLaunchDefaults({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}) {
  return (
    <section className="liquid-home-card simulation-defaults-card">
      <div className="simulation-defaults-heading">
        <span><SlidersHorizontal size={15} /> Launch defaults</span>
        <strong><i /> Verilator ready</strong>
      </div>
      <div className="simulation-default-controls">
        <label>
          <span>Clock</span>
          <select
            value={settings.simulatorDefaultClockHz}
            onChange={(event) =>
              onChange({
                ...settings,
                simulatorDefaultClockHz: Number(event.target.value) as AppSettings["simulatorDefaultClockHz"],
              })
            }
          >
            <option value={10_000_000}>10 MHz</option>
            <option value={25_000_000}>25 MHz</option>
            <option value={50_000_000}>50 MHz</option>
            <option value={100_000_000}>100 MHz</option>
          </select>
        </label>
        <label>
          <span>Duration</span>
          <select
            value={settings.simulatorCycleLimit}
            onChange={(event) =>
              onChange({
                ...settings,
                simulatorCycleLimit: Number(event.target.value) as AppSettings["simulatorCycleLimit"],
              })
            }
          >
            <option value={100_000}>100K cycles</option>
            <option value={1_000_000}>1M cycles</option>
            <option value={10_000_000}>10M cycles</option>
            <option value={0}>No limit</option>
          </select>
        </label>
        <button
          type="button"
          className={`simulation-trace-toggle${settings.simulatorCaptureWaveform ? " active" : ""}`}
          role="switch"
          aria-checked={settings.simulatorCaptureWaveform}
          onClick={() =>
            onChange({
              ...settings,
              simulatorCaptureWaveform: !settings.simulatorCaptureWaveform,
            })
          }
        >
          <span><Activity size={14} /> Record VCD trace</span>
          <i><b /></i>
        </button>
      </div>
    </section>
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
  showSimulationSummary = false,
  expandableToFive = false,
}: {
  projects: SavedProject[];
  onOpenProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
  emptyMessage?: string;
  showSimulationSummary?: boolean;
  expandableToFive?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleProjects = expandableToFive && !expanded
    ? projects.slice(0, 3)
    : projects;

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
          {expandableToFive && projects.length > 3 ? (
            <button
              type="button"
              className="recent-projects-expand"
              aria-label={expanded ? "Show three recent projects" : `Show ${projects.length - 3} more recent projects`}
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
