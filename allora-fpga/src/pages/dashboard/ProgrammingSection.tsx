import { resolveGeneratedBitstream } from "../../lib/generatedBitstream";
import SerialMonitorSection from "./SerialMonitorSection";
import { useEffect, useRef, useState } from "react";
import type { BoardDefinition } from "../../data/boards";
import { getBoardCapabilities } from "../../data/boardCapabilities";
import { resolveBoardProgrammer } from "../../data/boardProgrammers";
import InfoCard, { InfoRow } from "./InfoCard";
import {
  createTauriChannel,
  hasTauriInvoke,
  invokeTauri,
} from "../../lib/tauri";
import type { ProjectFile } from "./types";
import { useProjectDiagnostic, TroubleshootButton } from "../../components/ProjectDiagnostics";

type ProgrammingSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
  projectPath?: string;
  topLevelFileName: string | null;
  initialTab?: "program" | "serial";
};

type ProgrammerStatus = {
  installed: boolean;
  versionOutput: string | null;
  toolPath: string | null;
  message: string;
};

type DetectedUsbDevice = {
  name: string;
  vendor: string;
  productId: string;
  possibleBoards: string[];
};

type BoardConnectionStatus = {
  connected: boolean;
  details: string;
  usbDevices: DetectedUsbDevice[];
  programmerDetected: boolean;
  programmerDetails: string;
};

type ProgramResult = {
  success: boolean;
  logs: string[];
  message: string;
};

