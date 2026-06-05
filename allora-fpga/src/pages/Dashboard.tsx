import { useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { BoardDefinition } from "../data/boards";

type DashboardSection =
  | "editor"
  | "board"
  | "constraints"
  | "synthesis"
  | "bitstream";

type DashboardProps = {
  board: BoardDefinition;
  projectName: string;
  language: string;
  onBack: () => void;
};

type ProjectFile = {
  name: string;
  content: string;
};

export default function Dashboard({
  board,
  projectName,
  language,
  onBack,
}: DashboardProps) {
  const [activeSection, setActiveSection] =
    useState<DashboardSection>("editor");

  const [files, setFiles] = useState<ProjectFile[]>([
    {
      name: "top.v",
      content: `module top(
  input wire clk,
  output reg led
);

always @(posedge clk) begin
  led <= ~led;
end

endmodule`,
    },
  ]);

  const [activeFileName, setActiveFileName] = useState("top.v");

  const [sidebarWidth, setSidebarWidth] = useState(240);

function startSidebarResize(event: React.MouseEvent<HTMLDivElement>) {
  event.preventDefault();

  function handleMouseMove(moveEvent: MouseEvent) {
    const nextWidth = Math.min(Math.max(moveEvent.clientX, 190), 280);
    setSidebarWidth(nextWidth);
  }

  function handleMouseUp() {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }

  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
}

  const activeFile = files.find((file) => file.name === activeFileName);

  function updateActiveFile(content: string) {
    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.name === activeFileName ? { ...file, content } : file
      )
    );
  }

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    selectedFiles.forEach((file) => {
      const allowed =
        file.name.endsWith(".v") ||
        file.name.endsWith(".sv") ||
        file.name.endsWith(".vhd") ||
        file.name.endsWith(".vhdl");

      if (!allowed) return;

      const reader = new FileReader();

      reader.onload = () => {
        const content = String(reader.result ?? "");

        setFiles((currentFiles) => {
          const alreadyExists = currentFiles.some((f) => f.name === file.name);

          if (alreadyExists) {
            return currentFiles.map((f) =>
              f.name === file.name ? { ...f, content } : f
            );
          }

          return [...currentFiles, { name: file.name, content }];
        });

        setActiveFileName(file.name);
        setActiveSection("editor");
      };

      reader.readAsText(file);
    });

    event.target.value = "";
  }

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
        width: `${sidebarWidth}px`,
        minWidth: "190px",
        maxWidth: "280px",
        position: "relative",
        boxShadow: "8px 0 30px rgba(15, 23, 42, 0.04)",
          background: "#ffffff",
          borderRight: "1px solid rgba(148, 163, 184, 0.28)",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "26px" }}>
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
            label="Editor"
            active={activeSection === "editor"}
            onClick={() => setActiveSection("editor")}
          />
          <SidebarButton
            label="Board"
            active={activeSection === "board"}
            onClick={() => setActiveSection("board")}
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

        <div
          style={{
            marginTop: "28px",
            paddingTop: "22px",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              marginBottom: "12px",
              color: "#64748b",
              fontSize: "12px",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Files
          </div>

          <label
            style={{
              display: "block",
              marginBottom: "12px",
              padding: "12px 14px",
              borderRadius: "14px",
              background: "#2563eb",
              color: "#ffffff",
              fontWeight: 800,
              textAlign: "center",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Import HDL
            <input
              type="file"
              multiple
              accept=".v,.sv,.vhd,.vhdl"
              onChange={importFiles}
              style={{ display: "none" }}
            />
          </label>

          {files.map((file) => (
            <button
              key={file.name}
              onClick={() => {
                setActiveFileName(file.name);
                setActiveSection("editor");
              }}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "none",
                background:
                  activeSection === "editor" && file.name === activeFileName
                    ? "#eef2ff"
                    : "transparent",
                color:
                  activeSection === "editor" && file.name === activeFileName
                    ? "#2563eb"
                    : "#475569",
                fontSize: "14px",
                fontWeight: 800,
                textAlign: "left",
                cursor: "pointer",
                marginTop: "6px",
              }}
            >
              📄 {file.name}
            </button>
          ))}
        </div>

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

        <div
        onMouseDown={startSidebarResize}
        style={{
            position: "absolute",
            top: 0,
            right: "-5px",
            width: "10px",
            height: "100%",
            cursor: "col-resize",
            background: "transparent",
        }}
        >
        <div
            style={{
            position: "absolute",
            top: "18px",
            bottom: "18px",
            left: "4px",
            width: "2px",
            borderRadius: "999px",
            background:
                "linear-gradient(to bottom, transparent, #cbd5e1, transparent)",
            }}
        />
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          padding: activeSection === "editor" ? "24px" : "40px",
          overflowY: "auto",
        }}
      >
        {activeSection === "editor" && (
          <EditorSection
            activeFile={activeFile}
            updateActiveFile={updateActiveFile}
            language={language}
          />
        )}

        {activeSection !== "editor" && (
          <div style={{ width: "100%" }}>
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
              {activeSection === "board" && <BoardSection board={board} />}

              {activeSection === "constraints" && (
                <ConstraintsSection board={board} />
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
        )}
      </main>
    </div>
  );
}

