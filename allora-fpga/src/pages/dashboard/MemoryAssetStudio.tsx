import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Upload,
  Image as ImageIcon,
  FileDigit,
  Table2,
} from "lucide-react";
import { invokeTauri } from "../../lib/tauri";
import MemoryAssetStudioIcon from "../../components/MemoryAssetStudioIcon";
import {
  convertBinary,
  convertPixels,
  digest,
  parseTable,
  parseAssetManifest,
  rom,
  safeName,
  toHex,
} from "../../lib/memoryAssets";
import type {
  AssetManifest,
  AssetOptions,
  BinaryOptions,
  ImageOptions,
  MemoryAsset,
  MemoryImage,
  TableOptions,
  TableRow,
} from "../../lib/memoryAssets";
import type { ProjectFile } from "./types";
import "../../styles/memory-assets.css";

const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const manifestPath = "assets/memory-assets.json";
const imageDefaults: ImageOptions = {
  mode: "mono",
  threshold: 128,
  alpha: "transparent-black",
};
const binaryDefaults: BinaryOptions = {
  wordWidth: 8,
  byteOrder: "big",
  offset: 0,
  padding: "zero",
};
const tableDefaults: TableOptions = {
  column: 0,
  header: false,
  signed: false,
  wordWidth: 16,
  fractionalBits: 0,
  rounding: "nearest",
  overflow: "reject",
};
type Preview = {
  memories: Array<{ name: string; image: MemoryImage }>;
  rows?: TableRow[];
  originalUrl?: string;
  convertedUrl?: string;
  width?: number;
  height?: number;
  pixels?: Uint8ClampedArray;
};

function message(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : JSON.stringify(error);
}
function request(
  projectPath: string,
  relativePath: string,
  extra: Record<string, unknown> = {},
) {
  return { request: { projectPath, relativePath, ...extra } };
}
async function read(
  projectPath: string,
  relativePath: string,
): Promise<Uint8Array | null> {
  const bytes = await invokeTauri<number[] | null>(
    "read_asset_file",
    request(projectPath, relativePath),
  );
  return bytes === null ? null : Uint8Array.from(bytes);
}
async function previewAsset(
  asset: MemoryAsset,
  bytes: Uint8Array,
): Promise<Preview> {
  if (asset.kind === "binary")
    return {
      memories: [
        {
          name: "Data",
          image: convertBinary(bytes, asset.options as BinaryOptions),
        },
      ],
    };
  if (asset.kind === "table") {
    const result = parseTable(
      decoder.decode(bytes),
      asset.options as TableOptions,
    );
    return {
      memories: [{ name: "Data", image: result.image }],
      rows: result.rows,
    };
  }
  const blob = new Blob([new Uint8Array(bytes)], {
    type: asset.source.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg",
  });
  const url = URL.createObjectURL(blob);
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob);
    const options = asset.options as ImageOptions;
    if (bitmap.width * bitmap.height > 16_000_000)
      throw new Error(
        "Source image exceeds the sixteen million pixel decoding limit.",
      );
    const width = options.width ?? bitmap.width,
      height = options.height ?? bitmap.height;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width * height > 1_000_000 ||
      width < 1 ||
      height < 1
    )
      throw new Error("Images are limited to one million output pixels.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable.");
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0, width, height);
    const converted = convertPixels(
      context.getImageData(0, 0, width, height).data,
      width,
      height,
      options,
    );
    converted.image.sourceSize = bytes.length;
    if (converted.palette) converted.palette.sourceSize = bytes.length;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(converted.preview), width, height),
      0,
      0,
    );
    const convertedUrl = canvas.toDataURL("image/png");
    return {
      memories: [
        { name: "Pixels", image: converted.image },
        ...(converted.palette
          ? [{ name: "Palette", image: converted.palette }]
          : []),
      ],
      originalUrl: url,
      convertedUrl,
      width,
      height,
      pixels: converted.preview,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    bitmap?.close();
  }
}

