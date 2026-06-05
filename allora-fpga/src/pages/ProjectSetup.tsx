import { useState } from "react";

type Board = {
  id: string;
  name: string;
  fpga: string;
};

type ProjectSetupProps = {
  board: Board;
  onBack: () => void;
  onCreateProject: (
    projectName: string,
    language: string
  ) => void;
};

export default function ProjectSetup({
  board,
  onBack,
  onCreateProject,
}: ProjectSetupProps) {
  const [projectName, setProjectName] = useState("");
  const [language, setLanguage] = useState("Verilog");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "40px",
        boxSizing: "border-box",
      }}
    >
      <button
        onClick={onBack}
        style={{
          border: "none",
          background: "transparent",
          color: "#2563eb",
          fontSize: "16px",
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: "40px",
        }}
      >
        ← Back
      </button>

      <div
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "28px",
          padding: "40px",
          boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "44px",
            letterSpacing: "-0.04em",
          }}
        >
          Create new project
        </h1>

        <p
          style={{
            marginTop: "12px",
            fontSize: "18px",
            color: "#64748b",
          }}
        >
          {board.name} · {board.fpga}
        </p>

        <label style={{ display: "block", marginTop: "36px", fontWeight: 700 }}>
          Project name
        </label>

        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="my_fpga_project"
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "16px",
            borderRadius: "14px",
            border: "1px solid #cbd5e1",
            fontSize: "16px",
          }}
        />

        <label style={{ display: "block", marginTop: "24px", fontWeight: 700 }}>
          HDL language
        </label>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "16px",
            borderRadius: "14px",
            border: "1px solid #cbd5e1",
            fontSize: "16px",
            background: "#ffffff",
          }}
        >
          <option>Verilog</option>
          <option>SystemVerilog</option>
          <option>VHDL</option>
        </select>

        <button
          onClick={() =>
            onCreateProject(
                projectName,
                language
            )
        }
          style={{
            width: "100%",
            marginTop: "36px",
            padding: "18px",
            borderRadius: "16px",
            border: "none",
            background: "#2563eb",
            color: "#ffffff",
            fontSize: "17px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Create Project
        </button>
      </div>
    </div>
  );
}