function EditorSection({
  activeFile,
  updateActiveFile,
  language,
}: {
  activeFile: ProjectFile | undefined;
  updateActiveFile: (content: string) => void;
  language: string;
}) {
  return (
    <div
      style={{
        height: "calc(100vh - 48px)",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "22px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 18px 40px rgba(15,23,42,0.16)",
      }}
    >
      <div
        style={{
          height: "52px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "#f8fafc",
        color: "#0f172a",
        borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div style={{ fontWeight: 800 }}>{activeFile?.name ?? "No file selected"}</div>
        <div style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
          {language}
        </div>
      </div>

      <textarea
        value={activeFile?.content ?? ""}
        onChange={(e) => updateActiveFile(e.target.value)}
        spellCheck={false}
        style={{
          width: "100%",
          flex: 1,
          resize: "none",
          border: "none",
          padding: "24px",
          background: "#ffffff",
          color: "#0f172a",
          fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
          fontSize: "15px",
          lineHeight: 1.7,
          outline: "none",
        }}
      />
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

function ConstraintsSection({ board }: { board: BoardDefinition }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "22px",
      }}
    >
      <InfoCard title="Constraint Summary">
        <InfoRow label="Format" value={board.constraintsFile.toUpperCase()} />
        <InfoRow label="Clock Pins" value={String(board.clocks.length)} />
        <InfoRow label="LED Pins" value={String(board.leds.length)} />
        <InfoRow label="Button Pins" value={String(board.buttons.length)} />
      </InfoCard>

      <InfoCard title="Generated File">
        <InfoRow label="Filename" value={`constraints.${board.constraintsFile}`} />
        <InfoRow label="Source" value="Board database" />
      </InfoCard>

      <PinGroup title="Clocks" pins={board.clocks} />
      <PinGroup title="LEDs" pins={board.leds} />
      <PinGroup title="Buttons" pins={board.buttons} />
    </div>
  );
}

function PinGroup({
  title,
  pins,
}: {
  title: string;
  pins: Array<{ name: string; pin?: string; activeLow?: boolean }>;
}) {
  return (
    <InfoCard title={title}>
      {pins.length === 0 ? (
        <p style={{ margin: 0, color: "#64748b", fontSize: "16px" }}>
          No pins defined yet.
        </p>
      ) : (
        pins.map((pin) => (
          <div
            key={pin.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 0",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: "16px" }}>
                {pin.name}
              </div>
              {pin.activeLow && (
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "13px",
                    color: "#64748b",
                    fontWeight: 700,
                  }}
                >
                  Active low
                </div>
              )}
            </div>

            <div
              style={{
                padding: "7px 11px",
                borderRadius: "999px",
                background: "#f1f5f9",
                color: "#0f172a",
                fontWeight: 800,
                fontSize: "14px",
              }}
            >
              {pin.pin}
            </div>
          </div>
        ))
      )}
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
  children: ReactNode;
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

function getSectionTitle(section: DashboardSection) {
  if (section === "board") return "Board";
  if (section === "constraints") return "Constraints";
  if (section === "synthesis") return "Synthesis";
  if (section === "bitstream") return "Bitstream";
  return "Editor";
}

function formatSynthesisFlow(flow: string) {
  if (flow === "yosys-nextpnr") return "Yosys + NextPNR";
  if (flow === "gowin") return "Gowin";
  if (flow === "vivado") return "Vivado";
  if (flow === "quartus") return "Quartus";
  return flow;
}