type DialogRequest = {
  title: string;
  detail: string;
  initial?: string;
  choices: string[];
};
function AssetDialog({
  request,
  onResolve,
}: {
  request: DialogRequest;
  onResolve: (value: string | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(request.initial ?? "");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="mas-dialog"
      aria-labelledby="mas-dialog-title"
      onCancel={() => onResolve(null)}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onResolve(
            request.initial !== undefined ? value.trim() : request.choices[0],
          );
        }}
      >
        <h2 id="mas-dialog-title">{request.title}</h2>
        <p>{request.detail}</p>
        {request.initial !== undefined && (
          <label>
            Asset name
            <input
              autoFocus
              value={value}
              maxLength={80}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        )}
        <div className="mas-actions">
          <button type="button" onClick={() => onResolve(null)}>
            Cancel
          </button>
          {request.choices.map((choice, index) => (
            <button
              key={choice}
              className={index === 0 ? "mas-primary" : ""}
              type={index === 0 ? "submit" : "button"}
              disabled={request.initial !== undefined && !value.trim()}
              onClick={index === 0 ? undefined : () => onResolve(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      </form>
    </dialog>
  );
}

export default function MemoryAssetStudio({
  projectPath,
  onGenerated,
  onOpenFile,
}: {
  projectPath?: string;
  onGenerated: (files: ProjectFile[], removed: string[]) => void;
  onOpenFile: (name: string) => void;
}) {
  const [manifest, setManifest] = useState<AssetManifest>({
    schemaVersion: 1,
    assets: [],
  });
  const [manifestBytes, setManifestBytes] = useState<Uint8Array | null>(null);
  const [manifestError, setManifestError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [inspected, setInspected] = useState(0);
  const [memoryIndex, setMemoryIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [sourceChanged, setSourceChanged] = useState(false);
  const [outputsChanged, setOutputsChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const actionLock = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [draft, setDraft] = useState<AssetOptions | null>(null);
  const [includeRom, setIncludeRom] = useState(true);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const dialogResolve = useRef<((value: string | null) => void) | null>(null);
  function ask(request: DialogRequest): Promise<string | null> {
    setDialog(request);
    return new Promise((resolve) => {
      dialogResolve.current = resolve;
    });
  }
  function resolveDialog(value: string | null) {
    dialogResolve.current?.(value);
    dialogResolve.current = null;
    setDialog(null);
  }
  useEffect(
    () => () => {
      dialogResolve.current?.(null);
    },
    [],
  );
  const asset = manifest.assets.find((item) => item.id === selected) ?? null;
  const settings = draft ?? asset?.options;
  const dirty =
    !!asset && JSON.stringify(settings) !== JSON.stringify(asset.options);
  const currentMemory = preview?.memories[memoryIndex]?.image;
  const generatedCurrent = asset
    ? asset.generatedSettings === JSON.stringify(asset.options) &&
      !dirty &&
      includeRom ===
        !!asset.outputs?.some((output) => output.path.endsWith(".v")) &&
      !sourceChanged &&
      !outputsChanged
    : false;

  useEffect(() => {
    if (!projectPath) return;
    setLoaded(false);
    setManifestError(false);
    setManifest({ schemaVersion: 1, assets: [] });
    setSelected(null);
    let live = true;
    void read(projectPath, manifestPath)
      .then((bytes) => {
        if (!live) return;
        setManifestBytes(bytes);
        if (bytes) {
          const parsed = parseAssetManifest(decoder.decode(bytes));
          setManifest(parsed);
          setSelected(parsed.assets[0]?.id ?? null);
        }
      })
      .catch((error) => {
        if (live) {
          setManifestError(true);
          setStatus(message(error));
        }
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [projectPath]);
  useEffect(() => {
    setPreview((current) => {
      if (current?.originalUrl) URL.revokeObjectURL(current.originalUrl);
      return null;
    });
    setSourceBytes(null);
    setSourceChanged(false);
    setOutputsChanged(false);
    setDraft(asset?.options ?? null);
    setIncludeRom(
      !asset?.generatedAt ||
        !!asset.outputs?.some((output) => output.path.endsWith(".v")),
    );
    if (!projectPath || !asset) return;
    setPreviewLoading(true);
    let live = true;
    let originalUrl: string | undefined;
    void (async () => {
      const bytes = await read(projectPath, asset.source);
      if (!bytes) throw new Error("Source is missing from the project.");
      const hash = await digest(bytes);

      const changedOutputs = await Promise.all(
        (asset.outputs ?? []).map(async (output) => {
          const content = await read(projectPath, output.path);
          return !content || (await digest(content)) !== output.hash;
        }),
      );
      if (!live) return;
      setSourceChanged(hash !== asset.sourceHash);
      setOutputsChanged(changedOutputs.some(Boolean));
      if (hash !== asset.sourceHash || changedOutputs.some(Boolean))
        setStatus(
          "Source or generated files changed on disk. Review before regenerating.",
        );
      const result = await previewAsset(asset, bytes);
      if (!live) {
        if (result.originalUrl) URL.revokeObjectURL(result.originalUrl);
        return;
      }
      originalUrl = result.originalUrl;
      setSourceBytes(bytes);
      setPreview(result);
      setInspected(0);
      setMemoryIndex(0);
    })()
      .catch((error) => {
        if (live) {
          setPreview(null);
          setStatus(message(error));
        }
      })
      .finally(() => {
        if (live) setPreviewLoading(false);
      });
    return () => {
      live = false;
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    };
  }, [projectPath, asset]);
  async function persist(
    next: AssetManifest,
    changes: Array<{
      path: string;
      bytes: Uint8Array | null;
      prior: Uint8Array | null;
    }> = [],
  ) {
    if (!projectPath)
      throw new Error("Save the project before using Memory Asset Studio.");
    if (manifestError)
      throw new Error(
        "The asset manifest is invalid; repair it before changing assets.",
      );
    const bytes = encoder.encode(JSON.stringify(next, null, 2) + "\n");
    await invokeTauri("commit_asset_files", {
      requests: [
        ...changes,
        { path: manifestPath, bytes, prior: manifestBytes },
      ].map((change) => ({
        projectPath,
        relativePath: change.path,
        content: change.bytes === null ? null : Array.from(change.bytes),
        expected: change.prior === null ? null : Array.from(change.prior),
      })),
    });
    setManifestBytes(bytes);
    setManifest(next);
  }
  async function run(action: () => Promise<void>) {
    if (actionLock.current || !loaded || manifestError) return;
    actionLock.current = true;
    setBusy(true);
    setStatus("");
    try {
      await action();
    } catch (error) {
      setStatus(message(error));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !projectPath) return;
    void run(async () => {
      const lower = file.name.toLowerCase();
      const kind = /\.(png|jpe?g)$/.test(lower)
        ? "image"
        : /\.(csv|txt)$/.test(lower)
          ? "table"
          : "binary";
      if (!file.size || file.size > 8_000_000)
        throw new Error("Source must be between 1 byte and 8 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!bytes.length || bytes.length > 8_000_000)
        throw new Error("Source must be between 1 byte and 8 MB.");
      const id = crypto.randomUUID();
      const extension = kind === "binary" ? "bin" : lower.split(".").pop();
      const source = `assets/sources/${id}_${safeName(file.name.replace(/\.[^.]+$/, ""))}.${extension}`;
      const next: MemoryAsset = {
        id,
        name: safeName(file.name.replace(/\.[^.]+$/, "")),
        kind,
        source,
        sourceHash: await digest(bytes),
        options:
          kind === "image"
            ? imageDefaults
            : kind === "table"
              ? tableDefaults
              : binaryDefaults,
      };
      await persist({ schemaVersion: 1, assets: [...manifest.assets, next] }, [
        { path: source, bytes, prior: null },
      ]);
      setSelected(id);
      setStatus(
        `Imported ${file.name}. Configure and generate to use it in the project.`,
      );
    });
  }
  function updateOptions(patch: Partial<AssetOptions>) {
    if (!asset) return;
    setDraft(
      (current) =>
        ({ ...(current ?? asset.options), ...patch }) as AssetOptions,
    );
  }
  function applySettings() {
    if (!asset || !draft || !projectPath) return;
    void run(async () => {
      const bytes = await read(projectPath, asset.source);
      if (!bytes) throw new Error("Source is missing from the project.");
      const next = { ...asset, options: draft };
      const checked = await previewAsset(next, bytes);
      if (checked.originalUrl) URL.revokeObjectURL(checked.originalUrl);
      await persist({
        ...manifest,
        assets: manifest.assets.map((item) =>
          item.id === asset.id ? next : item,
        ),
      });
      setStatus(
        "Settings applied. Generate files to update the project memory.",
      );
    });
  }
  function rename() {
    if (!asset) return;
    void run(async () => {
      const name = await ask({
        title: "Rename asset",
        detail: "Generated file names stay stable when you rename an asset.",
        initial: asset.name,
        choices: ["Save name"],
      });
      if (!name) return;
      if (
        manifest.assets.some(
          (item) => item.id !== asset.id && item.name === name,
        )
      )
        throw new Error("Another asset has that name.");
      await persist({
        ...manifest,
        assets: manifest.assets.map((item) =>
          item.id === asset.id ? { ...item, name } : item,
        ),
      });
    });
  }
  async function generate() {
    if (!asset || !preview || !projectPath || !sourceBytes) return;
    await run(async () => {
      const latest = await read(projectPath, asset.source);
      if (!latest) throw new Error("Source is missing.");
      if (
        (await digest(latest)) !== asset.sourceHash &&
        !(await ask({
          title: "Source changed",
          detail: "Generate from the modified source and record its new hash?",
          choices: ["Use modified source"],
        }))
      )
        return;
      const fresh = await previewAsset(asset, latest);
      if (fresh.originalUrl) URL.revokeObjectURL(fresh.originalUrl);
      const base = `memory_${asset.id.replaceAll("-", "")}`;
      const generated = fresh.memories.map((part, index) => ({
        path: `src/generated/${base}${index ? "_palette" : ""}.hex`,
        bytes: encoder.encode(toHex(part.image)),
      }));

      if (includeRom)
        for (let index = 0; index < fresh.memories.length; index++) {
          const part = fresh.memories[index],
            path = generated[index].path;
          generated.push({
            path: `src/generated/${base}${index ? "_palette" : ""}_rom.v`,
            bytes: encoder.encode(
              rom(`${base}${index ? "_palette" : ""}`, part.image, path),
            ),
          });
        }
      const outputRecords: Array<{ path: string; hash: string }> = [];
      const writes: Array<{ path: string; prior: Uint8Array | null }> = [];
      for (const output of generated) {
        const originalPath = output.path;
        const prior = await read(projectPath, output.path);
        const old = asset.outputs?.find((item) => item.path === output.path);
        if (prior && (!old || (await digest(prior)) !== old.hash)) {
          const choice = await ask({
            title: "Generated file changed",
            detail: `${output.path} has manual changes or collides with another file.`,
            choices: ["Save new file", "Overwrite"],
          });
          if (!choice) return;
          if (choice === "Save new file") {
            let number = 2;
            while (true) {
              const alternate = output.path.replace(
                /(\.[^.]+)$/,
                `_${number++}$1`,
              );
              if (!(await read(projectPath, alternate))) {
                output.path = alternate;
                break;
              }
            }
          }
        }
        writes.push({
          path: output.path,
          prior: output.path === originalPath ? prior : null,
        });
      }
      if (includeRom)
        for (let index = 0; index < fresh.memories.length; index++) {
          generated[fresh.memories.length + index].bytes = encoder.encode(
            rom(
              `${base}${index ? "_palette" : ""}`,
              fresh.memories[index].image,
              generated[index].path,
            ),
          );
        }
      for (const output of generated) {
        outputRecords.push({
          path: output.path,
          hash: await digest(output.bytes),
        });
      }
      const updated = {
        ...asset,
        sourceHash: await digest(latest),
        outputs: outputRecords,
        generatedAt: new Date().toISOString(),
        generatedSettings: JSON.stringify(asset.options),
      };
      await persist(
        {
          ...manifest,
          assets: manifest.assets.map((item) =>
            item.id === asset.id ? updated : item,
          ),
        },
        generated.map((output, index) => ({
          path: output.path,
          bytes: output.bytes,
          prior: writes[index].prior,
        })),
      );
      onGenerated(
        generated.map((output) => ({
          name: output.path.slice(4),
          path: `${projectPath}/${output.path}`,
          content: decoder.decode(output.bytes),
        })),
        asset.outputs?.map((output) => output.path.slice(4)) ?? [],
      );
      setStatus(
        `Generated ${generated.length} project file(s). ROM wrappers are available to Simulate and Build.`,
      );
    });
  }
  function remove() {
    if (!asset || !projectPath) return;
    void run(async () => {
      const choice = await ask({
        title: `Remove ${asset.name}?`,
        detail:
          "Remove this asset from the Studio. Keep files to preserve its source and generated outputs on disk, or delete them from the project.",
        choices: ["Keep files", "Delete files"],
      });
      if (!choice) return;
      const changes: Array<{ path: string; bytes: null; prior: Uint8Array }> =
        [];
      if (choice === "Delete files") {
        const targets = await Promise.all(
          [
            asset.source,
            ...(asset.outputs?.map((output) => output.path) ?? []),
          ].map(async (path) => ({
            path,
            bytes: await read(projectPath, path),
          })),
        );
        for (const { path, bytes } of targets) {
          if (!bytes) continue;
          const savedHash =
            path === asset.source
              ? asset.sourceHash
              : asset.outputs?.find((output) => output.path === path)?.hash;
          if (
            (await digest(bytes)) !== savedHash &&
            !(await ask({
              title: "File changed on disk",
              detail: `Delete ${path} including its manual changes?`,
              choices: ["Delete file"],
            }))
          )
            throw new Error("Removal cancelled; existing files were kept.");
        }
        for (const { path, bytes } of [...targets].reverse())
          if (bytes) changes.push({ path, bytes: null, prior: bytes });
      }
      await persist(
        {
          ...manifest,
          assets: manifest.assets.filter((item) => item.id !== asset.id),
        },
        changes,
      );
      setSelected(
        manifest.assets.find((item) => item.id !== asset.id)?.id ?? null,
      );
      onGenerated(
        [],
        [
          ...(asset.outputs?.map((output) => output.path.slice(4)) ?? []),
          asset.source.split("/").pop() ?? "",
        ],
      );
    });
  }
  if (!projectPath)
    return (
      <section className="mas">
        <h1>Memory Asset Studio</h1>
        <p>Open a saved project folder to import assets.</p>
      </section>
    );
  return (
    <section className="mas">
      <header className="mas-header">
        <div>
          <span className="mas-kicker">PROJECT ASSETS</span>
          <h1>Memory Asset Studio</h1>
          <p>Convert source data into deterministic FPGA memories.</p>
        </div>
        <button
          className="mas-primary"
          disabled={busy || dirty || !loaded || manifestError}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} aria-hidden="true" /> Import source
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept=".png,.jpg,.jpeg,.bin,.dat,.csv,.txt,application/octet-stream"
          onChange={importFile}
        />
      </header>
      {status && (
        <p className="mas-status" role="status">
          {status}
        </p>
      )}
      {dialog && <AssetDialog request={dialog} onResolve={resolveDialog} />}
      {!loaded ? (
        <div className="mas-empty" role="status">
          Loading project assets…
        </div>
      ) : manifestError ? (
        <div className="mas-empty">
          <h2>Unable to load assets</h2>
          <p>
            Repair assets/memory-assets.json and reopen the project to continue.
          </p>
        </div>
      ) : !manifest.assets.length ? (
        <div className="mas-empty">
          <div className="mas-empty-icon">
            <MemoryAssetStudioIcon size={30} />
          </div>
          <span className="mas-kicker">FROM SOURCE TO SILICON</span>
          <h2>Your next memory starts here</h2>
          <p>
            Import a source, fine-tune the conversion, and generate memory files
            ready for your FPGA project.
          </p>
          <button
            className="mas-primary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={16} aria-hidden="true" />
            Import your first source
          </button>
          <div className="mas-formats">
            <div>
              <ImageIcon size={20} aria-hidden="true" />
              <strong>Images</strong>
              <span>PNG & JPEG</span>
              <small>Monochrome, indexed or RGB565</small>
            </div>
            <div>
              <FileDigit size={20} aria-hidden="true" />
              <strong>Binary data</strong>
              <span>BIN & DAT</span>
              <small>8, 16, 24 or 32-bit words</small>
            </div>
            <div>
              <Table2 size={20} aria-hidden="true" />
              <strong>Numeric tables</strong>
              <span>CSV & TXT</span>
              <small>Signed and fixed-point values</small>
            </div>
          </div>
          <small>
            Sources are copied into your project. Files are generated only when
            you choose.
          </small>
        </div>
      ) : (
        <div className="mas-grid">
          <aside className="mas-assets">
            <h2>
              Assets <span className="mas-count">{manifest.assets.length}</span>
            </h2>
            {manifest.assets.map((item) => (
              <button
                key={item.id}
                className={item.id === selected ? "selected" : ""}
                disabled={busy || dirty}
                aria-pressed={item.id === selected}
                onClick={() => {
                  setStatus("");
                  setSelected(item.id);
                }}
              >
                <strong>{item.name}</strong>
                <small>
                  {item.kind} ·{" "}
                  {item.generatedAt ? "generated" : "preview only"}
                </small>
              </button>
            ))}
            {!manifest.assets.length && <p>Import a source to begin.</p>}
          </aside>
          <main className="mas-preview">
            {previewLoading ? (
              <p role="status">Preparing preview…</p>
            ) : asset && preview ? (
              <>
                <div className="mas-section-head">
                  <h2>{asset.name}</h2>
                  <span>
                    {generatedCurrent
                      ? "Preview matches generated settings"
                      : dirty
                        ? "Unapplied settings"
                        : "Ready to generate"}
                  </span>
                </div>
                {preview.originalUrl && (
                  <div className="mas-images">
                    <figure>
                      <img src={preview.originalUrl} alt="Original asset" />
                      <figcaption>Original</figcaption>
                    </figure>
                    <figure>
                      <img src={preview.convertedUrl} alt="Converted asset" />
                      <figcaption>Converted</figcaption>
                    </figure>
                  </div>
                )}
                {preview.rows && preview.rows.length > 1 && (
                  <svg
                    className="mas-plot"
                    viewBox="0 0 300 90"
                    role="img"
                    aria-label="Quantized values plot"
                  >
                    <polyline
                      fill="none"
                      stroke="#58a6ff"
                      strokeWidth="2"
                      points={(() => {
                        const values = preview
                          .rows!.slice(0, 128)
                          .map((row) => row.quantized);
                        const low = Math.min(...values),
                          span = Math.max(...values) - low || 1;
                        return values
                          .map(
                            (value, index) =>
                              `${(index * 300) / Math.max(1, values.length - 1)},${85 - ((value - low) * 80) / span}`,
                          )
                          .join(" ");
                      })()}
                    />
                  </svg>
                )}
                <div className="mas-stats">
                  {preview.memories.map((part, index) => (
                    <button
                      key={part.name}
                      className={memoryIndex === index ? "selected" : ""}
                      onClick={() => {
                        setMemoryIndex(index);
                        setInspected(0);
                      }}
                    >
                      {part.name}: {part.image.depth} × {part.image.wordWidth}{" "}
                      bits
                    </button>
                  ))}
                </div>
                {currentMemory && (
                  <>
                    <p>
                      Address order: {currentMemory.addressOrder}; source{" "}
                      {currentMemory.sourceSize} bytes; logical{" "}
                      {currentMemory.logicalSize} bits; stored{" "}
                      {currentMemory.paddedSize} bits.
                    </p>
                    <label>
                      Inspect address{" "}
                      <input
                        type="number"
                        min="0"
                        max={currentMemory.depth - 1}
                        value={inspected}
                        onChange={(event) =>
                          setInspected(
                            Math.max(
                              0,
                              Math.min(
                                currentMemory.depth - 1,
                                Math.trunc(Number(event.target.value) || 0),
                              ),
                            ),
                          )
                        }
                      />
                    </label>
                    <div className="mas-inspector">
                      <strong>Address {inspected}</strong>
                      <code>
                        0x
                        {currentMemory.words[inspected]
                          ?.toString(16)
                          .padStart(
                            Math.ceil(currentMemory.wordWidth / 4),
                            "0",
                          )}
                      </code>
                      {preview.width && memoryIndex === 0 && (
                        <span>
                          Pixel ({inspected % preview.width},{" "}
                          {Math.floor(inspected / preview.width)}) · decoded
                          RGB(
                          {preview.pixels?.[inspected * 4]},{" "}
                          {preview.pixels?.[inspected * 4 + 1]},{" "}
                          {preview.pixels?.[inspected * 4 + 2]})
                        </span>
                      )}
                      {asset.kind === "binary" && (
                        <span>
                          Source bytes{" "}
                          {(() => {
                            const size =
                                (asset.options as BinaryOptions).wordWidth / 8,
                              start =
                                (asset.options as BinaryOptions).offset +
                                inspected * size;
                            return `${start}–${Math.min(sourceBytes?.length ?? 0, start + size) - 1}: ${Array.from(
                              sourceBytes?.slice(start, start + size) ?? [],
                            )
                              .map((byte) => byte.toString(16).padStart(2, "0"))
                              .join(" ")}`;
                          })()}
                        </span>
                      )}
                      {preview.rows && (
                        <span>
                          Original {preview.rows[inspected]?.original};
                          quantized {preview.rows[inspected]?.quantized}; error{" "}
                          {preview.rows[inspected]?.error}
                        </span>
                      )}
                    </div>
                    <pre className="mas-hex">
                      {currentMemory.words
                        .slice(0, 128)
                        .map(
                          (word, index) =>
                            `${index.toString(16).padStart(6, "0")}: ${word.toString(16).padStart(Math.ceil(currentMemory.wordWidth / 4), "0")}`,
                        )
                        .join("\n")}
                      {currentMemory.depth > 128
                        ? "\n… first 128 words shown"
                        : ""}
                    </pre>
                  </>
                )}
                <div className="mas-actions">
                  <button
                    className="mas-primary"
                    disabled={busy || dirty}
                    onClick={() => void generate()}
                  >
                    {asset.generatedAt ? "Regenerate files" : "Generate files"}
                  </button>
                  <button disabled={busy || dirty} onClick={rename}>
                    Rename
                  </button>
                  <button disabled={busy || dirty} onClick={remove}>
                    Remove
                  </button>
                  {asset.outputs?.map((output) => (
                    <button
                      key={output.path}
                      onClick={() => onOpenFile(output.path.slice(4))}
                    >
                      Open {output.path.split("/").pop()}
                    </button>
                  ))}
                </div>
              </>
            ) : asset ? (
              <>
                <p>
                  The source is unavailable or the conversion settings are
                  invalid. Review the status above.
                </p>
                <div className="mas-actions">
                  <button disabled={busy || dirty} onClick={rename}>
                    Rename
                  </button>
                  <button disabled={busy || dirty} onClick={remove}>
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <p>Select an asset to inspect it.</p>
            )}
          </main>
          <aside className="mas-settings">
            <h2>Conversion settings</h2>
            <fieldset disabled={busy}>
              {asset?.kind === "image" && (
                <>
                  <label>
                    Format
                    <select
                      value={(settings as ImageOptions).mode}
                      onChange={(event) =>
                        updateOptions({
                          mode: event.target.value as ImageOptions["mode"],
                        })
                      }
                    >
                      <option value="mono">Monochrome</option>
                      <option value="indexed">Indexed RGB565 palette</option>
                      <option value="rgb565">RGB565</option>
                    </select>
                  </label>
                  <label>
                    Threshold
                    <input
                      type="number"
                      min="0"
                      max="255"
                      disabled={(settings as ImageOptions).mode !== "mono"}
                      value={(settings as ImageOptions).threshold}
                      onChange={(event) =>
                        updateOptions({ threshold: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Transparent pixels
                    <select
                      value={(settings as ImageOptions).alpha}
                      onChange={(event) =>
                        updateOptions({
                          alpha: event.target.value as ImageOptions["alpha"],
                        })
                      }
                    >
                      <option value="transparent-black">
                        Composite on black
                      </option>
                      <option value="transparent-white">
                        Composite on white
                      </option>
                    </select>
                  </label>
                  <label>
                    Output width (blank = original)
                    <input
                      type="number"
                      min="1"
                      value={(settings as ImageOptions).width ?? ""}
                      onChange={(event) =>
                        updateOptions({
                          width: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        })
                      }
                    />
                  </label>
                  <label>
                    Output height (blank = original)
                    <input
                      type="number"
                      min="1"
                      value={(settings as ImageOptions).height ?? ""}
                      onChange={(event) =>
                        updateOptions({
                          height: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        })
                      }
                    />
                  </label>
                </>
              )}
              {asset?.kind === "binary" && (
                <>
                  <label>
                    Word width
                    <select
                      value={(settings as BinaryOptions).wordWidth}
                      onChange={(event) =>
                        updateOptions({
                          wordWidth: Number(
                            event.target.value,
                          ) as BinaryOptions["wordWidth"],
                        })
                      }
                    >
                      {[8, 16, 24, 32].map((width) => (
                        <option key={width}>{width}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Byte order
                    <select
                      value={(settings as BinaryOptions).byteOrder}
                      onChange={(event) =>
                        updateOptions({
                          byteOrder: event.target
                            .value as BinaryOptions["byteOrder"],
                        })
                      }
                    >
                      <option value="big">Big endian</option>
                      <option value="little">Little endian</option>
                    </select>
                  </label>
                  <label>
                    Starting byte offset
                    <input
                      type="number"
                      min="0"
                      value={(settings as BinaryOptions).offset}
                      onChange={(event) =>
                        updateOptions({ offset: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Incomplete final word
                    <select
                      value={(settings as BinaryOptions).padding}
                      onChange={(event) =>
                        updateOptions({
                          padding: event.target
                            .value as BinaryOptions["padding"],
                        })
                      }
                    >
                      <option value="zero">Pad with zeros</option>
                      <option value="reject">Reject</option>
                    </select>
                  </label>
                </>
              )}
              {asset?.kind === "table" && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={(settings as TableOptions).header}
                      onChange={(event) =>
                        updateOptions({ header: event.target.checked })
                      }
                    />{" "}
                    First row is a header
                  </label>
                  <label>
                    Column (zero based)
                    <input
                      type="number"
                      min="0"
                      value={(settings as TableOptions).column}
                      onChange={(event) =>
                        updateOptions({ column: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Word width
                    <input
                      type="number"
                      min="1"
                      max="32"
                      value={(settings as TableOptions).wordWidth}
                      onChange={(event) =>
                        updateOptions({ wordWidth: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Fractional bits
                    <input
                      type="number"
                      min="0"
                      max="24"
                      value={(settings as TableOptions).fractionalBits}
                      onChange={(event) =>
                        updateOptions({
                          fractionalBits: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={(settings as TableOptions).signed}
                      onChange={(event) =>
                        updateOptions({ signed: event.target.checked })
                      }
                    />{" "}
                    Signed
                  </label>
                  <label>
                    Rounding
                    <select
                      value={(settings as TableOptions).rounding}
                      onChange={(event) =>
                        updateOptions({
                          rounding: event.target
                            .value as TableOptions["rounding"],
                        })
                      }
                    >
                      <option value="nearest">Nearest</option>
                      <option value="floor">Floor</option>
                      <option value="truncate">Truncate</option>
                    </select>
                  </label>
                  <label>
                    Overflow
                    <select
                      value={(settings as TableOptions).overflow}
                      onChange={(event) =>
                        updateOptions({
                          overflow: event.target
                            .value as TableOptions["overflow"],
                        })
                      }
                    >
                      <option value="reject">Reject</option>
                      <option value="saturate">Saturate</option>
                      <option value="wrap">Wrap</option>
                    </select>
                  </label>
                </>
              )}
            </fieldset>
            {asset && (
              <div className="mas-settings-footer">
                <p>
                  {dirty
                    ? "Apply your changes to refresh the preview."
                    : "Settings are saved with this project."}
                </p>
                <div className="mas-actions">
                  <button
                    className="mas-primary"
                    disabled={busy || !dirty}
                    onClick={applySettings}
                  >
                    Apply settings
                  </button>
                  <button
                    disabled={busy || !dirty}
                    onClick={() => setDraft(asset.options)}
                  >
                    Reset
                  </button>
                </div>
                <label className="mas-check">
                  <input
                    type="checkbox"
                    checked={includeRom}
                    disabled={busy}
                    onChange={(event) => setIncludeRom(event.target.checked)}
                  />
                  Include Verilog ROM wrapper
                </label>
              </div>
            )}
            {asset?.outputs && (
              <div className="mas-outputs">
                <h3>Generated files</h3>
                {asset.outputs.map((output) => (
                  <div key={output.path}>{output.path}</div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
