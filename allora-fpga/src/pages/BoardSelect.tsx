import { BOARDS, getBoardById } from "../data/boards";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Cpu, FolderClock, Home, Settings } from "lucide-react";
import { formatProjectTime, getSavedProjects } from "../data/projects";
import type { AppSettings } from "../data/settings";

type VariantBoard = Extract<(typeof BOARDS)[number], { variants: unknown }>;

type BoardSelectProps = {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onSelectBoard: (boardId: string) => void;
  onOpenProject: (projectId: string) => void;
};

function getBoardSummary(board: (typeof BOARDS)[number]) {
  if ("variants" in board) {
    if (board.id === "arty-a7") {
      return [board.vendor, "Artix-7", "XC7AxxT", "CSG324-1L"];
    }

    if (board.id === "tinyfpga") {
      return [board.vendor, "iCE40 LP", board.device, "CM81"];
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

const boardCount = BOARDS.length;

function getRecentProjectBoardName(boardId: string) {
  return getBoardById(boardId)?.name ?? boardId;
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
  const newProjectRef = useRef<HTMLElement | null>(null);
  const recentProjects = getSavedProjects().slice(0, settings.recentProjectsLimit);

  function selectBoard(board: (typeof BOARDS)[number]) {
    setShowAvailableBoards(false);

    if ("variants" in board) {
      setSelectedVariantBoard(board);
      return;
    }

    onSelectBoard(board.id);
  }

  return (
    <div
      onClick={() => setShowAvailableBoards(false)}
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
                {boardCount} boards available
                <ChevronDown size={14} />
              </button>

              {showAvailableBoards && (
                <div
                  style={{
                    position: "absolute",
                    top: "42px",
                    right: 0,
                    width: "280px",
                    border: "1px solid #dbe4f0",
                    borderRadius: "14px",
                    background: "#ffffff",
                    boxShadow: "0 18px 40px rgba(15,23,42,0.14)",
                    padding: "8px",
                    zIndex: 10,
                  }}
                >
                  {BOARDS.map((board) => (
                    <button
                      key={board.id}
                      type="button"
                      onClick={() => selectBoard(board)}
                      style={{
                        width: "100%",
                        border: "none",
                        borderRadius: "10px",
                        background: "transparent",
                        padding: "11px 12px",
                        textAlign: "left",
                        cursor: "pointer",
                        color: "#0f172a",
                        fontSize: "14px",
                        fontWeight: 850,
                      }}
                    >
                      {board.name}
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "16px",
              }}
            >
              {BOARDS.map((board) => (
                <button
                  className="board-card"
                  key={board.id}
                  onClick={() => selectBoard(board)}
                  style={{
                    border: "1px solid #dbe4f0",
                    borderRadius: "14px",
                    padding: "22px",
                    background: "#ffffff",
                    cursor: "pointer",
                    textAlign: "left",
                    boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
                    minHeight: "150px",
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "10px",
                      background: "#eff6ff",
                      color: "#2563eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: "18px",
                    }}
                  >
                    <Cpu size={18} />
                  </div>

                  <h3
                    style={{
                      margin: 0,
                      fontSize: "24px",
                      color: "#0f172a",
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {board.name}
                  </h3>

                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: "13px",
                      color: "#64748b",
                      fontWeight: 750,
                      lineHeight: 1.5,
                    }}
                  >
                    {getBoardSummary(board).join(" · ")}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <aside
            style={{
              border: "1px solid #dbe4f0",
              borderRadius: "16px",
              background: "#ffffff",
              boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
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
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onOpenProject(project.id)}
                    style={{
                      width: "100%",
                      border: "none",
                      borderRadius: "12px",
                      background: "transparent",
                      padding: "12px",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        color: "#0f172a",
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
                      style={{
                        marginTop: "4px",
                        color: "#64748b",
                        fontSize: "12px",
                        fontWeight: 750,
                        lineHeight: 1.45,
                      }}
                    >
                      {getRecentProjectBoardName(project.boardId)}
                      <br />
                      Last saved {formatProjectTime(project.updatedAt)} · {project.files.length} files
                    </div>
                  </button>
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
          <SettingSelect label="Theme" value={settings.theme} onChange={(value) => updateSetting("theme", value as AppSettings["theme"])} options={["light", "dark"]} />
          <SettingSelect label="Default HDL" value={settings.defaultLanguage} onChange={(value) => updateSetting("defaultLanguage", value as AppSettings["defaultLanguage"])} options={["Verilog", "SystemVerilog", "VHDL"]} />
          <SettingSelect label="Project Name" value={settings.defaultProjectNamePattern} onChange={(value) => updateSetting("defaultProjectNamePattern", value as AppSettings["defaultProjectNamePattern"])} options={["my_fpga_project", "{board}_project"]} />
          <SettingSelect label="Auto-save Interval" value={settings.autoSaveInterval} onChange={(value) => updateSetting("autoSaveInterval", value as AppSettings["autoSaveInterval"])} options={["immediate", "5s", "30s"]} />
          <SettingNumber label="Editor Font Size" value={settings.editorFontSize} min={11} max={24} onChange={(value) => updateSetting("editorFontSize", value)} />
          <SettingNumber label="Editor Tab Size" value={settings.editorTabSize} min={2} max={8} onChange={(value) => updateSetting("editorTabSize", value)} />
          <SettingSelect label="Pin Mapping Mode" value={settings.defaultPinMappingMode} onChange={(value) => updateSetting("defaultPinMappingMode", value as AppSettings["defaultPinMappingMode"])} options={["simple", "advanced"]} />
          <SettingNumber label="Recent Projects Limit" value={settings.recentProjectsLimit} min={1} max={12} onChange={(value) => updateSetting("recentProjectsLimit", value)} />
          <SettingToggle label="Auto-save" checked={settings.autoSave} onChange={(value) => updateSetting("autoSave", value)} />
          <SettingToggle label="Editor Word Wrap" checked={settings.editorWordWrap} onChange={(value) => updateSetting("editorWordWrap", value)} />
          <SettingToggle label="Confirm Delete" checked={settings.confirmBeforeDelete} onChange={(value) => updateSetting("confirmBeforeDelete", value)} />
          <SettingSelect label="Synthesis Flow" value={settings.defaultSynthesisFlow} onChange={() => updateSetting("defaultSynthesisFlow", "board-default")} options={["board-default"]} />
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
    <label style={{ display: "grid", gap: "7px", fontWeight: 800, color: "#334155" }}>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} style={settingControlStyle}>
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
    <label style={{ display: "grid", gap: "7px", fontWeight: 800, color: "#334155" }}>
      {label}
      <input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} style={settingControlStyle} />
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
    <label style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 800, color: "#334155" }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

const settingControlStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  background: "#ffffff",
  color: "#0f172a",
  padding: "11px 12px",
  fontSize: "14px",
  fontWeight: 750,
};

function formatSettingOption(option: string) {
  if (option === "light") return "Light";
  if (option === "dark") return "Dark";
  if (option === "immediate") return "Immediate";
  if (option === "simple") return "Simple";
  if (option === "advanced") return "Advanced";
  if (option === "board-default") return "Board Default";
  if (option === "my_fpga_project") return "my_fpga_project";
  if (option === "{board}_project") return "{board}_project";
  return option;
}
