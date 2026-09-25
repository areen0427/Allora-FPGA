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
import { findPorts, type HdlPort } from "./pinMappingUtils";
import type { ProjectFile } from "./types";
import type { AppSettings } from "../../data/settings";
import SignalWaveformPanel from "../../components/SignalWaveformPanel";
import { openViewerWindow } from "../../lib/viewerWindow";
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
};

type TestbenchSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
  projectPath?: string;
  topLevelFileName: string | null;
  settings: AppSettings;
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
  onCreateTestbench,
  onOpenFile,
  onAddArtifact,
}: TestbenchSectionProps) {
  const [selectedTestbenchName, setSelectedTestbenchName] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [waveformText, setWaveformText] = useState("");
  const [selectedWaveSignalIds, setSelectedWaveSignalIds] = useState<string[]>(
    [],
  );
  const [errorMessage, setErrorMessage] = useState("");
  const logRef = useRef<HTMLPreElement | null>(null);

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
  const topLevelPorts = useMemo(
    () =>
      findPorts(
        selectedTopLevel && !isVhdlFile(selectedTopLevel.name)
          ? [selectedTopLevel]
          : [],
      ),
    [selectedTopLevel],
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
      settings.simulatorAutoOpenWaveform &&
      !waveformText &&
      initialWaveformContent
    ) {
      setWaveformText(initialWaveformContent);
    }
  }, [
    initialWaveformContent,
    settings.simulatorAutoOpenWaveform,
    waveformText,
  ]);

  function createTestbench() {
    const moduleName = topModule ?? "top";
    const extension = projectName.toLowerCase().endsWith("sv") ? "sv" : "sv";
    const baseName = `${moduleName}_tb.${extension}`;
    const fileName = uniqueFileName(baseName, files);
    const content = createTestbenchTemplate(
      moduleName,
      board.name,
      topLevelPorts,
    );
    onCreateTestbench(fileName, content);
    setSelectedTestbenchName(fileName);
  }

  async function openWaveformViewer(vcd: string, waveformName: string) {
    try {
      await openViewerWindow(
        "waveform",
        `${projectName} — Testbench Waveform`,
        { vcd, waveformName },
      );
    } catch (viewerError) {
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
        if (settings.simulatorAutoOpenWaveform) {
          setWaveformText(result.vcd);
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
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 250px",
        gap: "18px",
        height: "calc(100vh - 48px)",
        boxSizing: "border-box",
        padding: "8px",
        margin: "-8px",
        minHeight: 0,
        overflow: "visible",
      }}
    >
      <InfoCard
        title="Testbench"
        style={{
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="testbench-toolbar">
          <label className="synthesis-top-level-field">
            <span>Testbench</span>
            <select
              className="synthesis-top-level-select"
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

          <button
            type="button"
            className="synthesis-secondary-button"
            onClick={createTestbench}
          >
            New Testbench
          </button>

          {waveformText ? (
            <button
              type="button"
              className="synthesis-secondary-button"
              onClick={() =>
                void openWaveformViewer(
                  waveformText,
                  vcdFiles[0]?.name ?? "waveform.vcd",
                )
              }
            >
              Open Waveform in Window
            </button>
          ) : null}

          <button
            type="button"
            className="primary-action synthesis-generate-button"
            disabled={!canRun || isRunning}
            onClick={() => void runSimulation()}
          >
            {isRunning ? "Running..." : "Run Simulation"}
          </button>
        </div>

        {errorMessage ? (
          <div className="testbench-status error">{errorMessage}</div>
        ) : (
          <div className="testbench-status">
            Real simulation uses local `iverilog` and `vvp`, then renders the
            generated VCD waveform.
          </div>
        )}

        <SignalWaveformPanel
          className="testbench-waveform-panel"
          title="Testbench waveform"
          subtitle={
            waveform
              ? `${waveform.signals.length} signals · ${formatWaveTick(
                  waveform.endTime,
                  waveform.timescale,
                )} capture`
              : "Run a testbench or import a VCD file to inspect its signals"
          }
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

      <div className="testbench-side">
        <InfoCard
          title="Setup"
          style={{ padding: "14px", borderRadius: "16px" }}
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
          style={{ padding: "14px", borderRadius: "16px" }}
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
            borderRadius: "16px",
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

function createTestbenchTemplate(
  moduleName: string,
  boardName: string,
  ports: HdlPort[],
) {
  const signals = createTestbenchSignals(ports);
  const declarations = signals.length
    ? signals
        .map((signal) =>
          `  ${signal.direction === "input" ? "reg" : "wire"}${signal.range ? ` ${signal.range}` : ""} ${signal.name} = ${signal.direction === "input" ? `${signal.width}'d0` : ""};`.replace(
            " = ;",
            ";",
          ),
        )
        .join("\n")
    : "  reg clk = 0;\n  reg rst = 1;";
  const connections = signals.length
    ? signals.map((signal) => `    .${signal.name}(${signal.name})`).join(",\n")
    : "    .clk(clk),\n    .rst(rst)";
  const clockSignal = signals.find((signal) =>
    /^(clk|clock|sysclk)$/i.test(signal.name),
  );
  const resetSignal = signals.find((signal) =>
    /^(rst|reset|rst_n|reset_n)$/i.test(signal.name),
  );
  const resetAssert = resetSignal
    ? `    #20 ${resetSignal.name} = ${resetSignal.name.endsWith("_n") ? "1" : "0"};`
    : "    #20;";

  return `\`timescale 1ns / 1ps

module ${moduleName}_tb;
${declarations}

  ${moduleName} dut (
${connections}
  );

${clockSignal ? `  always #5 ${clockSignal.name} = ~${clockSignal.name};` : "  // Add a clock generator here if your DUT needs one."}

  initial begin
    $dumpfile("waveform.vcd");
    $dumpvars(0, ${moduleName}_tb);

    // ${boardName} simulation stimulus
${resetAssert}
    #200;
    $finish;
  end
endmodule
`;
}

function createTestbenchSignals(ports: HdlPort[]) {
  const grouped = new Map<
    string,
    { direction: HdlPort["direction"]; indexes: number[] }
  >();

  for (const port of ports) {
    const name = port.baseName ?? port.name;
    const current = grouped.get(name) ?? {
      direction: port.direction,
      indexes: [],
    };
    if (port.index !== undefined) {
      current.indexes.push(port.index);
    }
    grouped.set(name, current);
  }

  return [...grouped.entries()].map(([name, info]) => {
    const min = info.indexes.length ? Math.min(...info.indexes) : 0;
    const max = info.indexes.length ? Math.max(...info.indexes) : 0;
    const width = info.indexes.length ? Math.abs(max - min) + 1 : 1;
    return {
      name,
      direction: info.direction,
      width,
      range: width > 1 ? `[${max}:${min}]` : "",
    };
  });
}

function uniqueFileName(fileName: string, files: ProjectFile[]) {
  if (!files.some((file) => file.name === fileName)) return fileName;
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
  const extension = dotIndex === -1 ? "" : fileName.slice(dotIndex);
  let index = 2;

  while (files.some((file) => file.name === `${stem}-${index}${extension}`)) {
    index++;
  }

  return `${stem}-${index}${extension}`;
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
