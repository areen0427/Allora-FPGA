import { useEffect, useState } from "react";
import type { BoardDefinition } from "../../data/boards";
import InfoCard, { InfoRow } from "./InfoCard";
import { formatSynthesisFlow } from "./format";
import type { ProjectFile } from "./types";

type BitstreamSectionProps = {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
};

type BitstreamArtifact = {
  fileName: string;
  extension: string;
  byteLength: number;
  bytes: Uint8Array;
  preview: string;
  topModule: string | null;
  generatedAt: string;
};

export default function BitstreamSection({
  board,
  files,
  projectName,
}: BitstreamSectionProps) {
  const [artifact, setArtifact] = useState<BitstreamArtifact | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const hdlFiles = files.filter((file) => isHdlFile(file.name));
  const topModule = findTopModule(hdlFiles);
  const extension = getBitstreamExtension(board);

  useEffect(() => {
    setArtifact(null);
  }, [board.id, files, projectName]);

  async function handleGenerateBitstream() {
    if (hdlFiles.length === 0) return;

    setIsGenerating(true);
    try {
      const nextArtifact = await generateBitstreamArtifact({
        board,
        files: hdlFiles,
        projectName,
        topModule,
      });
      setArtifact(nextArtifact);
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
          Generate a downloadable bitstream artifact preview from the current
          project state.
        </p>

        <div style={{ display: "flex", gap: "10px", marginTop: "22px" }}>
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
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            color: "#64748b",
            fontSize: "13px",
            lineHeight: 1.45,
          }}
        >
          Preview artifact only. Native toolchain integration for a true
          programming bitstream is not wired into Tauri yet.
        </div>

        <div
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
          <InfoRow label="Flow" value={formatSynthesisFlow(board.synthesisFlow)} />
          <InfoRow label="Top Module" value={topModule ?? "Auto detect"} />
          <InfoRow label="HDL Files" value={String(hdlFiles.length)} />
        </InfoCard>
      </div>
    </div>
  );
}

async function generateBitstreamArtifact({
  board,
  files,
  projectName,
  topModule,
}: {
  board: BoardDefinition;
  files: ProjectFile[];
  projectName: string;
  topModule: string | null;
}) {
  const extension = getBitstreamExtension(board);
  const fileStem = sanitizeName(projectName || "allora_project");
  const source = JSON.stringify({
    boardId: board.id,
    boardFamily: board.family,
    projectName,
    topModule,
    files,
  });

  const bytes = await createPreviewBytes(source, 512);
  const preview = createHexPreview(bytes, {
    board,
    topModule,
    files,
    fileStem,
    extension,
  });

  return {
    fileName: `${fileStem}.${extension}`,
    extension,
    byteLength: bytes.length,
    bytes,
    preview,
    topModule,
    generatedAt: new Date().toLocaleString(),
  };
}

async function createPreviewBytes(source: string, targetLength: number) {
  const encoder = new TextEncoder();
  let seed = encoder.encode(source);
  const chunks: number[] = [];

  while (chunks.length < targetLength) {
    const digest = await crypto.subtle.digest("SHA-256", seed);
    const digestBytes = Array.from(new Uint8Array(digest));
    chunks.push(...digestBytes);
    seed = new Uint8Array(digest);
  }

  return new Uint8Array(chunks.slice(0, targetLength));
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

  lines.push(`# Bitstream Preview`);
  lines.push(`file: ${fileStem}.${extension}`);
  lines.push(`board: ${board.name}`);
  lines.push(`device: ${board.fpgaId}`);
  lines.push(`top: ${topModule ?? "auto"}`);
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
