import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardDefinition } from "../../data/boards";
import { getBoardCapabilities } from "../../data/boardCapabilities";
import InfoCard, { InfoRow } from "./InfoCard";
import {
  createTauriChannel,
  hasTauriInvoke,
  invokeTauri,
} from "../../lib/tauri";
import {
  appendBuildRecord,
  createBuildRecordId,
  parseBuildMetrics,
  persistBuildHistory,
  type BuildRecord,
} from "../../lib/buildHistory";
import type { ProjectFile } from "./types";
import { findTopModule, isHdlFile, isTestbenchFile } from "../../hooks/utils";
import {
  createSuggestedMappings,
  findPorts,
  getPinOptions,
  readPinMappingsFromConstraints,
  type HdlPort,
} from "./pinMappingUtils";
import type { TimingAnalysisResult } from "./TimingAnalysis";
import { useBuildPreflight } from "../../hooks/useBuildPreflight";
import { BuildPreflight } from "../../components/BuildPreflight";
import { openViewerWindow } from "../../lib/viewerWindow";

type BitstreamSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
  projectPath?: string;
  topLevelFileName: string | null;
  dirtyFileNames?: string[];
  onNavigate?: (destination: "editor" | "pin-mapping") => void;
  onAddArtifact?: (artifact: {
    fileName: string;
    content: string;
    isBinary?: boolean;
  }) => Promise<void> | void;
  onUpdateConstraints?: (
    fileName: string,
    content: string,
  ) => Promise<void> | void;
};

type BitstreamArtifact = {
  fileName: string;
  extension: string;
  byteLength: number;
  bytes: Uint8Array;
  preview: string;
  topModule: string | null;
  generatedAt: string;
  artifactPath?: string | null;
  logs: string[];
  timing: TimingAnalysisResult;
};

type GenerateBitstreamResponse = {
  logs: string[];
  topModule: string;
  outputName: string;
  artifactPath?: string | null;
  bytes: number[];
  timing: TimingAnalysisResult;
};

