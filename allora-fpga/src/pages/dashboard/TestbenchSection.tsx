import { TroubleshootButton, useProjectDiagnostic } from "../../components/ProjectDiagnostics";
import { listenExplorer, publishExplorer, type ExplorerMessage } from "../../lib/explorerBridge";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { BoardDefinition } from "../../data/boards";
import {
  createTauriChannel,
  hasTauriInvoke,
  invokeTauri,
} from "../../lib/tauri";
import InfoCard, { InfoRow } from "./InfoCard";
import type { ProjectFile } from "./types";
import type { AppSettings } from "../../data/settings";
import SignalWaveformPanel from "../../components/SignalWaveformPanel";
import TestbenchCreationPopup from "../../components/TestbenchCreationPopup";
import { openViewerWindow } from "../../lib/viewerWindow";
import { findChatWaveform } from "../../lib/chatResults";
import {
  buildTestbenchWaveTraces,
  formatWaveTick,
  parseVcd,
} from "../../lib/vcd";

type SimulateTestbenchResponse = {
  logs: string[];
  topModule: string;
  waveformName: string;
  waveformPath?: string | null;
  vcd: string;
  sourceFiles: {name: string; content: string}[];
  memoryFiles: {name: string; content: string}[];
};

type TestbenchSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
  projectPath?: string;
  topLevelFileName: string | null;
  settings: AppSettings;
  requestedWaveform?: { path: string; id: number };
  onCreateTestbench: (fileName: string, content: string) => void;
  onOpenFile: (fileName: string) => void;
  onAddArtifact?: (artifact: {
    fileName: string;
    content: string;
    path?: string;
  }) => Promise<void> | void;
};

