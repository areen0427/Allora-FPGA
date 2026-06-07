import { useEffect, useMemo, useState } from "react";
import type { BoardDefinition } from "../../data/boards";
import InfoCard, { InfoRow } from "./InfoCard";
import { hasTauriInvoke, invokeTauri } from "../../lib/tauri";
import type { ProjectFile } from "./types";

type BitstreamSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
  projectPath?: string;
  topLevelFileName: string | null;
  onAddArtifact?: (artifact: {
    fileName: string;
    content: string;
    isBinary?: boolean;
  }) => Promise<void> | void;
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
};

type GenerateBitstreamResponse = {
  logs: string[];
  topModule: string;
  outputName: string;
  artifactPath?: string | null;
  bytes: number[];
};

export default function BitstreamSection({
  board,
  files,
  projectName,
  projectPath,
  topLevelFileName,
  onAddArtifact,
}: BitstreamSectionProps) {
  const [artifact, setArtifact] = useState<BitstreamArtifact | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hdlFiles = files.filter((file) => isHdlFile(file.name));
  const selectedTopLevelFile =
    topLevelFileName
      ? hdlFiles.find((file) => file.name === topLevelFileName) ?? null
      : null;
  const topModule = useMemo(
    () => findTopModule(selectedTopLevelFile ? [selectedTopLevelFile] : []),
    [selectedTopLevelFile]
  );
  const extension = getBitstreamExtension(board);
  const constraintFile =
    files.find((file) =>
      file.name.toLowerCase() === `constraints.${board.constraintsFile}`
    ) ??
    files.find((file) =>
      file.name.toLowerCase().endsWith(`.${board.constraintsFile}`)
    ) ??
    null;

  useEffect(() => {
    setArtifact(null);
    setErrorMessage(null);
  }, [board.id, files, projectName, topLevelFileName]);

  async function handleGenerateBitstream() {
    if (hdlFiles.length === 0) {
      setErrorMessage("No HDL files found. Create or import a top-level file first.");
      setArtifact(null);
      return;
    }

    if (!topModule) {
      setErrorMessage("The selected top-level file does not contain a readable module declaration.");
      setArtifact(null);
      return;
    }

    if (!constraintFile) {
      setErrorMessage(
        `No constraints.${board.constraintsFile} file was found in the project.`
      );
      setArtifact(null);
      return;
    }

    if (!hasTauriInvoke()) {
      setErrorMessage(
        "Launch the Tauri desktop app to generate a real bitstream."
      );
      setArtifact(null);
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const result = await invokeTauri<GenerateBitstreamResponse>(
        "generate_bitstream",
        {
          request: {
            projectName,
            boardName: board.name,
            boardFamily: board.family,
            boardPackage: board.package,
            fpgaId: board.fpgaId,
            synthesisFlow: board.synthesisFlow,
            topModule,
            sourceFiles: hdlFiles.map((file) => ({
              name: file.name,
              content: file.content,
            })),
            constraintFile: {
              name: constraintFile.name,
              content: constraintFile.content,
            },
            outputExtension: extension,
            projectPath,
          },
        }
      );

      const bytes = new Uint8Array(result.bytes);
      const preview = createHexPreview(bytes, {
        board,
        topModule: result.topModule,
        files: hdlFiles,
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
      };

      setArtifact(nextArtifact);
      await onAddArtifact?.({
        fileName: nextArtifact.fileName,
        content: `[binary ${extension.toUpperCase()} artifact generated at ${generatedAt}]`,
        isBinary: true,
      });
    } catch (error) {
      setArtifact(null);
      setErrorMessage(getErrorMessage(error));
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

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 240px",
        gap: "22px",
        alignItems: "start",
      }}
    >
      <InfoCard title="Bitstream">
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "16px",
            lineHeight: 1.55,
          }}
        >
          Generate a real programming artifact for supported local Yosys + NextPNR boards.
        </p>

        <div style={{ display: "flex", gap: "10px", marginTop: "22px", flexWrap: "wrap" }}>
          <button
            className="primary-action"
            type="button"
            onClick={handleGenerateBitstream}
            disabled={hdlFiles.length === 0 || isGenerating}
            style={{
              border: "none",
              borderRadius: "14px",
              background:
                hdlFiles.length > 0 && !isGenerating ? "#2563eb" : "#cbd5e1",
              color: "#ffffff",
              padding: "13px 18px",
              fontSize: "15px",
              fontWeight: 800,
              cursor:
                hdlFiles.length > 0 && !isGenerating ? "pointer" : "not-allowed",
            }}
          >
            {isGenerating ? "Generating..." : "Generate Bitstream"}
          </button>

          <button
            type="button"
            onClick={handleDownloadBitstream}
            disabled={!artifact}
            style={{
              border: "1px solid #dbe4f0",
              borderRadius: "14px",
              background: artifact ? "#ffffff" : "#f8fafc",
              color: artifact ? "#334155" : "#94a3b8",
              padding: "13px 18px",
              fontSize: "15px",
              fontWeight: 800,
              cursor: artifact ? "pointer" : "not-allowed",
            }}
          >
            Download
          </button>
        </div>

        <div
          style={{
            marginTop: "14px",
            padding: "12px 14px",
            borderRadius: "12px",
            background: errorMessage ? "#fef2f2" : "#f8fafc",
            border: errorMessage ? "1px solid #fecaca" : "1px solid #e2e8f0",
            color: errorMessage ? "#b91c1c" : "#64748b",
            fontSize: "13px",
            lineHeight: 1.45,
          }}
        >
          {errorMessage
            ? errorMessage
            : artifact
              ? "Bitstream generated and added to the project build folder."
              : "Ready to build a hardware artifact from the selected top-level file."}
        </div>

        <div
          className="dashboard-glass-card"
          style={{
            marginTop: "22px",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            background: "#f8fafc",
            color: "#334155",
            minHeight: "320px",
            padding: "18px",
            fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
            fontSize: "13px",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            overflow: "auto",
          }}
        >
          {artifact
            ? artifact.preview
            : `No bitstream generated yet.\n\nExpected output: ${sanitizeName(
                projectName || "allora_project"
              )}.${extension}`}
        </div>

        {artifact?.logs.length ? (
          <div
            className="dashboard-glass-card"
            style={{
              marginTop: "18px",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              background: "#ffffff",
              color: "#475569",
              padding: "16px",
              fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
              fontSize: "12px",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              maxHeight: "220px",
              overflow: "auto",
            }}
          >
            {artifact.logs.join("\n")}
          </div>
        ) : null}
      </InfoCard>

      <div style={{ display: "grid", gap: "22px" }}>
        <InfoCard title="Output" style={{ padding: "20px", borderRadius: "20px" }}>
          <InfoRow
            label="Filename"
            value={
              artifact?.fileName ??
              `${sanitizeName(projectName || "allora_project")}.${extension}`
            }
          />
          <InfoRow label="Format" value={extension.toUpperCase()} />
          <InfoRow label="Bytes" value={String(artifact?.byteLength ?? 0)} />
          <InfoRow label="Generated" value={artifact?.generatedAt ?? "Not generated"} />
        </InfoCard>

        <InfoCard title="Source" style={{ padding: "20px", borderRadius: "20px" }}>
          <InfoRow label="Board" value={board.name} />
          <InfoRow label="Top Module" value={topModule ?? "Not found"} />
          <InfoRow label="HDL Files" value={String(hdlFiles.length)} />
          <InfoRow
            label="Constraints"
            value={constraintFile?.name ?? `constraints.${board.constraintsFile}`}
          />
        </InfoCard>
      </div>
    </div>
  );
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
  }
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
  return (
    name.trim().replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") ||
    "allora_project"
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
