import { boards } from "../data/boards";

export default function BoardSelect() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%)",
        color: "#0f172a",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
        <div
            style={{
                width: "100%",
                maxWidth: "1400px",
                margin: "0 auto",
                padding: "0 40px",
            }}
        >
        <div style={{ textAlign: "center", marginBottom: "56px" }}>
          <div
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: "999px",
              background: "#e0f2fe",
              color: "#0369a1",
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "18px",
            }}
          >
            Allora FPGA
          </div>

          <h1
            style={{
              fontSize: "56px",
              lineHeight: 1,
              margin: 0,
              letterSpacing: "-0.05em",
              fontWeight: 800,
            }}
          >
            Choose your FPGA board
          </h1>

          <p
            style={{
              color: "#64748b",
              marginTop: "18px",
              fontSize: "20px",
            }}
          >
            Select a board to start a new hardware project.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(280px, 1fr))",
            gap: "24px",
          }}
        >
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => console.log(board.id)}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "24px",
                padding: "30px",
                background: "rgba(255, 255, 255, 0.85)",
                cursor: "pointer",
                textAlign: "left",
                boxShadow: "0 20px 40px rgba(15, 23, 42, 0.06)",
                minHeight: "160px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  marginBottom: "12px",
                  fontSize: "28px",
                  color: "#0f172a",
                  letterSpacing: "-0.03em",
                }}
              >
                {board.name}
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: "17px",
                }}
              >
                {board.fpga}
              </p>

              <p
                style={{
                  marginTop: "28px",
                  color: "#2563eb",
                  fontSize: "15px",
                  fontWeight: 600,
                }}
              >
                Select board →
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}