export default function TestbenchSection({
  board,
  files,
  projectName,
  projectPath,
  topLevelFileName,
  settings,
  requestedWaveform,
  onCreateTestbench,
  onOpenFile,
  onAddArtifact,
}: TestbenchSectionProps) {
  const [explorerRecording, setExplorerRecording] = useState<Extract<ExplorerMessage, {type: 'waveform'}> | null>(null);
  useEffect(() => listenExplorer(message => {
    if (message.type === 'waveform-request' && message.projectKey === (projectPath ?? projectName) && explorerRecording) void publishExplorer(explorerRecording).catch(() => {});
  }), [explorerRecording, projectPath, projectName]);
  const [selectedTestbenchName, setSelectedTestbenchName] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [waveformText, setWaveformText] = useState("");
  const [waveformName, setWaveformName] = useState("");
  const handledWaveformRequest = useRef<number | undefined>(undefined);
  const [selectedWaveSignalIds, setSelectedWaveSignalIds] = useState<string[]>(
    [],
  );
  const [errorMessage, setErrorMessage] = useState("");
  const logRef = useRef<HTMLPreElement | null>(null);
  const diagnosticDetails = useMemo(() => errorMessage
    ? logs.slice(-40).join("\n").slice(-8_000)
    : undefined, [errorMessage, logs]);
  useProjectDiagnostic("testbench", errorMessage, diagnosticDetails);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const hdlFiles = files.filter(
    (file) => isHdlFile(file.name) && !isVhdlFile(file.name),
  );
  const inferredTopLevel =
    topLevelFileName && hdlFiles.some((file) => file.name === topLevelFileName)
      ? topLevelFileName
      : inferDesignFileName(hdlFiles);
  const selectedTopLevel = inferredTopLevel
    ? (hdlFiles.find((file) => file.name === inferredTopLevel) ?? null)
    : null;
  const topModule = useMemo(
    () => findTopModule(selectedTopLevel ? [selectedTopLevel] : hdlFiles),
    [hdlFiles, selectedTopLevel],
  );
  const testbenchFiles = hdlFiles.filter((file) =>
    isTestbenchFile(file, topModule),
  );
  const vcdFiles = files.filter(
    (file) => file.name.toLowerCase().endsWith(".vcd") && !file.isBinary,
  );
  const initialWaveformContent = vcdFiles[0]?.content ?? "";
  const inferredTestbench = inferTestbenchFile(
    testbenchFiles,
    topModule,
    selectedTopLevel?.name,
  );
  const selectedTestbench =
    testbenchFiles.find((file) => file.name === selectedTestbenchName) ??
    inferredTestbench ??
    null;
  const designFiles = hdlFiles.filter(
    (file) => file.name !== selectedTestbench?.name,
  );
  const testbenchTopModule = useMemo(
    () => findTopModule(selectedTestbench ? [selectedTestbench] : []),
    [selectedTestbench],
  );
  const waveform = useMemo(
    () => parseVcd(waveformText),
    [waveformText],
  );
  const canRun = Boolean(selectedTestbench && designFiles.length > 0);

  useEffect(() => {
    const signals = waveform?.signals ?? [];
    setSelectedWaveSignalIds((current) => {
      const available = current.filter((signalId) =>
        signals.some((signal) => signal.id === signalId),
      );
      return available.length
        ? available
        : signals.slice(0, 6).map((signal) => signal.id);
    });
  }, [waveform]);

  useEffect(() => {
    if (
      !requestedWaveform &&
      settings.simulatorAutoOpenWaveform &&
      !waveformText &&
      initialWaveformContent
    ) {
      setWaveformText(initialWaveformContent);
      setWaveformName(vcdFiles[0]?.name ?? "waveform.vcd");
    }
  }, [
    initialWaveformContent,
    settings.simulatorAutoOpenWaveform,
    waveformText,
    requestedWaveform,
    vcdFiles,
  ]);

  useEffect(() => {
    if (!requestedWaveform || handledWaveformRequest.current === requestedWaveform.id) return;
    handledWaveformRequest.current = requestedWaveform.id;
    const file = findChatWaveform(files, requestedWaveform.path, projectPath);
    if (!file) {
      setWaveformText("");
      setWaveformName("");
      setSelectedWaveSignalIds([]);
      setErrorMessage(`The requested waveform is unavailable: ${requestedWaveform.path}`);
      return;
    }
    const recording = parseVcd(file.content);
    setWaveformText(file.content);
    setWaveformName(file.name);
    setSelectedWaveSignalIds(recording?.signals.slice(0, 6).map(signal => signal.id) ?? []);
    setErrorMessage(recording?.signals.length ? "" : `No readable VCD signals were found in ${file.name}.`);
  }, [requestedWaveform, files, projectPath]);

  async function openWaveformViewer(vcd: string, waveformName: string) {
    try {
      await openViewerWindow(
        "waveform",
        `${projectName} — Testbench Waveform`,
        { vcd, waveformName },
      );
      setErrorMessage(current => current.startsWith("Unable to open the waveform viewer:") ? "" : current);
    } catch (viewerError) {
      setErrorMessage(`Unable to open the waveform viewer: ${getErrorMessage(viewerError)}`);
      setLogs((current) => [
        ...current.filter((line) => !line.startsWith("[viewer]")),
        `[viewer] ${getErrorMessage(viewerError)}`,
      ]);
    }
  }

  async function runSimulation() {
    if (!selectedTestbench) {
      setErrorMessage("Create or select a testbench first.");
      return;
    }

    if (designFiles.length === 0) {
      setErrorMessage(
        "No Verilog/SystemVerilog design files found to simulate.",
      );
      return;
    }

    if (!hasTauriInvoke()) {
      setErrorMessage(
        "Launch the Tauri desktop app to run the real simulator.",
      );
      return;
    }

    setIsRunning(true);
    setErrorMessage("");
    setLogs(
      filterTestbenchLogs(
        [
          "[simulation] Starting",
          `Board context: ${board.name}`,
          `Testbench: ${selectedTestbench.name}`,
          ...(settings.simulatorLogLevel === "verbose"
            ? [
                `Top module: ${testbenchTopModule ?? "auto-detect"}`,
                `Design sources: ${designFiles.length}`,
              ]
            : []),
        ],
        settings.simulatorLogLevel,
      ),
    );

    const logChannel = createTauriChannel<string>((line) => {
      if (
        settings.simulatorLogLevel === "errors" &&
        !/error|failed|warning/i.test(line)
      ) {
        return;
      }
      setLogs((current) => [...current, line]);
    });

    try {
      const result = await invokeTauri<SimulateTestbenchResponse>(
        "simulate_testbench",
        {
          onLog: logChannel,
          request: {
            projectName,
            sourceFiles: designFiles.map((file) => ({
              name: file.name,
              content: file.content,
            })),
            testbenchFile: {
              name: selectedTestbench.name,
              content: selectedTestbench.content,
            },
            topModule: testbenchTopModule,
            projectPath,
          },
        },
      );

      setLogs(filterTestbenchLogs(result.logs, settings.simulatorLogLevel));
      if (settings.simulatorCaptureWaveform) {
        const recording: Extract<ExplorerMessage, {type: 'waveform'}> = { type: 'waveform', recordingId: crypto.randomUUID(), projectKey: projectPath ?? projectName, files: result.sourceFiles, memories: result.memoryFiles, vcd: result.vcd, waveformName: result.waveformName };
        setExplorerRecording(recording);
        void publishExplorer(recording).catch(() => {});
        if (settings.simulatorAutoOpenWaveform) {
          setWaveformText(result.vcd);
          setWaveformName(result.waveformName);
          await openWaveformViewer(result.vcd, result.waveformName);
        }
        await onAddArtifact?.({
          fileName: result.waveformName,
          content: result.vcd,
          path: result.waveformPath ?? undefined,
        });
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setLogs((current) => [
        ...current,
        "[simulation] Failed",
        getErrorMessage(error),
      ]);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div
      className="ui-workspace-columns"
      style={{
        display: "grid",
        gap: "18px",
        height: "calc(100vh - 24px)",
        boxSizing: "border-box",
        minHeight: 0,
        overflow: "visible",
      }}
    >
      <InfoCard
        title="Testbench"
        pageTitle
        pageSection="testbench"
        style={{
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="testbench-toolbar ui-compact-button-group">
          <label className="synthesis-top-level-field">
            <span>Testbench</span>
            <select
              className="ui-dropdown synthesis-top-level-select"
              value={selectedTestbench?.name ?? ""}
              onChange={(event) => setSelectedTestbenchName(event.target.value)}
            >
              {testbenchFiles.length === 0 ? (
                <option value="">No testbench files</option>
              ) : null}
              {testbenchFiles.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name}
                </option>
              ))}
            </select>
          </label>

          <TestbenchCreationPopup
            source={files.find(file => file.name === topLevelFileName) ?? selectedTopLevel}
            files={files}
            boardName={board.name}
            onCreate={(fileName, content) => {
              onCreateTestbench(fileName, content);
              setSelectedTestbenchName(fileName);
            }}
          />

          {waveformText ? (
            <button
              type="button"
              className="synthesis-secondary-button"
              onClick={() =>
                void openWaveformViewer(
                  waveformText,
                  waveformName || "waveform.vcd",
                )
              }
            >
              Open Waveform in Window
            </button>
          ) : null}

          <button
            type="button"
            className="primary-action synthesis-generate-button ui-action-button"
            disabled={!canRun || isRunning}
            onClick={() => void runSimulation()}
          >
            {isRunning ? "Running..." : "Run Simulation"}
          </button>
        </div>

        {errorMessage ? (
          <div className="testbench-status ui-workspace-note error">
            {errorMessage}
            <TroubleshootButton source="testbench" />
          </div>
        ) : null}

        <SignalWaveformPanel
          className="testbench-waveform-panel ui-workspace-section"
          showTitle={false}
          subtitle=""
          traces={buildTestbenchWaveTraces(waveform)}
          selectedSignalIds={selectedWaveSignalIds}
          onToggleSignal={(signalId) =>
            setSelectedWaveSignalIds((current) => {
              if (current.includes(signalId)) {
                return current.length > 1
                  ? current.filter((item) => item !== signalId)
                  : current;
              }
              return [...current.slice(-5), signalId];
            })
          }
          emptyMessage="Run a testbench or import a .vcd file with $dumpvars data."
          formatTime={(time) =>
            formatWaveTick(Math.round(time), waveform?.timescale ?? "ns")
          }
        />

      </InfoCard>

      <div className="testbench-side ui-workspace-framed ui-workspace-aside">
        <InfoCard
          title="Setup"
          style={{ padding: "14px", borderRadius: "var(--ui-radius-lg)" }}
          compact
        >
          <InfoRow
            label="Design Top"
            value={topModule ?? "Not found"}
            compact
          />
          <InfoRow
            label="TB Top"
            value={testbenchTopModule ?? "Not found"}
            compact
          />
          <InfoRow
            label="Design Files"
            value={String(designFiles.length)}
            compact
          />
          <InfoRow
            label="Testbenches"
            value={String(testbenchFiles.length)}
            compact
          />
          <InfoRow
            label="Waveforms"
            value={String(vcdFiles.length + (waveformText ? 1 : 0))}
            compact
          />
        </InfoCard>

        <InfoCard
          title="Files"
          style={{ padding: "14px", borderRadius: "var(--ui-radius-lg)" }}
          compact
        >
          <div className="testbench-file-list">
            {[...testbenchFiles, ...vcdFiles].map((file) => (
              <button
                key={file.name}
                type="button"
                onClick={() => {
                  if (file.name.toLowerCase().endsWith(".vcd")) {
                    setWaveformText(file.content);
                    setWaveformName(file.name);
                    setErrorMessage("");
                  } else {
                    onOpenFile(file.name);
                  }
                }}
              >
                {file.name}
              </button>
            ))}
            {testbenchFiles.length === 0 && vcdFiles.length === 0 ? (
              <div className="testbench-empty">
                No testbench or waveform files yet.
              </div>
            ) : null}
          </div>
        </InfoCard>

        <InfoCard
          title="Simulator Log"
          style={{
            padding: "14px",
            borderRadius: "var(--ui-radius-lg)",
            minHeight: 0,
            overflow: "hidden",
          }}
          compact
        >
          <pre className="testbench-log" ref={logRef}>
            {logs.length
              ? logs.join("\n")
              : "Run a simulation to see compiler and runtime output."}
          </pre>
        </InfoCard>
      </div>
    </div>
  );
}

function filterTestbenchLogs(
  logs: string[],
  level: AppSettings["simulatorLogLevel"],
) {
  return level === "errors"
    ? logs.filter((line) => /error|failed|warning/i.test(line))
    : logs;
}

function findTopModule(files: ProjectFile[]) {
  for (const file of files) {
    const match = file.content.match(/\bmodule\s+([a-zA-Z_][a-zA-Z0-9_$]*)/);
    if (match) return match[1];
  }

  return null;
}

function isHdlFile(fileName: string) {
  return /\.(v|sv|vhd|vhdl)$/i.test(fileName);
}

function isVhdlFile(fileName: string) {
  return /\.(vhd|vhdl)$/i.test(fileName);
}

function inferDesignFileName(files: ProjectFile[]) {
  return (
    files.find((file) => !isLikelyTestbenchName(file.name))?.name ??
    files[0]?.name ??
    null
  );
}

function inferTestbenchFile(
  files: ProjectFile[],
  topModule: string | null,
  designFileName?: string,
) {
  if (files.length === 0) return null;

  const normalizedTop = topModule ? normalizeName(topModule) : "";
  const designStem = designFileName
    ? normalizeName(stripExtension(designFileName))
    : "";

  return (
    files.find((file) => {
      const stem = normalizeName(stripExtension(file.name));
      return Boolean(
        normalizedTop &&
        (stem === `${normalizedTop}tb` || stem === `tb${normalizedTop}`),
      );
    }) ??
    files.find((file) => {
      const stem = normalizeName(stripExtension(file.name));
      return Boolean(
        designStem &&
        (stem === `${designStem}tb` || stem === `tb${designStem}`),
      );
    }) ??
    files.find((file) =>
      /(^|[_\-.])(tb|testbench)([_\-.]|$)/i.test(file.name),
    ) ??
    files[0]
  );
}

function isTestbenchFile(file: ProjectFile, topModule: string | null) {
  if (isLikelyTestbenchName(file.name)) return true;

  const moduleName = findTopModule([file]);
  if (!moduleName) return false;

  const normalizedModule = normalizeName(moduleName);
  const normalizedTop = topModule ? normalizeName(topModule) : "";
  return (
    normalizedModule.includes("testbench") ||
    normalizedModule.endsWith("tb") ||
    normalizedModule.startsWith("tb") ||
    Boolean(normalizedTop && normalizedModule === `${normalizedTop}tb`)
  );
}

function isLikelyTestbenchName(fileName: string) {
  return /(^|[_\-.])(tb|testbench)([_\-.]|$)/i.test(fileName);
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.(v|sv|vhd|vhdl)$/i, "");
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "Simulation failed.";
}
