import { BOARDS } from "../data/boards";
import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Cpu, FolderClock, Home, Settings } from "lucide-react";

type VariantBoard = Extract<(typeof BOARDS)[number], { variants: unknown }>;

type BoardSelectProps = {
  onSelectBoard: (boardId: string) => void;
};

function getBoardSummary(board: (typeof BOARDS)[number]) {
  if ("variants" in board) {
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

export default function BoardSelect({ onSelectBoard }: BoardSelectProps) {
  const [selectedVariantBoard, setSelectedVariantBoard] =
    useState<VariantBoard | null>(null);
  const [showAvailableBoards, setShowAvailableBoards] = useState(false);

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

        <RailButton active label="Home">
          <Home size={20} />
        </RailButton>

        <RailButton label="Recent">
          <FolderClock size={20} />
        </RailButton>

        <div style={{ flex: 1 }} />

        <RailButton label="Settings">
          <Settings size={20} />
        </RailButton>
      </aside>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "28px 36px 36px",
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
            maxWidth: "1180px",
          }}
        >
          <section>
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
                Pick a target board to create a hardware project.
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
              marginTop: "82px",
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
          </aside>
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
              <h2>Select ULX3S Variant</h2>

              <button
                onClick={() => setSelectedVariantBoard(null)}
              >
                ×
              </button>
            </div>

            <div className="variant-grid">
              <button
                className="variant-card"
                onClick={() => onSelectBoard("ulx3s-12f")}
              >
                <h3>ULX3S 12F</h3>
                <p>LFE5U-12F</p>
              </button>

              <button
                className="variant-card"
                onClick={() => onSelectBoard("ulx3s-25f")}
              >
                <h3>ULX3S 25F</h3>
                <p>LFE5U-25F</p>
              </button>

              <button
                className="variant-card"
                onClick={() => onSelectBoard("ulx3s-45f")}
              >
                <h3>ULX3S 45F</h3>
                <p>LFE5U-45F</p>
              </button>

              <button
                className="variant-card"
                onClick={() => onSelectBoard("ulx3s-85f")}
              >
                <h3>ULX3S 85F</h3>
                <p>LFE5U-85F</p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RailButton({
  active,
  label,
  children,
}: {
  active?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
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
