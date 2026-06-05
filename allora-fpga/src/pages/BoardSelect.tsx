import { boards } from "../data/boards";

type BoardSelectProps = {
  onSelectBoard: (boardId: string) => void;
};

export default function BoardSelect({ onSelectBoard }: BoardSelectProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1100px",
        }}
      >
        {/* Logo */}
        <div
            style={{
                height: "100px",
                overflow: "hidden",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: "10px",
            }}
            >
            <img
                src="/logo.png"
                alt="Allora FPGA"
                style={{
                height: "220px",
                width: "auto",
                }}
            />
        </div>

        {/* Header */}
        <div
          style={{
            textAlign: "center",
            marginBottom: "50px",
          }}
        >
          <h1
            style={{
              fontSize: "64px",
              fontWeight: 800,
              letterSpacing: "-0.05em",
              margin: 0,
              lineHeight: 1,
              color: "#0f172a",
            }}
          >
            Choose your FPGA board
          </h1>

          <p
            style={{
              marginTop: "18px",
              fontSize: "22px",
              color: "#64748b",
            }}
          >
            Select a board to start a new hardware project.
          </p>
        </div>

        {/* Board Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "24px",
          }}
        >
        {boards.map((board) => (
        <button
            className="board-card"
            key={board.id}
            onClick={() => onSelectBoard(board.id)}
            style={{
                border: "1px solid #e2e8f0",
                borderRadius: "24px",
                padding: "28px",
                background: "#ffffff",
                cursor: "pointer",
                textAlign: "center",
                boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
                height: "170px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "28px",
                  color: "#0f172a",
                  fontWeight: 700,
                }}
              >
                {board.name}
              </h2>

              <p
                style={{
                  marginTop: "12px",
                  fontSize: "18px",
                  color: "#64748b",
                }}
              >
                {board.fpga}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}