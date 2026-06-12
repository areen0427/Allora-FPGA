import { BOARDS, getBoardById } from "../data/boards";
import { getBoardCapabilities } from "../data/boardCapabilities";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Cpu,
  FolderClock,
  FolderOpen,
  Home,
  Map as MapIcon,
  Settings,
} from "lucide-react";
import { formatProjectTime, getSavedProjects, removeSavedProject } from "../data/projects";
import type { AppSettings } from "../data/settings";
import { getBoardIcon } from "./boardIcons";

type VariantBoard = Extract<(typeof BOARDS)[number], { variants: unknown }>;

type BoardSelectProps = {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onSelectBoard: (boardId: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenExistingProject: () => Promise<void>;
};

type BoardCardItem = (typeof BOARDS)[number];

function getBoardSummary(board: (typeof BOARDS)[number]) {
  if ("variants" in board) {
    if (board.id === "arty-a7") {
      return [board.vendor, "Artix-7", "XC7AxxT", "CSG324-1L"];
    }

    if (board.id === "tinyfpga") {
      return [board.vendor, "iCE40 LP", board.device, "CM81"];
    }

    if (board.id === "colorlight-i5-family") {
      return [board.vendor, "ECP5", "LFE5U-25F", "CABGA"];
    }

    if (board.id === "butterstick") {
      return [board.vendor, "ECP5", "LFE5UM5G", "BG381C"];
    }

    if (board.id === "ecpix-5") {
      return [board.vendor, "ECP5", "LFE5UM5G", "BG554I"];
    }

    if (board.id === "tang-nano") {
      return [board.vendor, "Gowin", "9K / 20K", "QN88"];
    }

    if (board.id === "icebreaker-bitsy") {
      return [board.vendor, "iCE40 UltraPlus", "UP5K", "SG48"];
    }

    if (board.id === "icepi-zero") {
      return [board.vendor, "ECP5", "25F / 45F", "BG256C"];
    }

    if (board.id === "kosagi-netv2") {
      return [board.vendor, "Artix-7", "A7-35 / A7-100", "FGG484"];
    }

    if (board.id === "sqrl-acorn") {
      return [board.vendor, "Artix-7", "A100T / A200T", "FGG/FBG484"];
    }

    const boardDefinitions = getBoardDefinitions(board);
    const families = [...new Set(boardDefinitions.map((definition) => definition.family))];
    const devices = [...new Set(boardDefinitions.map((definition) => definition.device))];

    return [
      board.vendor,
      families.length === 1 ? families[0] : `${families.length} families`,
      `${board.variants.length} variants`,
      devices.length === 1 ? devices[0] : "Mixed FPGAs",
    ];
  }

  return [board.vendor, board.family, board.device, board.package];
}

function getBoardDefinitions(board: BoardCardItem) {
  return "variants" in board
    ? board.variants
        .map((variant) => getBoardById(variant.id))
        .filter((variantBoard): variantBoard is NonNullable<ReturnType<typeof getBoardById>> =>
          Boolean(variantBoard)
        )
    : [board];
}

function getRecentProjectBoardName(boardId: string) {
  return getBoardById(boardId)?.name ?? boardId;
}

function isBuildSupported(board: BoardCardItem) {
  return getBoardDefinitions(board).some((boardDefinition) => {
    const capabilities = getBoardCapabilities(boardDefinition);
    return capabilities.synthesisDiagram.supported && capabilities.bitstream.supported;
  });
}

export default function BoardSelect({
  settings,
  onSettingsChange,
  onSelectBoard,
  onOpenProject,
  onOpenExistingProject,
}: BoardSelectProps) {
  const [selectedVariantBoard, setSelectedVariantBoard] = useState<VariantBoard | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savedProjects, setSavedProjects] = useState(() => getSavedProjects());
  const [showAllBoards, setShowAllBoards] = useState(false);
  const [isOpeningExistingProject, setIsOpeningExistingProject] = useState(false);
  const [openExistingProjectError, setOpenExistingProjectError] = useState("");
  const [activeView, setActiveView] = useState<"home" | "pin-mapping">("home");
  const [selectedPinBoard, setSelectedPinBoard] = useState<string | null>(null);
  const newProjectRef = useRef<HTMLElement | null>(null);
  const recentProjects = savedProjects.slice(0, settings.recentProjectsLimit);

  const supportedBoards = BOARDS.filter((board) => isBuildSupported(board)).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const unsupportedBoards = BOARDS.filter((board) => !isBuildSupported(board)).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const visibleBoards = showAllBoards ? supportedBoards : supportedBoards.slice(0, 8);

  function handleSelectBoard(board: (typeof BOARDS)[number]) {
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
        error instanceof Error ? error.message : "Unable to open that project folder."
      );
    } finally {
      setIsOpeningExistingProject(false);
    }
  }

  return (
    <div
      className="glass-page"
      onClick={() => {}}
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
        color: "#0f172a",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
      }}
    >
      <aside
        className="home-rail"
        style={{
          width: "68px",
          borderRight: "1px solid #e2e8f0",
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(14px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "18px 0",
          gap: "14px",
        }}
      >
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "12px",
            background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 20px rgba(37,99,235,0.25)",
          }}
        >
          <Cpu size={20} color="white" strokeWidth={2.2} />
        </div>

        <RailButton
          active={activeView === "home"}
          label="Home"
          onClick={() => {
            setActiveView("home");
            setSelectedPinBoard(null);
            newProjectRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <Home size={20} />
        </RailButton>

        <RailButton
          active={activeView === "pin-mapping"}
          label="Pin Mapping"
          onClick={() => setActiveView("pin-mapping")}
        >
          <MapIcon size={20} />
        </RailButton>

        <RailButton
          label="Settings"
          onClick={() => setShowSettings(true)}
        >
          <Settings size={20} />
        </RailButton>

        <div style={{ flex: 1 }} />
      </aside>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "28px 36px 36px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: activeView === "home" ? "1280px" : "1680px",
          }}
        >
          {activeView === "home" ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "34px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#64748b",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Allora FPGA
                  </div>

                  <h1
                    style={{
                      margin: "6px 0 0",
                      fontSize: "40px",
                      fontWeight: 850,
                      letterSpacing: "-0.04em",
                      lineHeight: 1.05,
                    }}
                  >
                    Welcome
                  </h1>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 320px",
                  gap: "24px",
                  alignItems: "start",
                }}
              >
              <section ref={newProjectRef}>
                <div
                  style={{
                    marginBottom: "18px",
                    display: "flex",
                    alignItems: "end",
                    justifyContent: "space-between",
                    gap: "18px",
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: "26px",
                        fontWeight: 850,
                        letterSpacing: "-0.03em",
                      }}
                    >
                      New Project
                    </h2>

                    <p
                      style={{
                        margin: "8px 0 0",
                        color: "#64748b",
                        fontSize: "16px",
                        lineHeight: 1.45,
                      }}
                    >
                    Choose an FPGA Board to create a project workspace.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                    gap: "16px",
                  }}
                >
                  {visibleBoards.map((board) => {
                    const BoardIcon = getBoardIcon(board);

                    return (
                      <button
                        className="board-card"
                        key={board.id}
                        onClick={() => handleSelectBoard(board)}
                        style={{
                          borderRadius: "14px",
                          padding: "18px",
                          cursor: "pointer",
                          textAlign: "left",
                          height: "172px",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <div className="board-icon-badge">
                          <BoardIcon size={17} strokeWidth={2.2} />
                        </div>

                        <div className="board-card-title-row">
                          <h3
                            style={{
                              margin: 0,
                              fontSize: "17px",
                              color: "#0f172a",
                              fontWeight: 850,
                              lineHeight: 1.18,
                              flex: "1 1 auto",
                              minWidth: 0,
                            }}
                          >
                            {board.name}
                          </h3>

                          {"variants" in board ? (
                            <span className="board-count-pill board-family-pill">
                              {board.variants.length}
                            </span>
                          ) : null}
                        </div>

                        <p
                          style={{
                            margin: "8px 0 0",
                            fontSize: "11px",
                            color: "#64748b",
                            fontWeight: 750,
                            lineHeight: 1.45,
                            minHeight: "35px",
                          }}
                        >
                          {getBoardSummary(board).join(" · ")}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {supportedBoards.length > 8 && !showAllBoards ? (
                  <button
                    type="button"
                    className="board-show-more"
                    onClick={() => setShowAllBoards(true)}
                  >
                    Show all {supportedBoards.length} Boards
                  </button>
                ) : null}

                {showAllBoards && supportedBoards.length > 8 ? (
                  <button
                    type="button"
                    className="board-show-more"
                    onClick={() => setShowAllBoards(false)}
                  >
                    Show Fewer Boards
                  </button>
                ) : null}
              </section>

              <div
                style={{
                  marginTop: "78px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <section
                  className="liquid-home-card open-project-card"
                  style={{
                    borderRadius: "16px",
                    padding: "18px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void handleOpenExistingProject()}
                    disabled={isOpeningExistingProject}
                    style={{
                      width: "100%",
                      border: "none",
                      background: "transparent",
                      color: "inherit",
                      padding: 0,
                      cursor: isOpeningExistingProject ? "wait" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      textAlign: "left",
                    }}
                  >
                    <span
                      className="open-project-icon"
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "12px",
                        background: "#eff6ff",
                        color: "#2563eb",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <FolderOpen size={19} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span
                        className="open-project-title"
                        style={{
                          display: "block",
                          fontSize: "15px",
                          fontWeight: 850,
                          color: "#0f172a",
                        }}
                      >
                        {isOpeningExistingProject ? "Opening Project" : "Open Existing Project"}
                      </span>
                      <span
                        className="open-project-subtitle"
                        style={{
                          display: "block",
                          marginTop: "4px",
                          fontSize: "12px",
                          fontWeight: 750,
                          color: "#64748b",
                          lineHeight: 1.4,
                        }}
                      >
                        Choose the project's top folder.
                      </span>
                    </span>
                  </button>

                  {openExistingProjectError ? (
                    <div
                      style={{
                        marginTop: "12px",
                        color: "#dc2626",
                        fontSize: "12px",
                        fontWeight: 750,
                        lineHeight: 1.45,
                      }}
                    >
                      {openExistingProjectError}
                    </div>
                  ) : null}
                </section>

              <aside
                className="liquid-home-card recent-projects-card"
                style={{
                  borderRadius: "16px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "20px",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "18px",
                      fontWeight: 850,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Recent Projects
                  </h2>
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "14px",
                      color: "#64748b",
                      lineHeight: 1.45,
                    }}
                  >
                    Your latest FPGA workspaces will appear here.
                  </p>
                </div>

                {recentProjects.length === 0 ? (
                  <div
                    className="recent-project-empty"
                    style={{
                      padding: "26px 20px",
                      minHeight: "180px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      textAlign: "center",
                      color: "#64748b",
                    }}
                  >
                    <FolderClock size={34} strokeWidth={1.8} />
                    <div
                      style={{
                        marginTop: "12px",
                        fontSize: "15px",
                        fontWeight: 800,
                        color: "#334155",
                      }}
                    >
                      No recent projects
                    </div>
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: "14px",
                        lineHeight: 1.45,
                      }}
                    >
                      Start with a board on the left.
                    </p>
                  </div>
                ) : (
                  <div style={{ padding: "10px" }}>
                    {recentProjects.map((project) => (
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
                        style={{
                          width: "100%",
                          borderRadius: "12px",
                          padding: "12px",
                          textAlign: "left",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <div
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          <div
                            className="recent-project-title"
                            style={{
                              fontSize: "14px",
                              fontWeight: 850,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {project.name}
                          </div>
                          <div
                            className="recent-project-meta"
                            style={{
                              marginTop: "4px",
                              fontSize: "12px",
                              fontWeight: 750,
                              lineHeight: 1.45,
                            }}
                          >
                            {getRecentProjectBoardName(project.boardId)}
                            <br />
                            Last saved {formatProjectTime(project.updatedAt)} · {project.files.length} files
                          </div>
                        </div>
                        <button
                          type="button"
                          className="recent-project-remove"
                          aria-label={`Remove ${project.name} from recent projects`}
                          title="Remove from recent projects"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeRecentProject(project.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </aside>
              </div>
              </div>
              </>
            ) : (
              /* Pin Mapping View */
              <PinMappingBrowser
                unsupportedBoards={unsupportedBoards}
                selectedBoardId={selectedPinBoard}
                onSelectBoard={setSelectedPinBoard}
              />
            )}
          </div>
        </div>


      {selectedVariantBoard && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedVariantBoard(null)}
        >
          <div
            className="variant-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="variant-modal-header">
              <h2>Select {selectedVariantBoard.name} Variant</h2>

              <button
                onClick={() => setSelectedVariantBoard(null)}
              >
                ×
              </button>
            </div>

            <div className="variant-grid">
              {selectedVariantBoard.variants.map((variant) => (
                <button
                  className="variant-card"
                  key={variant.id}
                  onClick={() => {
                    setSelectedVariantBoard(null);
                    onSelectBoard(variant.id);
                  }}
                >
                  <h3>{variant.name}</h3>
                  <p>{variant.fpga}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={onSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function PinMappingBrowser({
  unsupportedBoards,
  selectedBoardId,
  onSelectBoard,
}: {
  unsupportedBoards: (typeof BOARDS)[number][];
  selectedBoardId: string | null;
  onSelectBoard: (boardId: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();

  const filteredBoards = normalizedSearch
    ? unsupportedBoards.filter((board) =>
        board.name.toLowerCase().includes(normalizedSearch) ||
        board.vendor.toLowerCase().includes(normalizedSearch) ||
        ("device" in board && board.device.toLowerCase().includes(normalizedSearch))
      )
    : unsupportedBoards;

  const selectedBoard = selectedBoardId ? getBoardById(selectedBoardId) : null;

  const resourceGroups = selectedBoard
    ? getResourceGroupsForBrowser(selectedBoard)
    : [];

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "13px",
              color: "#64748b",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Pin Mapping Browser
          </div>

          <h1
            style={{
              margin: "6px 0 0",
              fontSize: "40px",
              fontWeight: 850,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
            }}
          >
            Board Pinouts
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              color: "#64748b",
              fontSize: "16px",
              lineHeight: 1.45,
            }}
          >
            Browse pin mappings for boards that are not fully supported.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "400px minmax(0, 1fr)",
          gap: "24px",
          alignItems: "stretch",
          height: "calc(100vh - 180px)",
        }}
      >
        {/* Board List */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            minHeight: 0,
          }}
        >
          <label
            className="board-search-field pin-browser-search"
            style={{
              width: "100%",
            }}
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search boards"
              type="search"
            />
          </label>

          <div className="pin-board-list">
            {filteredBoards.map((board) => {
              const isSelected = selectedBoardId && (
                board.id === selectedBoardId ||
                ("variants" in board && board.variants.some((v) => v.id === selectedBoardId))
              );

              return (
                <button
                  key={board.id}
                  type="button"
                  className={isSelected ? "pin-board-item selected" : "pin-board-item"}
                  onClick={() => {
                    if ("variants" in board) {
                      onSelectBoard(board.variants[0].id);
                    } else {
                      onSelectBoard(board.id);
                    }
                  }}
                >
                  <div className="pin-board-item-name">{board.name}</div>
                  <div className="pin-board-item-meta">
                    {"variants" in board
                      ? `${board.vendor} · ${board.variants.length} variants`
                      : `${board.vendor} · ${board.family} · ${board.device}`}
                  </div>
                </button>
              );
            })}

            {filteredBoards.length === 0 && (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: "14px",
                  fontWeight: 750,
                }}
              >
                No boards match your search.
              </div>
            )}
          </div>
        </div>

        {/* Pin Detail */}
        {selectedBoard ? (
          <div
            className="dashboard-glass-card"
            style={{
              borderRadius: "16px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              minHeight: 0,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "24px",
                  fontWeight: 850,
                  letterSpacing: "-0.03em",
                }}
              >
                {selectedBoard.name}
              </h2>
              <p
                style={{
                  margin: "6px 0 0",
                  color: "#64748b",
                  fontSize: "14px",
                  lineHeight: 1.45,
                }}
              >
                {"vendor" in selectedBoard && selectedBoard.vendor} · {"family" in selectedBoard && selectedBoard.family} · {"device" in selectedBoard && selectedBoard.device}
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <PinSummaryPill label="Pins" value={String(selectedBoard.pins.length)} />
              <PinSummaryPill label="Clocks" value={String(selectedBoard.clocks.length)} />
              <PinSummaryPill label="Constraints" value={`.${selectedBoard.constraintsFile}`} />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                paddingRight: "4px",
              }}
            >
              {resourceGroups.map((group) => (
                <div key={group.title} className="pin-group-card">
                  <div className="pin-group-header">
                    <div>
                      <div className="pin-group-title">{group.title}</div>
                      <div className="pin-group-detail">{group.detail}</div>
                    </div>
                    <span className="pin-group-count">{group.pins.length}</span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                      gap: "8px",
                    }}
                  >
                    {group.pins.map((pin) => {
                      const color = getPinTypeColor(pin.type);

                      return (
                        <div key={pin.key} className="pin-tile">
                          <span
                            className="pin-tile-symbol"
                            style={{
                              background: color.background,
                              color: color.color,
                            }}
                          >
                            {pin.symbol}
                          </span>
                          <span className="pin-tile-pin" title={pin.pin}>
                            {pin.pin}
                          </span>
                          <span className="pin-tile-detail" title={pin.detail ?? pin.name}>
                            {pin.detail ?? pin.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="dashboard-glass-card"
            style={{
              borderRadius: "16px",
              padding: "48px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              color: "#64748b",
              textAlign: "center",
              minHeight: "300px",
            }}
          >
            <MapIcon size={40} strokeWidth={1.5} />
            <div
              style={{
                fontSize: "18px",
                fontWeight: 850,
                color: "#334155",
              }}
            >
              Select a board to view its pin mapping
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                lineHeight: 1.45,
                maxWidth: "400px",
              }}
            >
              Choose a board from the list on the left to see all available I/O pins,
              clocks, and board resources.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

type PinBrowserResourceGroup = {
  title: string;
  detail: string;
  pins: Array<{
    key: string;
    name: string;
    pin: string;
    type: string;
    symbol: string;
    detail?: string;
  }>;
};

function getResourceGroupsForBrowser(board: ReturnType<typeof getBoardById> & object): PinBrowserResourceGroup[] {
  const groups = new Map<string, PinBrowserResourceGroup>();

  function addPin(groupTitle: string, groupDetail: string, pin: PinBrowserResourceGroup["pins"][number]) {
    const group = groups.get(groupTitle) ?? {
      title: groupTitle,
      detail: groupDetail,
      pins: [],
    };

    group.pins.push(pin);
    groups.set(groupTitle, group);
  }

  board.clocks
    .filter((clock) => clock.pin)
    .forEach((clock) =>
      addPin("Clocks", "Clock sources", {
        key: `clock:${clock.name}`,
        name: clock.name,
        pin: clock.pin ?? "",
        type: "clock",
        symbol: "CLK",
        detail: `${Math.round(clock.frequency / 1_000_000)} MHz`,
      })
    );

  board.pins.forEach((pin) => {
    const title = getResourceGroupTitle(pin);
    addPin(title, pin.group ?? getPinTypeLabel(pin.type), {
      key: `pin:${pin.name}:${pin.pin}`,
      name: pin.name,
      pin: pin.pin,
      type: pin.type,
      symbol: getResourceSymbol(pin),
      detail: pin.signal ?? pin.group ?? pin.name,
    });
  });

  return Array.from(groups.values()).sort((a, b) => getResourceOrder(a.title) - getResourceOrder(b.title));
}

function getResourceGroupTitle(pin: { type: string; group?: string; signal?: string }) {
  if (pin.type === "led") return "LEDs";
  if (pin.type === "button") return "Buttons / Reset";
  if (pin.type === "uart") return "UART";
  if (pin.type === "spi" || pin.type === "flash") return "SPI / Flash";
  if (pin.type === "i2c") return "I2C";
  if (pin.group?.toLowerCase().includes("usb") || pin.signal?.toLowerCase().includes("usb")) {
    return "USB / Special";
  }
  if (pin.type === "gpio") return pin.group ?? "GPIO";
  return pin.group ?? "Other";
}

function getResourceOrder(title: string) {
  const order = [
    "Clocks",
    "LEDs",
    "Buttons / Reset",
    "UART",
    "SPI / Flash",
    "I2C",
    "GPIO",
    "USB / Special",
  ];

  const index = order.indexOf(title);
  return index === -1 ? 100 : index;
}

function getResourceSymbol(pin: { type: string; activeLow?: boolean; group?: string; signal?: string }) {
  if (pin.type === "clock") return "CLK";
  if (pin.type === "led") return "LED";
  if (pin.type === "button") return pin.activeLow ? "RST" : "BTN";
  if (pin.type === "uart") return "URT";
  if (pin.type === "spi" || pin.type === "flash") return "SPI";
  if (pin.type === "i2c") return "I2C";
  if (pin.group?.toLowerCase().includes("usb") || pin.signal?.toLowerCase().includes("usb")) {
    return "USB";
  }
  if (pin.type === "gpio") return "IO";
  return "PIN";
}

function getPinTypeLabel(type: string) {
  if (type === "led") return "User outputs";
  if (type === "button") return "User inputs";
  if (type === "uart") return "Serial";
  if (type === "spi" || type === "flash") return "Serial bus";
  if (type === "i2c") return "Two-wire bus";
  if (type === "gpio") return "General I/O";
  return "Board resources";
}

function getPinTypeColor(type: string) {
  if (type === "clock") return { background: "#eff6ff", color: "#2563eb" };
  if (type === "led") return { background: "#fef3c7", color: "#b45309" };
  if (type === "button") return { background: "#fee2e2", color: "#b91c1c" };
  if (type === "uart" || type === "spi" || type === "flash" || type === "i2c") {
    return { background: "#f0fdf4", color: "#15803d" };
  }
  if (type === "unknown") return { background: "#f5f3ff", color: "#6d28d9" };
  return { background: "#f8fafc", color: "#475569" };
}

function PinSummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="pin-summary-pill">
      <div className="pin-summary-pill-label">{label}</div>
      <div className="pin-summary-pill-value">{value}</div>
    </div>
  );
}

function RailButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={{
        width: "42px",
        height: "42px",
        border: "none",
        borderRadius: "12px",
        background: active ? "#eff6ff" : "transparent",
        color: active ? "#2563eb" : "#64748b",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SettingsModal({
  settings,
  onChange,
  onClose,
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}) {
  function updateSetting<Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key]
  ) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="variant-modal"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "640px" }}
      >
        <div className="variant-modal-header">
          <h2>Settings</h2>
          <button onClick={onClose}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <SettingSelect label="Theme" value={settings.theme} onChange={(value) => updateSetting("theme", value as AppSettings["theme"])} options={["light", "ice", "solar", "dark", "black-ice"]} />
          <SettingSelect label="Default HDL" value={settings.defaultLanguage} onChange={(value) => updateSetting("defaultLanguage", value as AppSettings["defaultLanguage"])} options={["Verilog", "SystemVerilog", "VHDL"]} />
          <SettingSelect label="Default Project Name" value={settings.defaultProjectNamePattern} onChange={(value) => updateSetting("defaultProjectNamePattern", value as AppSettings["defaultProjectNamePattern"])} options={["my_fpga_project", "{board}_project"]} />
          <SettingSelect label="Auto-save Interval" value={settings.autoSaveInterval} onChange={(value) => updateSetting("autoSaveInterval", value as AppSettings["autoSaveInterval"])} options={["immediate", "5s", "30s"]} />
          <SettingNumber label="Editor Font Size" value={settings.editorFontSize} min={11} max={24} onChange={(value) => updateSetting("editorFontSize", value)} />
          <SettingNumber label="Editor Tab Size" value={settings.editorTabSize} min={2} max={8} onChange={(value) => updateSetting("editorTabSize", value)} />
          <SettingSelect label="Pin Mapping Mode" value={settings.defaultPinMappingMode} onChange={(value) => updateSetting("defaultPinMappingMode", value as AppSettings["defaultPinMappingMode"])} options={["simple", "advanced"]} />
          <SettingNumber label="Recent Projects Limit" value={settings.recentProjectsLimit} min={1} max={12} onChange={(value) => updateSetting("recentProjectsLimit", value)} />
          <SettingToggle label="Auto-save" checked={settings.autoSave} onChange={(value) => updateSetting("autoSave", value)} />
          <SettingToggle label="Editor Word Wrap" checked={settings.editorWordWrap} onChange={(value) => updateSetting("editorWordWrap", value)} />
          <SettingToggle label="Confirm Delete" checked={settings.confirmBeforeDelete} onChange={(value) => updateSetting("confirmBeforeDelete", value)} />
        </div>
      </div>
    </div>
  );
}

function SettingSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="setting-field">
      {label}
      <select className="setting-control" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{formatSettingOption(option)}</option>
        ))}
      </select>
    </label>
  );
}

function SettingNumber({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting-field">
      {label}
      <input className="setting-control" type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="setting-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function formatSettingOption(option: string) {
  if (option === "light") return "Light";
  if (option === "ice") return "Ice";
  if (option === "solar") return "Solar";
  if (option === "dark") return "Dark";
  if (option === "black-ice") return "Black Ice";
  if (option === "immediate") return "Immediate";
  if (option === "simple") return "Simple";
  if (option === "advanced") return "Advanced";
  if (option === "board-default") return "Board Default";
  if (option === "my_fpga_project") return "my_fpga_project";
  if (option === "{board}_project") return "{board}_project";
  return option;
}