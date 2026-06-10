import { useState } from "react";
import type { BoardDefinition } from "../../data/boards";
import { getBoardCapabilities } from "../../data/boardCapabilities";
import { resolveBoardProgrammer } from "../../data/boardProgrammers";
import InfoCard, { InfoRow } from "./InfoCard";
import { hasTauriInvoke, invokeTauri } from "../../lib/tauri";
import type { ProjectFile } from "./types";

type ProgrammingSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
  projectPath?: string;
  topLevelFileName: string | null;
};

type ProgrammerStatus = {
  installed: boolean;
  versionOutput: string | null;
  toolPath: string | null;
  message: string;
};

type BoardConnectionStatus = {
  connected: boolean;
  details: string;
  usbDevices: string[];
};

type ProgramResult = {
  success: boolean;
  logs: string[];
  message: string;
};

export default function ProgrammingSection({
  board,
  files,
}: ProgrammingSectionProps) {
  const [programmerStatus, setProgrammerStatus] = useState<ProgrammerStatus | null>(null);
  const [boardStatus, setBoardStatus] = useState<BoardConnectionStatus | null>(null);
  const [isDetectingProgrammer, setIsDetectingProgrammer] = useState(false);
  const [isDetectingBoard, setIsDetectingBoard] = useState(false);
  const [isProgramming, setIsProgramming] = useState(false);
  const [programResult, setProgramResult] = useState<ProgramResult | null>(null);
  const [selectedBitstream, setSelectedBitstream] = useState<string>("");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  const capabilities = getBoardCapabilities(board);
  const programmer = resolveBoardProgrammer(board);
  const bitstreamFiles = files.filter((file) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    return ext && (programmer?.bitstreamExtensions ?? ["bin", "bit"]).includes(ext);
  });

  async function detectProgrammer() {
    if (!programmer || !hasTauriInvoke()) return;

    setIsDetectingProgrammer(true);
    try {
      const result = await invokeTauri<ProgrammerStatus>("detect_programmer", {
        request: { programmerCommand: programmer.command },
      });
      setProgrammerStatus(result);
    } catch {
      setProgrammerStatus({
        installed: false,
        versionOutput: null,
        toolPath: null,
        message: "Failed to detect programmer.",
      });
    } finally {
      setIsDetectingProgrammer(false);
    }
  }

  async function detectBoard() {
    if (!programmer || !hasTauriInvoke()) return;

    setIsDetectingBoard(true);
    try {
      const result = await invokeTauri<BoardConnectionStatus>("detect_connected_board", {
        request: {
          programmerCommand: programmer.command,
          usbVendorId: programmer.usbVendorId,
          usbProductId: programmer.usbProductId,
        },
      });
      setBoardStatus(result);
    } catch {
      setBoardStatus({
        connected: false,
        details: "Failed to detect connected boards.",
        usbDevices: [],
      });
    } finally {
      setIsDetectingBoard(false);
    }
  }

  async function handleProgramFpga() {
    if (!programmer || !selectedBitstream || !hasTauriInvoke()) return;

    const bitstreamFile = bitstreamFiles.find((f) => f.name === selectedBitstream);
    if (!bitstreamFile?.path) {
      setProgramResult({
        success: false,
        logs: [],
        message: "Bitstream file path is not available. Generate a bitstream first.",
      });
      return;
    }

    setIsProgramming(true);
    setProgramResult(null);
    setConsoleLogs(["[programming] Starting FPGA programming..."]);

    try {
      const result = await invokeTauri<ProgramResult>("program_fpga", {
        request: {
          programmerCommand: programmer.command,
          bitstreamPath: bitstreamFile.path,
          boardName: board.name,
          extraArgs: programmer.defaultArgs,
        },
      });

      setProgramResult(result);
      setConsoleLogs(result.logs);
    } catch (error) {
      const message = getErrorMessage(error);
      setProgramResult({
        success: false,
        logs: [`[programming] ${message}`],
        message,
      });
      setConsoleLogs([`[programming] ${message}`]);
    } finally {
      setIsProgramming(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 240px",
        gap: "22px",
        alignItems: "start",
        height: "calc(100vh - 48px)",
        boxSizing: "border-box",
        padding: "8px",
        margin: "-8px",
        minHeight: 0,
        overflow: "visible",
      }}
    >
      <InfoCard
        title="FPGA Programming"
        style={{
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "16px",
            lineHeight: 1.55,
          }}
        >
          Program a connected FPGA board directly with the generated bitstream.
        </p>

        <div style={{ display: "flex", gap: "10px", marginTop: "22px", flexWrap: "wrap" }}>
          <button
            className="primary-action"
            type="button"
            onClick={handleProgramFpga}
            disabled={!capabilities.programming.supported || bitstreamFiles.length === 0 || isProgramming || !selectedBitstream}
            style={{
              border: "none",
              borderRadius: "14px",
              background:
                capabilities.programming.supported && bitstreamFiles.length > 0 && !isProgramming && selectedBitstream
                  ? "#2563eb"
                  : "#cbd5e1",
              color: "#ffffff",
              padding: "13px 18px",
              fontSize: "15px",
              fontWeight: 800,
              cursor:
                capabilities.programming.supported && bitstreamFiles.length > 0 && !isProgramming && selectedBitstream
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            {isProgramming ? "Programming..." : "Program FPGA"}
          </button>

          <button
            type="button"
            onClick={detectProgrammer}
            disabled={!programmer || isDetectingProgrammer}
            style={{
              border: "1px solid #dbe4f0",
              borderRadius: "14px",
              background: "#ffffff",
              color: "#334155",
              padding: "13px 18px",
              fontSize: "15px",
              fontWeight: 800,
              cursor: programmer && !isDetectingProgrammer ? "pointer" : "not-allowed",
            }}
          >
            {isDetectingProgrammer ? "Checking..." : "Check Tool"}
          </button>

          <button
            type="button"
            onClick={detectBoard}
            disabled={!programmer || isDetectingBoard}
            style={{
              border: "1px solid #dbe4f0",
              borderRadius: "14px",
              background: "#ffffff",
              color: "#334155",
              padding: "13px 18px",
              fontSize: "15px",
              fontWeight: 800,
              cursor: programmer && !isDetectingBoard ? "pointer" : "not-allowed",
            }}
          >
            {isDetectingBoard ? "Scanning..." : "Detect Board"}
          </button>
        </div>

        {bitstreamFiles.length > 0 ? (
          <div style={{ marginTop: "16px" }}>
            <label
              style={{
                fontSize: "13px",
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Bitstream
            </label>
            <select
              value={selectedBitstream}
              onChange={(event) => setSelectedBitstream(event.target.value)}
              style={{
                marginTop: "6px",
                width: "100%",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                color: "#0f172a",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              {bitstreamFiles.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div
          style={{
            marginTop: "14px",
            padding: "12px 14px",
            borderRadius: "12px",
            background: programResult
              ? programResult.success
                ? "#f0fdf4"
                : "#fef2f2"
              : "#f8fafc",
            border: programResult
              ? programResult.success
                ? "1px solid #bbf7d0"
                : "1px solid #fecaca"
              : "1px solid #e2e8f0",
            color: programResult
              ? programResult.success
                ? "#166534"
                : "#b91c1c"
              : "#64748b",
            fontSize: "13px",
            lineHeight: 1.45,
          }}
        >
          {programResult
            ? programResult.message
            : capabilities.programming.supported
              ? "Ready to program the connected FPGA board with the selected bitstream."
              : capabilities.programming.detail}
        </div>

        <div
          style={{
            marginTop: "18px",
            minHeight: 0,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div
            className="dashboard-glass-card"
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              background: "#f8fafc",
              color: "#334155",
              minHeight: "150px",
              flex: consoleLogs.length ? "1 1 0" : "1 1 auto",
              padding: "18px",
              fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
              fontSize: "13px",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              overflow: "auto",
            }}
          >
            {consoleLogs.length
              ? consoleLogs.join("\n")
              : "No programming output yet.\n\nSelect a bitstream and click \"Program FPGA\" to begin."}
          </div>
        </div>
      </InfoCard>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          maxHeight: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <InfoCard title="Board" style={{ padding: "14px", borderRadius: "16px" }} compact>
          <InfoRow label="Name" value={board.name} compact />
          <InfoRow label="Device" value={board.fpgaId} compact />
          <InfoRow label="Family" value={board.family} compact />
          <InfoRow
            label="Connection"
            value={boardStatus ? (boardStatus.connected ? "Connected" : "Not detected") : "Unknown"}
            compact
          />
        </InfoCard>

        <InfoCard title="Programmer" style={{ padding: "14px", borderRadius: "16px" }} compact>
          <InfoRow label="Tool" value={programmer?.command ?? "None"} compact />
          <InfoRow label="Backend" value={programmer?.backend ?? "N/A"} compact />
          <InfoRow
            label="Status"
            value={programmerStatus ? (programmerStatus.installed ? "Installed" : "Not found") : "Unknown"}
            compact
          />
          {programmerStatus?.versionOutput ? (
            <InfoRow label="Version" value={programmerStatus.versionOutput} compact />
          ) : null}
        </InfoCard>

        <InfoCard title="Bitstream" style={{ padding: "14px", borderRadius: "16px" }} compact>
          <InfoRow
            label="Available"
            value={String(bitstreamFiles.length)}
            compact
          />
          <InfoRow
            label="Selected"
            value={selectedBitstream || "None"}
            compact
          />
          <InfoRow
            label="Format"
            value={programmer?.bitstreamExtensions.join(", ").toUpperCase() ?? "N/A"}
            compact
          />
        </InfoCard>
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string") return value;
  }
  return "Programming failed with an unknown error.";
}