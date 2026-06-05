import { useMemo, useState } from "react";
import type { BoardDefinition } from "../../data/boards";
import InfoCard, { InfoRow } from "./InfoCard";
import { formatSynthesisFlow } from "./format";
import type { ProjectFile } from "./types";

type SynthesisStatus = "idle" | "ready" | "blocked";

type SynthesisSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
};

export default function SynthesisSection({
  board,
  files,
  projectName,
}: SynthesisSectionProps) {
  const [log, setLog] = useState<string[]>([]);

  const hdlFiles = files.filter((file) => isHdlFile(file.name));
  const topModule = useMemo(() => findTopModule(hdlFiles), [hdlFiles]);
  const status: SynthesisStatus = hdlFiles.length > 0 ? "ready" : "blocked";
  const outputName = sanitizeName(projectName || "allora_project");
  const yosysScript = createYosysScript(board, hdlFiles, topModule, outputName);

  function runSynthesisCheck() {
    if (status === "blocked") {
      setLog([
        "[synthesis] Blocked",
        "No HDL files found. Create or import a .v, .sv, .vhd, or .vhdl file first.",
      ]);
      return;
    }

    setLog([
      "[synthesis] Preparing synthesis run",
      `Target board: ${board.name}`,
      `Device: ${board.fpgaId}`,
      `Flow: ${formatSynthesisFlow(board.synthesisFlow)}`,
      `Input files: ${hdlFiles.map((file) => file.name).join(", ")}`,
      `Top module: ${topModule ?? "not detected, using auto-top"}`,
      "",
      "Generated Yosys command:",
      `${board.toolchain.synth} -q -s synth.ys`,
      "",
      "Generated synth.ys:",
      yosysScript,
      "",
      "Ready to hand off to a local tool runner.",
    ]);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 205px",
        gap: "22px",
        alignItems: "start",
        minWidth: 0,
      }}
    >
      <InfoCard
        title="Synthesis"
      >
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "16px",
            lineHeight: 1.55,
          }}
        >
          Prepare the selected HDL files for the board synthesis flow.
        </p>

        <button
          className="primary-action"
          type="button"
          onClick={runSynthesisCheck}
          style={{
            marginTop: "24px",
            border: "none",
            borderRadius: "14px",
            background: status === "ready" ? "#2563eb" : "#cbd5e1",
            color: "#ffffff",
            padding: "13px 18px",
            fontSize: "15px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Run Synthesis Check
        </button>

        <div
          style={{
            marginTop: "24px",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            background: "#f8fafc",
            color: "#334155",
            minHeight: "300px",
            padding: "18px",
            fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
            fontSize: "13px",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            overflow: "auto",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
          }}
        >
          {log.length > 0
            ? log.join("\n")
            : "Synthesis output will appear here."}
        </div>
      </InfoCard>

      <div
        style={{
          display: "grid",
          gap: "22px",
          minWidth: 0,
        }}
      >
        <InfoCard title="Target" style={{ padding: "20px", borderRadius: "20px" }}>
          <InfoRow label="Board" value={board.name} />
          <InfoRow label="Device" value={board.fpgaId} />
          <InfoRow label="Flow" value={formatSynthesisFlow(board.synthesisFlow)} />
          <InfoRow label="Synth Tool" value={board.toolchain.synth} />
        </InfoCard>

        <InfoCard title="Inputs" style={{ padding: "20px", borderRadius: "20px" }}>
          <InfoRow label="HDL Files" value={String(hdlFiles.length)} />
          <InfoRow label="Top Module" value={topModule ?? "Auto detect"} />
          <InfoRow label="Output Netlist" value={`${outputName}.json`} />
        </InfoCard>
      </div>
    </div>
  );
}

function isHdlFile(fileName: string) {
  return (
    fileName.endsWith(".v") ||
    fileName.endsWith(".sv") ||
    fileName.endsWith(".vhd") ||
    fileName.endsWith(".vhdl")
  );
}

function findTopModule(files: ProjectFile[]) {
  for (const file of files) {
    const match = file.content.match(/\bmodule\s+([a-zA-Z_][a-zA-Z0-9_$]*)/);
    if (match) return match[1];
  }

  return null;
}

function sanitizeName(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "allora_project";
}

function createYosysScript(
  board: BoardDefinition,
  files: ProjectFile[],
  topModule: string | null,
  outputName: string
) {
  const synthCommand = board.family.toLowerCase().includes("ice40")
    ? "synth_ice40"
    : "synth_ecp5";

  const readCommands = files.map((file) => {
    if (file.name.endsWith(".vhd") || file.name.endsWith(".vhdl")) {
      return `ghdl ${file.name} -e ${topModule ?? "top"}`;
    }

    return `read_verilog ${file.name}`;
  });

  return [
    ...readCommands,
    topModule
      ? `${synthCommand} -top ${topModule} -json ${outputName}.json`
      : `${synthCommand} -json ${outputName}.json`,
  ].join("\n");
}
