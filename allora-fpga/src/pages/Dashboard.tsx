import { useState } from "react";
import type { BoardDefinition } from "../data/boards";

type DashboardSection =
  | "overview"
  | "board"
  | "files"
  | "constraints"
  | "synthesis"
  | "bitstream";

type DashboardProps = {
  board: BoardDefinition;
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
  const [activeSection, setActiveSection] =
    useState<DashboardSection>("overview");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
      }}
    >
      <aside
        style={{
          width: "280px",
          background: "#ffffff",
          borderRight: "1px solid #e2e8f0",
          padding: "28px 20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "32px" }}>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            Allora FPGA
          </div>

          <div
            style={{
              marginTop: "6px",
              color: "#64748b",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {projectName || "Untitled Project"}
          </div>
        </div>

        <nav style={{ display: "grid", gap: "8px" }}>
          <SidebarButton
            label="Overview"
            active={activeSection === "overview"}
            onClick={() => setActiveSection("overview")}
          />
          <SidebarButton
            label="Board"
            active={activeSection === "board"}
            onClick={() => setActiveSection("board")}
          />
          <SidebarButton
            label="Files"
            active={activeSection === "files"}
            onClick={() => setActiveSection("files")}
          />
          <SidebarButton
            label="Constraints"
            active={activeSection === "constraints"}
            onClick={() => setActiveSection("constraints")}
          />
          <SidebarButton
            label="Synthesis"
            active={activeSection === "synthesis"}
            onClick={() => setActiveSection("synthesis")}
          />
          <SidebarButton
            label="Bitstream"
            active={activeSection === "bitstream"}
            onClick={() => setActiveSection("bitstream")}
          />
        </nav>

        <button
          onClick={onBack}
          style={{
            marginTop: "auto",
            border: "1px solid #e2e8f0",
            background: "#ffffff",
            color: "#475569",
            borderRadius: "14px",
            padding: "13px 14px",
            fontSize: "15px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ← Back to setup
        </button>
      </aside>

      <main
        style={{
          flex: 1,
          padding: "40px",
          overflowY: "auto",
        }}
      >
        <div style={{ maxWidth: "1100px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "48px",
              fontWeight: 850,
              letterSpacing: "-0.05em",
            }}
          >
            {getSectionTitle(activeSection)}
          </h1>

          <p
            style={{
              marginTop: "10px",
              fontSize: "18px",
              color: "#64748b",
            }}
          >
            {board.name} · {board.vendor} {board.device}
          </p>

          <div style={{ marginTop: "34px" }}>
            {activeSection === "overview" && (
              <OverviewSection
                board={board}
                projectName={projectName}
                language={language}
              />
            )}

            {activeSection === "board" && <BoardSection board={board} />}

            {activeSection === "files" && <FilesSection board={board} />}

            {activeSection === "constraints" && (
              <PlaceholderSection
                title="Constraint Generator"
                description="This will auto-generate pin constraint files based on the selected board."
              />
            )}

            {activeSection === "synthesis" && (
              <PlaceholderSection
                title="Synthesis"
                description="This will run the selected synthesis flow for this board."
              />
            )}

            {activeSection === "bitstream" && (
              <PlaceholderSection
                title="Bitstream"
                description="This will generate a programming bitstream for the target FPGA."
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function SidebarButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none",
        borderRadius: "14px",
        padding: "13px 14px",
        textAlign: "left",
        fontSize: "15px",
        fontWeight: 800,
        cursor: "pointer",
        background: active ? "#eef2ff" : "transparent",
        color: active ? "#2563eb" : "#475569",
      }}
    >
      {label}
    </button>
  );
}

function OverviewSection({
  board,
  projectName,
  language,
}: {
  board: BoardDefinition;
  projectName: string;
  language: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "22px",
      }}
    >
      <InfoCard title="Project">
        <InfoRow label="Name" value={projectName || "Untitled Project"} />
        <InfoRow label="Language" value={language} />
      </InfoCard>

      <InfoCard title="Target Board">
        <InfoRow label="Board" value={board.name} />
        <InfoRow label="Device" value={board.device} />
        <InfoRow label="Flow" value={formatSynthesisFlow(board.synthesisFlow)} />
      </InfoCard>
    </div>
  );
}

function BoardSection({ board }: { board: BoardDefinition }) {
  return (
    <InfoCard title="Board Information">
      <InfoRow label="Vendor" value={board.vendor} />
      <InfoRow label="Family" value={board.family} />
      <InfoRow label="Device" value={board.device} />
      <InfoRow label="Package" value={board.package} />
      <InfoRow label="Constraint Format" value={board.constraintsFile.toUpperCase()} />
      <InfoRow label="Synthesis Flow" value={formatSynthesisFlow(board.synthesisFlow)} />
    </InfoCard>
  );
}

function FilesSection({ board }: { board: BoardDefinition }) {
  return (
    <InfoCard title="Project Files">
      <FileRow name="top.v" />
      <FileRow name={`constraints.${board.constraintsFile}`} />
      <FileRow name="README.md" />
    </InfoCard>
  );
}

function PlaceholderSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <InfoCard title={title}>
      <p
        style={{
          margin: 0,
          color: "#64748b",
          fontSize: "17px",
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
    </InfoCard>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "24px",
        padding: "28px",
        boxShadow: "0 14px 34px rgba(15,23,42,0.06)",
      }}
    >
      <h2
        style={{
          margin: 0,
          marginBottom: "22px",
          fontSize: "24px",
          letterSpacing: "-0.03em",
        }}
      >
        {title}
      </h2>

      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: "18px" }}>
      <div
        style={{
          fontSize: "13px",
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: "5px",
          fontSize: "19px",
          fontWeight: 750,
          color: "#0f172a",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function FileRow({ name }: { name: string }) {
  return (
    <div
      style={{
        padding: "15px 16px",
        borderRadius: "14px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        fontSize: "16px",
        fontWeight: 700,
        marginTop: "12px",
      }}
    >
      {name}
    </div>
  );
}

function getSectionTitle(section: DashboardSection) {
  if (section === "overview") return "Overview";
  if (section === "board") return "Board";
  if (section === "files") return "Files";
  if (section === "constraints") return "Constraints";
  if (section === "synthesis") return "Synthesis";
  if (section === "bitstream") return "Bitstream";
  return "Dashboard";
}

function formatSynthesisFlow(flow: string) {
  if (flow === "yosys-nextpnr") return "Yosys + NextPNR";
  if (flow === "gowin") return "Gowin";
  if (flow === "vivado") return "Vivado";
  if (flow === "quartus") return "Quartus";
  return flow;
}