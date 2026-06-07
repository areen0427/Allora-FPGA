import { BOARDS, getBoardById } from "../data/boards";
import { getBoardCapabilities } from "../data/boardCapabilities";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Cpu, FolderClock, Home, Search, Settings } from "lucide-react";
import { formatProjectTime, getSavedProjects, removeSavedProject } from "../data/projects";
import type { AppSettings } from "../data/settings";

type VariantBoard = Extract<(typeof BOARDS)[number], { variants: unknown }>;

type BoardSelectProps = {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onSelectBoard: (boardId: string) => void;
  onOpenProject: (projectId: string) => void;
};

type BoardCardItem = (typeof BOARDS)[number];
type BoardSupportFilter = "all" | "supported" | "runner-needed";

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

    return [
      board.vendor,
      board.device,
      "LFE5U-xxF",
      "CABGA381",
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

const boardCount = BOARDS.reduce(
  (count, board) => count + ("variants" in board ? board.variants.length : 1),
  0
);

function getRecentProjectBoardName(boardId: string) {
  return getBoardById(boardId)?.name ?? boardId;
}

function isBuildSupported(board: BoardCardItem) {
  return getBoardDefinitions(board).some((boardDefinition) => {
    const capabilities = getBoardCapabilities(boardDefinition);
    return capabilities.synthesisDiagram.supported && capabilities.bitstream.supported;
  });
}

function getBoardFamilies(board: BoardCardItem) {
  const families = getBoardDefinitions(board).map((boardDefinition) => boardDefinition.family);
  return [...new Set(families)];
}

function getBoardSearchText(board: BoardCardItem) {
  const variantText = "variants" in board
    ? board.variants.map((variant) => `${variant.name} ${variant.fpga}`).join(" ")
    : "";
  const definitionsText = getBoardDefinitions(board)
    .map((boardDefinition) =>
      [
        boardDefinition.name,
        boardDefinition.vendor,
        boardDefinition.family,
        boardDefinition.device,
        boardDefinition.package,
        boardDefinition.fpgaId,
      ].join(" ")
    )
    .join(" ");

  return [board.name, board.vendor, board.device, variantText, definitionsText]
    .join(" ")
    .toLowerCase();
}

function getBoardSupportGroup(board: BoardCardItem) {
  return isBuildSupported(board) ? "Supported" : "Not Fully Supported";
}

function getBoardGroupDetail(group: string) {
  return group === "Not Fully Supported"
    ? "Synth + bitstream generation not supported yet"
    : "Synth + bitstream generation supported";
}

export default function BoardSelect({
  settings,
  onSettingsChange,
  onSelectBoard,
  onOpenProject,
}: BoardSelectProps) {
  const [selectedVariantBoard, setSelectedVariantBoard] =
    useState<VariantBoard | null>(null);
  const [showAvailableBoards, setShowAvailableBoards] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savedProjects, setSavedProjects] = useState(() => getSavedProjects());
  const [boardSearch, setBoardSearch] = useState("");
  const [supportFilter, setSupportFilter] = useState<BoardSupportFilter>("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [showAllBoards, setShowAllBoards] = useState(false);
  const [showFamilyMenu, setShowFamilyMenu] = useState(false);
  const newProjectRef = useRef<HTMLElement | null>(null);
  const recentProjects = savedProjects.slice(0, settings.recentProjectsLimit);
  const familyOptions = [...new Set(BOARDS.flatMap(getBoardFamilies))].sort();
  const normalizedBoardSearch = boardSearch.trim().toLowerCase();
  const filteredBoards = BOARDS
    .filter((board) => {
      if (normalizedBoardSearch && !getBoardSearchText(board).includes(normalizedBoardSearch)) {
        return false;
      }

      if (supportFilter === "supported" && !isBuildSupported(board)) {
        return false;
      }

      if (supportFilter === "runner-needed" && isBuildSupported(board)) {
        return false;
      }

      if (familyFilter !== "all" && !getBoardFamilies(board).includes(familyFilter)) {
        return false;
      }

      return true;
    })
    .sort((first, second) => {
      const supportDelta = Number(isBuildSupported(second)) - Number(isBuildSupported(first));
      return supportDelta || first.name.localeCompare(second.name);
    });
  const boardPreviewLimit = 8;
  const filtersActive =
    normalizedBoardSearch.length > 0 || supportFilter !== "all" || familyFilter !== "all";
  const visibleBoards = showAllBoards || filtersActive
    ? filteredBoards
    : filteredBoards.slice(0, boardPreviewLimit);
  const boardGroups = ["Supported", "Not Fully Supported"]
    .map((group) => ({
      group,
      boards: visibleBoards.filter((board) => getBoardSupportGroup(board) === group),
    }))
    .filter((group) => group.boards.length > 0);
  const selectedFamilyLabel = familyFilter === "all" ? "All families" : familyFilter;

  function selectBoard(board: (typeof BOARDS)[number]) {
    setShowAvailableBoards(false);
    setShowFamilyMenu(false);

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

  return (
    <div
      className="glass-page"
      onClick={() => {
        setShowAvailableBoards(false);
        setShowFamilyMenu(false);
      }}
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
          active
          label="Home"
          onClick={() => newProjectRef.current?.scrollIntoView({ behavior: "smooth" })}
        >
          <Home size={20} />
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
            maxWidth: "1280px",
          }}
        >
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

            <div
              onClick={(event) => event.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={() => setShowAvailableBoards((visible) => !visible)}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #dbe4f0",
                  borderRadius: "999px",
                  background: "#ffffff",
                  color: "#475569",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                }}
              >
                Boards
                <span className="board-count-pill">{boardCount}</span>
                <ChevronDown size={14} />
              </button>

              {showAvailableBoards && (
                <div
                  className="liquid-board-menu board-available-menu"
                  style={{
                    position: "absolute",
                    top: "42px",
                    right: 0,
                    width: "280px",
                    maxHeight: "420px",
                    overflowY: "auto",
                    zIndex: 10,
                  }}
                >
                  {BOARDS.map((board) => (
                    <button
                      className="liquid-board-option"
                      key={board.id}
                      type="button"
                      onClick={() => selectBoard(board)}
                    >
                      <span className="liquid-board-copy">
                        <span className="liquid-board-name">{board.name}</span>
                        <span className="liquid-board-meta">
                          {getBoardSummary(board).slice(0, 2).join(" · ")}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
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

            <div className="board-browser-controls">
              <label className="board-search-field">
                <Search size={15} />
                <input
                  value={boardSearch}
                  onChange={(event) => {
                    setBoardSearch(event.target.value);
                    setShowAllBoards(false);
                  }}
                  placeholder="Search boards"
                  type="search"
                />
              </label>

              <div className="board-filter-group" aria-label="Board support filter">
                {([
                  ["all", "All"],
                  ["supported", "Supported"],
                  ["runner-needed", "Not Fully Supported"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={supportFilter === value ? "active" : ""}
                    onClick={() => {
                      setSupportFilter(value);
                      setShowAllBoards(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div
                className="board-family-menu-wrap"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="board-family-trigger"
                  onClick={() => setShowFamilyMenu((visible) => !visible)}
                  aria-label="Board family filter"
                >
                  {selectedFamilyLabel}
                  <span className="board-count-pill board-family-filter-pill">
                    {familyFilter === "all" ? familyOptions.length : 1}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {showFamilyMenu ? (
                  <div className="liquid-board-menu board-family-menu">
                    {(["all", ...familyOptions] as const).map((family) => (
                      <button
                        key={family}
                        type="button"
                        className={`liquid-board-option board-family-option${
                          familyFilter === family ? " active" : ""
                        }`}
                        onClick={() => {
                          setFamilyFilter(family);
                          setShowAllBoards(false);
                          setShowFamilyMenu(false);
                        }}
                      >
                        <span className="liquid-board-copy">
                          <span className="liquid-board-name">
                            {family === "all" ? "All families" : family}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: "16px",
              }}
            >
              {boardGroups.length === 0 ? (
                <div className="board-empty-state">
                  No boards match the current filters.
                </div>
              ) : null}

              {boardGroups.map(({ group, boards }) => (
                <div className="board-group" key={group}>
                  <div className="board-group-heading">
                    <span>
                      {group}
                      <span className="board-heading-dot">·</span>
                      <span className="board-group-detail">{getBoardGroupDetail(group)}</span>
                    </span>
                    <span>{boards.length}</span>
                  </div>

                  <div className="board-grid">
                    {boards.map((board) => (
                        <button
                          className="board-card"
                          key={board.id}
                          onClick={() => selectBoard(board)}
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
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              flexShrink: 0,
                              borderRadius: "10px",
                              background: "#eff6ff",
                              color: "#2563eb",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginBottom: "14px",
                            }}
                          >
                            <Cpu size={17} />
                          </div>

                          <div className="board-card-title-row">
                            <h3
                              style={{
                                margin: 0,
                                fontSize: "17px",
                                color: "#0f172a",
                                fontWeight: 850,
                                lineHeight: 1.18,
                                flexShrink: 0,
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
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {filteredBoards.length > boardPreviewLimit && !filtersActive ? (
              <button
                type="button"
                className="board-show-more"
                onClick={() => setShowAllBoards((current) => !current)}
              >
                {showAllBoards
                  ? "Show Fewer Boards"
                  : `Show all ${filteredBoards.length} Boards`}
              </button>
            ) : null}

            {filtersActive ? (
              <button
                type="button"
                className="board-clear-filters"
                onClick={() => {
                  setBoardSearch("");
                  setSupportFilter("all");
                  setFamilyFilter("all");
                  setShowAllBoards(false);
                }}
              >
                Clear filters
              </button>
            ) : null}
          </section>

          <aside
            className="liquid-home-card recent-projects-card"
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              marginTop: "78px",
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
          <SettingSelect label="Theme" value={settings.theme} onChange={(value) => updateSetting("theme", value as AppSettings["theme"])} options={["light", "ice", "dark", "black-ice"]} />
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