export default function ProgrammingSection({
  board,
  files,
  projectName,
  projectPath,
  initialTab = "program",
}: ProgrammingSectionProps) {
  const [activeTab, setActiveTab] = useState<"program" | "serial">(initialTab);
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
  const [programmerStatus, setProgrammerStatus] =
    useState<ProgrammerStatus | null>(null);
  const [boardStatus, setBoardStatus] = useState<BoardConnectionStatus | null>(
    null,
  );
  const [isDetectingProgrammer, setIsDetectingProgrammer] = useState(false);
  const [isDetectingBoard, setIsDetectingBoard] = useState(false);
  const [isProgramming, setIsProgramming] = useState(false);
  const [programResult, setProgramResult] = useState<ProgramResult | null>(
    null,
  );
  const bitstreamFile = resolveGeneratedBitstream(files, projectPath, projectName, board.family);
  const selectedBitstream = bitstreamFile?.name ?? "";
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [programmerError, setProgrammerError] = useState("");
  const [boardError, setBoardError] = useState("");
  const consoleRef = useRef<HTMLDivElement | null>(null);

  const failure = [
    programResult && !programResult.success ? programResult.message : "",
    programmerError,
    boardError,
  ].filter(Boolean).join("\n");
  useProjectDiagnostic("programming", failure, failure ? [
    selectedBitstream ? `Generated bitstream: ${selectedBitstream}` : "",
    programResult && !programResult.success && programResult.logs.length ? `Programming output (last 60 lines):\n${programResult.logs.slice(-60).join("\n").slice(-12000)}` : "",
  ].filter(Boolean).join("\n\n") : undefined);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLogs]);

  const capabilities = getBoardCapabilities(board);
  const programmer = resolveBoardProgrammer(board);


  async function detectProgrammer() {
    if (!programmer || !hasTauriInvoke()) return;

    setIsDetectingProgrammer(true);
    setProgrammerError("");
    try {
      const result = await invokeTauri<ProgrammerStatus>("detect_programmer", {
        request: { programmerCommand: programmer.command },
      });
      setProgrammerStatus(result);
    } catch (error) {
      setProgrammerError(`Failed to detect programmer: ${getErrorMessage(error)}`);
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
    setBoardError("");
    try {
      const result = await invokeTauri<BoardConnectionStatus>(
        "detect_connected_board",
        {
          request: {
            programmerCommand: programmer.command,
            usbVendorId: programmer.usbVendorId,
            usbProductId: programmer.usbProductId,
          },
        },
      );
      setBoardStatus(result);
    } catch (error) {
      setBoardError(`Failed to detect connected boards: ${getErrorMessage(error)}`);
      setBoardStatus({
        connected: false,
        details: "Failed to detect connected boards.",
        usbDevices: [],
        programmerDetected: false,
        programmerDetails: "Unknown",
      });
    } finally {
      setIsDetectingBoard(false);
    }
  }

  async function handleProgramFpga() {
    if (!programmer || !selectedBitstream) return;
    if (!hasTauriInvoke()) {
      setProgramResult({ success: false, logs: [], message: "Open the Allora desktop app to program the FPGA." });
      return;
    }

    if (!bitstreamFile?.path) {
      setProgramResult({
        success: false,
        logs: [],
        message:
          "Bitstream file path is not available. Generate a bitstream first.",
      });
      return;
    }

    setIsProgramming(true);
    setProgramResult(null);
    setConsoleLogs(["[programming] Starting FPGA programming..."]);

    const logChannel = createTauriChannel<string>((line) => {
      setConsoleLogs((current) => [...current, line]);
    });

    try {
      const result = await invokeTauri<ProgramResult>("program_fpga", {
        onLog: logChannel,
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
      className="ui-workspace-columns"
      style={{
        display: "grid",
        gap: "22px",
        alignItems: "start",
        height: "calc(100vh - 24px)",
        boxSizing: "border-box",
        minHeight: 0,
        overflow: "visible",
      }}
    >
      <InfoCard
        title="FPGA Programming"
        pageTitle
        pageSection="programming"
        style={{
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >

        <div className="program-tabs ui-button-group ui-selection-group" role="tablist" aria-label="Board tools">
          <button type="button" role="tab" aria-selected={activeTab === "program"} onClick={() => setActiveTab("program")}>Program</button>
          <button type="button" role="tab" aria-selected={activeTab === "serial"} onClick={() => setActiveTab("serial")}>Serial Monitor</button>
        </div>
        <div className="program-tab-panel program-view" role="tabpanel" aria-label="Program FPGA" hidden={activeTab !== "program"}>
        <div
          className="ui-compact-button-group"
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            className="ui-button ui-button-primary ui-action-button"
            type="button"
            onClick={handleProgramFpga}
            disabled={
              !capabilities.programming.supported ||
              isProgramming ||
              !selectedBitstream
            }
          >
            {isProgramming ? "Programming..." : "Program FPGA"}
          </button>

          <button
            type="button"
            className="ui-button ui-button-secondary"
            onClick={detectProgrammer}
            disabled={!programmer || isDetectingProgrammer}
          >
            {isDetectingProgrammer ? "Checking..." : "Check Tool"}
          </button>

          <button
            type="button"
            className="ui-button ui-button-secondary"
            onClick={detectBoard}
            disabled={!programmer || isDetectingBoard}
          >
            {isDetectingBoard ? "Scanning..." : "Detect Board"}
          </button>
        </div>

        <div className="ui-workspace-note" style={{ marginTop: "16px" }}>
          {bitstreamFile ? <p>Generated bitstream: <strong>{bitstreamFile.name}</strong></p>
            : <p>Generate a bitstream for this project before programming.</p>}
        </div>

        <div
          style={{
            marginTop: "14px",
            padding: "12px 14px",
            borderRadius: "var(--ui-radius-sm)",
            background: programResult
              ? programResult.success
                ? "var(--ui-success-bg)"
                : "var(--ui-error-bg)"
              : "var(--ui-surface)",
            border: programResult
              ? programResult.success
                ? "1px solid var(--ui-success-border)"
                : "1px solid var(--ui-error-border)"
              : "1px solid var(--ui-border-subtle)",
            color: programResult
              ? programResult.success
                ? "var(--ui-success-text)"
                : "var(--ui-error-text)"
              : "var(--ui-text-muted)",
            fontSize: "13px",
            lineHeight: 1.45,
          }}
        >
          {programResult
            ? programResult.message
            : capabilities.programming.supported
              ? "A programmer is configured. Confirm the tool, adapter, and target board before running it."
              : capabilities.programming.detail}
          {programResult && !programResult.success && <div style={{ marginTop: "10px" }}><TroubleshootButton source="programming" /></div>}
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
            ref={consoleRef}
            className="dashboard-glass-card"
            style={{
              border: "1px solid var(--ui-border-subtle)",
              borderRadius: "var(--ui-radius-lg)",
              background: "var(--ui-surface)",
              color: "var(--ui-text)",
              minHeight: "150px",
              flex: consoleLogs.length ? "1 1 0" : "1 1 auto",
              padding: "18px",
              fontFamily: "var(--font-code)",
              fontSize: "13px",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              overflow: "auto",
            }}
          >
            {consoleLogs.length
              ? consoleLogs.join("\n")
              : 'No programming output yet.\n\nGenerate a bitstream, then click "Program FPGA" to begin.'}
          </div>
        </div>
        </div>
        <div className="program-tab-panel program-serial-view" role="tabpanel" aria-label="Serial Monitor" hidden={activeTab !== "serial"}>
          <SerialMonitorSection board={board} embedded />
        </div>
      </InfoCard>

      <div
        className="ui-workspace-framed ui-workspace-aside"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          maxHeight: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <InfoCard
          title="Board"
          style={{ padding: "14px", borderRadius: "var(--ui-radius-lg)" }}
          compact
        >
          <InfoRow label="Name" value={board.name} compact />
          <InfoRow label="Device" value={board.fpgaId} compact />
          <InfoRow label="Family" value={board.family} compact />
          <InfoRow
            label="Connection"
            value={
              boardStatus
                ? boardStatus.connected
                  ? "Connected"
                  : "Not detected"
                : "Unknown"
            }
            compact
          />
          {boardStatus?.usbDevices?.map((device, index) => (
            <div key={index} style={{ marginTop: "6px" }}>
              <InfoRow label="Device" value={device.name} compact />
              {device.possibleBoards.length > 0 ? (
                <InfoRow
                  label="Possible Boards"
                  value={device.possibleBoards.join(", ")}
                  compact
                />
              ) : null}
            </div>
          ))}
          {boardStatus?.programmerDetected !== undefined ? (
            <InfoRow
              label="Programmer"
              value={boardStatus.programmerDetected ? "Found" : "Not found"}
              compact
            />
          ) : null}
          {boardError && <div className="ui-workspace-note error" role="alert"><p>{boardStatus?.details}</p><TroubleshootButton source="programming" /></div>}
        </InfoCard>

        <InfoCard
          title="Programmer"
          style={{ padding: "14px", borderRadius: "var(--ui-radius-lg)" }}
          compact
        >
          <InfoRow label="Tool" value={programmer?.command ?? "None"} compact />
          <InfoRow
            label="Backend"
            value={programmer?.backend ?? "N/A"}
            compact
          />
          <InfoRow
            label="Status"
            value={
              programmerStatus
                ? programmerStatus.installed
                  ? "Installed"
                  : "Not found"
                : "Unknown"
            }
            compact
          />
          {programmerStatus?.versionOutput ? (
            <InfoRow
              label="Version"
              value={programmerStatus.versionOutput}
              compact
            />
          ) : null}
          {programmerError && <div className="ui-workspace-note error" role="alert"><p>{programmerStatus?.message}</p><TroubleshootButton source="programming" /></div>}
        </InfoCard>

        <InfoCard
          title="Bitstream"
          style={{ padding: "14px", borderRadius: "var(--ui-radius-lg)" }}
          compact
        >
          <InfoRow
            label="Source"
            value="Project bitstream generator"
            compact
          />
          <InfoRow
            label="Generated file"
            value={selectedBitstream || "None"}
            compact
          />
          <InfoRow
            label="Format"
            value={
              programmer?.bitstreamExtensions.join(", ").toUpperCase() ?? "N/A"
            }
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
