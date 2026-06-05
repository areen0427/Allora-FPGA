type Board = {
  id: string;
  name: string;
  fpga: string;
};

type DashboardProps = {
  board: Board;
  projectName: string;
  language: string;
  onBack: () => void;
};

export default function Dashboard({
  board,
  projectName,
  language,
  onBack,
}: DashboardProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "40px",
      }}
    >
      <button
        onClick={onBack}
        style={{
          border: "none",
          background: "transparent",
          color: "#2563eb",
          fontSize: "16px",
          fontWeight: 700,
          cursor: "pointer",
          marginBottom: "32px",
        }}
      >
        ← Back to setup
      </button>

      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "56px",
            fontWeight: 800,
            letterSpacing: "-0.05em",
          }}
        >
          {projectName || "Untitled Project"}
        </h1>

        <p
          style={{
            marginTop: "12px",
            fontSize: "20px",
            color: "#64748b",
          }}
        >
          {board.name} · {board.fpga}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "24px",
            marginTop: "42px",
          }}
        >
          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>Project</h2>
            <p style={labelStyle}>Name</p>
            <p style={valueStyle}>{projectName || "Untitled Project"}</p>

            <p style={labelStyle}>Language</p>
            <p style={valueStyle}>{language}</p>
          </div>

          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>Board</h2>
            <p style={labelStyle}>Board Name</p>
            <p style={valueStyle}>{board.name}</p>

            <p style={labelStyle}>FPGA Device</p>
            <p style={valueStyle}>{board.fpga}</p>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: "24px" }}>
          <h2 style={cardTitleStyle}>Files</h2>

          <div style={fileRowStyle}>top.v</div>
          <div style={fileRowStyle}>constraints.pcf</div>
          <div style={fileRowStyle}>README.md</div>
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "24px",
  padding: "30px",
  boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
};

const cardTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: "24px",
  fontSize: "26px",
};

const labelStyle: React.CSSProperties = {
  margin: 0,
  marginTop: "18px",
  fontSize: "14px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const valueStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: "20px",
  fontWeight: 700,
};

const fileRowStyle: React.CSSProperties = {
  padding: "16px 18px",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  marginTop: "12px",
  fontSize: "17px",
  fontWeight: 600,
  background: "#f8fafc",
};