export default function BitstreamSection({
  board,
  files,
  projectName,
  projectPath,
  topLevelFileName,
  dirtyFileNames = [],
  onNavigate,
  onAddArtifact,
  onUpdateConstraints,
}: BitstreamSectionProps) {
  const [artifact, setArtifact] = useState<BitstreamArtifact | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [resultTab, setResultTab] = useState<"log" | "preview">("log");
  const logPanelRef = useRef<HTMLDivElement | null>(null);
  const capabilities = getBoardCapabilities(board);
  const preflight = useBuildPreflight(
    board,
    files,
    topLevelFileName,
    dirtyFileNames,
  );
  const preflightBlocked = preflight.some((check) => check.state === "blocked");

  useEffect(() => {
    if (resultTab === "log" && logPanelRef.current) {
      logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
    }
  }, [liveLogs, resultTab]);

  function selectResultTab(tab: "log" | "preview") {
    if (logPanelRef.current) logPanelRef.current.scrollTop = 0;
    setResultTab(tab);
  }

  const hdlFiles = files.filter((file) => isHdlFile(file.name));
  const selectedTopLevelFile = topLevelFileName
    ? (hdlFiles.find((file) => file.name === topLevelFileName) ?? null)
    : null;
  const topModule = useMemo(
    () => findTopModule(selectedTopLevelFile ? [selectedTopLevelFile] : []),
    [selectedTopLevelFile],
  );
  // Build only the design sources: the selected top level comes first, and
  // testbench files (which Yosys rejects during synthesis) are excluded.
  const synthesisFiles = useMemo(() => {
    const designFiles = hdlFiles.filter(
      (file) =>
        file.name === topLevelFileName || !isTestbenchFile(file, topModule),
    );
    if (!selectedTopLevelFile) return designFiles;
    return [
      selectedTopLevelFile,
      ...designFiles.filter((file) => file.name !== selectedTopLevelFile.name),
    ];
  }, [hdlFiles, topLevelFileName, topModule, selectedTopLevelFile]);
  const topLevelPorts = useMemo(
    () => findPorts(selectedTopLevelFile ? [selectedTopLevelFile] : []),
    [selectedTopLevelFile],
  );
  const constraintFile =
    files.find(
      (file) =>
        file.name.toLowerCase() === `constraints.${board.constraintsFile}`,
    ) ??
    files.find((file) =>
      file.name.toLowerCase().endsWith(`.${board.constraintsFile}`),
    ) ??
    null;
  const savedMappings = useMemo(
    () =>
      constraintFile
        ? readPinMappingsFromConstraints(
            board,
            topLevelPorts,
            constraintFile.content,
          )
        : null,
    [board, constraintFile, topLevelPorts],
  );
  const generatedConstraintContent = useMemo(
    () => createGeneratedConstraints(board, topLevelPorts, projectName),
    [board, topLevelPorts, projectName],
  );
  const autoMappings = useMemo(
    () => createConstraintMappings(board, topLevelPorts, savedMappings),
    [board, savedMappings, topLevelPorts],
  );
  const unmappedPorts = autoMappings.filter((mapping) => !mapping.pin);
  const mappedClock = autoMappings.find(
    (mapping) => mapping.pin?.type === "clock",
  );
  const targetClock = mappedClock
    ? (board.clocks.find((clock) => clock.pin === mappedClock.pin?.pin) ?? null)
    : null;
  const extension = getBitstreamExtension(board);
  const constraintFileName =
    constraintFile?.name ?? `constraints.${board.constraintsFile}`;
  const buildConstraintContent =
    constraintFile?.content || generatedConstraintContent;
  const buildInputKey = [
    synthesisFiles
      .map((file) => `${file.name}:${file.content}`)
      .join("\n---hdl---\n"),
    constraintFileName,
    buildConstraintContent,
  ].join("\n---constraints---\n");

  useEffect(() => {
    setArtifact(null);
    setErrorMessage(null);
  }, [board.id, buildInputKey, projectName, projectPath, topLevelFileName]);

  async function handleGenerateBitstream() {
    if (preflightBlocked) {
      setErrorMessage(
        "Resolve the build preflight blockers before generating a bitstream.",
      );
      return;
    }
    if (!capabilities.bitstream.supported) {
      setErrorMessage(capabilities.bitstream.detail);
      setArtifact(null);
      return;
    }

    if (hdlFiles.length === 0) {
      setErrorMessage(
        "No HDL files found. Create or import a top-level file first.",
      );
      setArtifact(null);
      return;
    }

    if (!topModule) {
      setErrorMessage(
        "The selected top-level file does not contain a readable module declaration.",
      );
      setArtifact(null);
      return;
    }

    if (!generatedConstraintContent && !constraintFile) {
      setErrorMessage(
        `No constraints.${board.constraintsFile} file was found, and no top-level ports were available for automatic constraints.`,
      );
      setArtifact(null);
      return;
    }

    if (!hasTauriInvoke()) {
      setErrorMessage(
        "Launch the Tauri desktop app to generate a real bitstream.",
      );
      setArtifact(null);
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setLiveLogs([]);
    setResultTab("log");

    const startedAt = Date.now();
    const streamedLogs: string[] = [];
    const logChannel = createTauriChannel<string>((line) => {
      streamedLogs.push(line);
      setLiveLogs((current) => [...current, line]);
    });

    async function recordBuild(
      record: Omit<BuildRecord, "id" | "timestamp" | "durationMs">,
    ) {
      try {
        const { fileName, content } = appendBuildRecord(files, {
          ...record,
          id: createBuildRecordId(),
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        });
        await onAddArtifact?.({ fileName, content });
        if (projectPath) {
          await persistBuildHistory(projectPath, content);
        }
      } catch {
        // Build history is best-effort; never fail the build because of it.
      }
    }

    try {
      const result = await invokeTauri<GenerateBitstreamResponse>(
        "generate_bitstream",
        {
          onLog: logChannel,
          request: {
            projectName,
            boardName: board.name,
            boardFamily: board.family,
            boardPackage: board.package,
            fpgaId: board.fpgaId,
            synthesisFlow: board.synthesisFlow,
            topModule,
            sourceFiles: synthesisFiles.map((file) => ({
              name: file.name,
              content: file.content,
            })),
            constraintFile: {
              name: constraintFileName,
              content: buildConstraintContent,
            },
            outputExtension: extension,
            projectPath,
            targetClockName: targetClock ? mappedClock?.port.name : null,
            targetFrequencyMhz: targetClock
              ? targetClock.frequency / 1_000_000
              : null,
          },
        },
      );

      const bytes = new Uint8Array(result.bytes);
      const preview = createHexPreview(bytes, {
        board,
        topModule: result.topModule,
        files: synthesisFiles,
        fileStem: result.outputName,
        extension,
      });
      const generatedAt = new Date().toLocaleString();
      const nextArtifact: BitstreamArtifact = {
        fileName: `${result.outputName}.${extension}`,
        extension,
        byteLength: bytes.length,
        bytes,
        preview,
        topModule: result.topModule,
        generatedAt,
        artifactPath: result.artifactPath,
        logs: result.logs,
        timing: result.timing,
      };

      setArtifact(nextArtifact);
      setLiveLogs(result.logs);
      // Never replace a project constraint file here. It may contain explicit
      // assignments saved by the pin mapper (or hand-authored constraints).
      // Only materialize auto-generated constraints when the project did not
      // already have a constraint file at build start.
      if (!constraintFile && generatedConstraintContent) {
        await onUpdateConstraints?.(
          constraintFileName,
          generatedConstraintContent,
        );
      }
      await onAddArtifact?.({
        fileName: nextArtifact.fileName,
        content: `[binary ${extension.toUpperCase()} artifact generated at ${generatedAt}]`,
        isBinary: true,
      });
      await onAddArtifact?.({
        fileName: `${result.outputName}.build.log`,
        content: createBuildLogArtifact({
          board,
          artifact: nextArtifact,
          constraintsFileName: constraintFileName,
          topModule: result.topModule,
        }),
      });

      const metrics = parseBuildMetrics(result.logs);
      await recordBuild({
        success: true,
        topModule: result.topModule,
        bytes: bytes.length,
        fmaxMhz: metrics.fmaxMhz,
        timingPass: metrics.timingPass,
        utilization: metrics.utilization,
      });
    } catch (error) {
      setArtifact(null);
      setErrorMessage(getErrorMessage(error));

      const metrics = parseBuildMetrics(streamedLogs);
      await recordBuild({
        success: false,
        topModule: topModule ?? undefined,
        fmaxMhz: metrics.fmaxMhz,
        timingPass: metrics.timingPass,
        utilization: metrics.utilization,
        message: getErrorMessage(error),
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDownloadBitstream() {
    if (!artifact) return;

    const buffer = new ArrayBuffer(artifact.bytes.length);
    new Uint8Array(buffer).set(artifact.bytes);
    const blob = new Blob([buffer], {
      type: "application/octet-stream",
    });

    const filePicker = window.showSaveFilePicker;

    if (filePicker) {
      const handle = await filePicker({
        suggestedName: artifact.fileName,
        types: [
          {
            description: "FPGA Bitstream",
            accept: {
              "application/octet-stream": [`.${artifact.extension}`],
            },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleOpenTimingReport() {
    if (!artifact) return;
    try {
      await openViewerWindow(
        "timing",
        `${projectName || artifact.topModule || "Allora"} — Timing Report`,
        artifact.timing,
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="bitstream-layout">
      <section className="dashboard-glass-card bitstream-main">
        <header className="bitstream-header">
          <h1>Bitstream</h1>
          <p>Generate a programming artifact for {board.name}.</p>
        </header>

        <div className="bitstream-actions">
          <button
            className="primary-action"
            type="button"
            onClick={handleGenerateBitstream}
            title={
              preflightBlocked
                ? "Resolve build preflight blockers first"
                : "Generate a bitstream"
            }
            disabled={
              !capabilities.bitstream.supported ||
              hdlFiles.length === 0 ||
              preflightBlocked ||
              isGenerating
            }
          >
            {isGenerating ? "Generating..." : "Generate Bitstream"}
          </button>
          <button
            type="button"
            onClick={handleDownloadBitstream}
            disabled={!artifact}
          >
            Download
          </button>
          <button
            className="bitstream-open-timing"
            type="button"
            onClick={() => void handleOpenTimingReport()}
            disabled={!artifact}
          >
            Open Timing Report
          </button>
        </div>

        <BuildPreflight
          checks={preflight}
          onNavigate={onNavigate}
          collapsible
        />

        {errorMessage || artifact || !capabilities.bitstream.supported ? (
          <p
            className={`bitstream-status-message${errorMessage ? " error" : ""}`}
          >
            {errorMessage
              ? errorMessage
              : artifact
                ? `Built ${artifact.fileName} · ${formatTimingStatus(artifact.timing)}`
                : capabilities.bitstream.detail}
          </p>
        ) : null}

        <div className="bitstream-results">
          <div
            className="bitstream-output-tabs"
            role="tablist"
            aria-label="Build output"
          >
            <button
              type="button"
              role="tab"
              aria-selected={resultTab === "log"}
              onClick={() => selectResultTab("log")}
            >
              Build log
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={resultTab === "preview"}
              onClick={() => selectResultTab("preview")}
            >
              Bitstream preview
            </button>
          </div>
          <div
            className="dashboard-glass-card bitstream-output-panel"
            role="tabpanel"
          >
            <div ref={logPanelRef} className="bitstream-output-content">
              {resultTab === "log"
                ? liveLogs.length
                  ? liveLogs.join("\n")
                  : isGenerating
                    ? "Starting build..."
                    : "Build output will appear here when you generate a bitstream."
                : artifact
                  ? artifact.preview
                  : `No bitstream generated yet.\n\nExpected output: ${sanitizeName(projectName || "allora_project")}.${extension}`}
            </div>
          </div>
        </div>
      </section>

      <aside className="bitstream-sidebar" aria-label="Build details">
        <InfoCard title="Build details" compact>
          <InfoRow
            label="Filename"
            value={
              artifact?.fileName ??
              `${sanitizeName(projectName || "allora_project")}.${extension}`
            }
            compact
          />
          <InfoRow label="Board" value={board.name} compact />
          <InfoRow
            label="Top module"
            value={topModule ?? "Not found"}
            compact
          />
          <InfoRow
            label="Size"
            value={
              artifact
                ? `${artifact.byteLength.toLocaleString()} bytes`
                : "Not built"
            }
            compact
          />
          <InfoRow label="Toolchain" value={capabilities.toolchain} compact />
        </InfoCard>

        <InfoCard title="Pin mapping" compact>
          <p className="bitstream-mapping-summary">
            {autoMappings.length - unmappedPorts.length}/{autoMappings.length}{" "}
            ports mapped
          </p>
          {autoMappings.length ? (
            <details className="bitstream-mapping-details">
              <summary>Inspect mapped ports</summary>
              <div className="bitstream-mapping-list">
                {autoMappings.map((mapping) => (
                  <div
                    className={`bitstream-mapping-row${mapping.pin ? "" : " unmapped"}`}
                    key={mapping.port.name}
                  >
                    <strong className="bitstream-mapping-port">
                      {mapping.port.name}
                    </strong>
                    <small className="bitstream-mapping-pin">
                      {mapping.pin
                        ? mapping.pin.label
                        : "Unmapped — open Pin Mapping to assign a pin"}
                    </small>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <p className="bitstream-mapping-empty">No ports detected yet.</p>
          )}
        </InfoCard>
      </aside>
    </div>
  );
}

function formatTimingStatus(timing: TimingAnalysisResult) {
  switch (timing.status) {
    case "pass":
      return "timing met";
    case "fail":
      return "timing failed";
    case "unconstrained":
      return "timing unconstrained";
    case "no-paths":
      return "no clock-to-clock path";
    default:
      return "timing unavailable";
  }
}

function createHexPreview(
  bytes: Uint8Array,
  {
    board,
    topModule,
    files,
    fileStem,
    extension,
  }: {
    board: BoardDefinition;
    topModule: string | null;
    files: ProjectFile[];
    fileStem: string;
    extension: string;
  },
) {
  const lines = [];

  lines.push(`# Bitstream`);
  lines.push(`file: ${fileStem}.${extension}`);
  lines.push(`board: ${board.name}`);
  lines.push(`device: ${board.fpgaId}`);
  lines.push(`top: ${topModule ?? "unknown"}`);
  lines.push(`inputs: ${files.map((file) => file.name).join(", ")}`);
  lines.push("");

  for (let offset = 0; offset < Math.min(bytes.length, 320); offset += 16) {
    const slice = bytes.slice(offset, offset + 16);
    const hex = Array.from(slice)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(" ");
    lines.push(`${offset.toString(16).padStart(4, "0")}: ${hex}`);
  }

  if (bytes.length > 320) {
    lines.push("");
    lines.push(`... ${bytes.length - 320} more bytes`);
  }

  return lines.join("\n");
}

function createBuildLogArtifact({
  board,
  artifact,
  constraintsFileName,
  topModule,
}: {
  board: BoardDefinition;
  artifact: BitstreamArtifact;
  constraintsFileName: string;
  topModule: string;
}) {
  return [
    `Allora build report`,
    `board: ${board.name}`,
    `device: ${board.fpgaId}`,
    `top: ${topModule}`,
    `constraints: ${constraintsFileName}`,
    `bitstream: ${artifact.fileName}`,
    `bitstream bytes: ${artifact.byteLength}`,
    `generated: ${artifact.generatedAt}`,
    ``,
    artifact.logs.length > 0
      ? artifact.logs.join("\n")
      : "No toolchain log output was returned.",
  ].join("\n");
}

function createGeneratedConstraints(
  board: BoardDefinition,
  ports: HdlPort[],
  projectName: string,
) {
  if (ports.length === 0) return "";

  const mappings = createConstraintMappings(board, ports);
  const lines = [
    `# ${board.name} generated constraints for ${sanitizeName(projectName)}`,
  ];

  for (const { port, pin } of mappings) {
    if (!pin?.pin) {
      lines.push(`# ${port.name} is unmapped`);
      continue;
    }

    if (board.constraintsFile === "xdc") {
      lines.push(
        `set_property PACKAGE_PIN ${pin.pin.split("/")[0]} [get_ports ${port.name}]`,
      );
      lines.push(
        `set_property IOSTANDARD ${pin.ioStandard} [get_ports ${port.name}]`,
      );
    } else if (board.constraintsFile === "pcf") {
      lines.push(`set_io ${port.name} ${pin.pin}`);
    } else if (board.constraintsFile === "lpf") {
      lines.push(`LOCATE COMP "${port.name}" SITE "${pin.pin}";`);
      lines.push(`IOBUF PORT "${port.name}" IO_TYPE=${pin.ioStandard};`);
    } else if (board.constraintsFile === "cst") {
      lines.push(`IO_LOC "${port.name}" ${pin.pin};`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function createConstraintMappings(
  board: BoardDefinition,
  ports: HdlPort[],
  savedMappings: Record<string, string> | null = null,
) {
  const suggestions =
    savedMappings ?? createSuggestedMappings(ports, board.pins, board.clocks);
  const pinOptions = new Map(getPinOptions(board).map((pin) => [pin.key, pin]));

  return ports.map((port) => {
    const selectedPin = suggestions[port.name];
    return {
      port,
      pin: selectedPin ? (pinOptions.get(selectedPin) ?? null) : null,
    };
  });
}

function sanitizeName(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "allora_project"
  );
}

function getBitstreamExtension(board: BoardDefinition) {
  if (board.family.toLowerCase().includes("ice40")) return "bin";
  if (board.family.toLowerCase().includes("ecp5")) return "bit";
  return "bit";
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string") return value;
  }
  return "Bitstream generation failed.";
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  }
}
