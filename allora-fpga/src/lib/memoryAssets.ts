export type MemoryImage = {
  wordWidth: number;
  depth: number;
  words: bigint[];
  addressOrder: "row-major" | "linear";
  sourceSize: number;
  logicalSize: number;
  paddedSize: number;
};
export type ImageOptions = {
  mode: "mono" | "indexed" | "rgb565";
  threshold: number;
  alpha: "transparent-black" | "transparent-white";
  width?: number;
  height?: number;
};
export type BinaryOptions = {
  wordWidth: 8 | 16 | 24 | 32;
  byteOrder: "little" | "big";
  offset: number;
  padding: "zero" | "reject";
};
export type TableOptions = {
  column: number;
  header: boolean;
  signed: boolean;
  wordWidth: number;
  fractionalBits: number;
  rounding: "nearest" | "floor" | "truncate";
  overflow: "reject" | "saturate" | "wrap";
};
export type AssetOptions = ImageOptions | BinaryOptions | TableOptions;
export type MemoryAsset = {
  id: string;
  name: string;
  kind: "image" | "binary" | "table";
  source: string;
  sourceHash: string;
  options: AssetOptions;
  outputs?: Array<{ path: string; hash: string }>;
  generatedAt?: string;
  generatedSettings?: string;
};
export type AssetManifest = { schemaVersion: 1; assets: MemoryAsset[] };
/** Validate disk metadata before it can control project file operations. */
export function parseAssetManifest(text: string): AssetManifest {
  const value = JSON.parse(text) as AssetManifest;
  const ids = new Set<string>();
  const sources = new Set<string>();
  const outputs = new Set<string>();
  const hash = (value: unknown) =>
    typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.assets))
    throw new Error("Unsupported memory asset manifest.");
  for (const asset of value.assets) {
    if (
      !asset ||
      typeof asset.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(asset.id) ||
      ids.has(asset.id) ||
      typeof asset.name !== "string" ||
      !asset.name.trim() ||
      !["image", "binary", "table"].includes(asset.kind) ||
      typeof asset.source !== "string" ||
      !/^assets\/sources\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(asset.source) ||
      sources.has(asset.source) ||
      !hash(asset.sourceHash) ||
      !asset.options ||
      typeof asset.options !== "object" ||
      Array.isArray(asset.options) ||
      (asset.outputs !== undefined && !Array.isArray(asset.outputs))
    )
      throw new Error("Malformed memory asset definition.");
    ids.add(asset.id);
    sources.add(asset.source);
    for (const output of asset.outputs ?? []) {
      if (
        !output ||
        typeof output.path !== "string" ||
        !/^src\/generated\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(hex|v)$/.test(
          output.path,
        ) ||
        !hash(output.hash) ||
        outputs.has(output.path)
      )
        throw new Error("Invalid or shared generated asset path.");
      outputs.add(output.path);
    }
  }
  return value;
}

export type TableRow = {
  original: number;
  quantized: number;
  encoded: bigint;
  error: number;
};

export function memory(
  words: bigint[],
  wordWidth: number,
  sourceSize: number,
  logicalSize = words.length * wordWidth,
  addressOrder: MemoryImage["addressOrder"] = "linear",
): MemoryImage {
  if (
    !Number.isInteger(wordWidth) ||
    wordWidth < 1 ||
    wordWidth > 32 ||
    words.length === 0 ||
    words.length > 1_000_000
  )
    throw new Error("Memory width or depth is unsupported.");
  const limit = 1n << BigInt(wordWidth);
  if (words.some((word) => word < 0n || word >= limit))
    throw new Error("Memory word exceeds its configured width.");
  return {
    words,
    wordWidth,
    depth: words.length,
    addressOrder,
    sourceSize,
    logicalSize,
    paddedSize: words.length * wordWidth,
  };
}
export function toHex(image: MemoryImage): string {
  const digits = Math.ceil(image.wordWidth / 4);
  return (
    image.words
      .map((word) => word.toString(16).padStart(digits, "0"))
      .join("\n") + "\n"
  );
}
export function safeName(value: string): string {
  const name = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return /^[A-Za-z_]/.test(name) ? name || "asset" : `asset_${name}`;
}
export function rom(
  name: string,
  image: MemoryImage,
  memoryFile: string,
): string {
  const id = safeName(name);
  const addressWidth = Math.max(1, Math.ceil(Math.log2(image.depth)));
  return `// Synchronous ROM: data is registered on each rising edge.\n// Out-of-range addresses return zero. Memory file is row-major/linear, address 0 first.\nmodule ${id}_rom(input wire clk, input wire [${addressWidth - 1}:0] addr, output reg [${image.wordWidth - 1}:0] data);\n  reg [${image.wordWidth - 1}:0] mem [0:${image.depth - 1}];\n  initial $readmemh("${memoryFile}", mem);\n  always @(posedge clk) begin\n    if (addr < ${image.depth}) data <= mem[addr];\n    else data <= ${image.wordWidth}'d0;\n  end\nendmodule\n`;
}
export function convertBinary(
  bytes: Uint8Array,
  options: BinaryOptions,
): MemoryImage {
  const { wordWidth, byteOrder, offset, padding } = options;
  if (
    ![8, 16, 24, 32].includes(wordWidth) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset >= bytes.length ||
    !["big", "little"].includes(byteOrder) ||
    !["zero", "reject"].includes(padding)
  )
    throw new Error("Invalid binary conversion settings.");
  const size = wordWidth / 8;
  if (Math.ceil((bytes.length - offset) / size) > 1_000_000)
    throw new Error("Binary exceeds the one million word limit.");
  const input = bytes.subarray(offset);
  if (padding === "reject" && input.length % size)
    throw new Error("The final binary word is incomplete.");
  const words: bigint[] = [];
  for (let i = 0; i < input.length; i += size) {
    let word = 0n;
    for (let j = 0; j < size; j++) {
      const b = BigInt(input[i + j] ?? 0);
      word =
        byteOrder === "big" ? (word << 8n) | b : word | (b << BigInt(8 * j));
    }
    words.push(word);
  }
  return memory(words, wordWidth, bytes.length, input.length * 8);
}
export function parseTable(
  text: string,
  options: TableOptions,
): { image: MemoryImage; rows: TableRow[] } {
  const { column, signed, wordWidth, fractionalBits, rounding, overflow } =
    options;
  if (
    !Number.isInteger(column) ||
    column < 0 ||
    !Number.isInteger(wordWidth) ||
    wordWidth < 1 ||
    wordWidth > 32 ||
    !Number.isInteger(fractionalBits) ||
    fractionalBits < 0 ||
    fractionalBits > 24 ||
    !["nearest", "floor", "truncate"].includes(rounding) ||
    !["reject", "saturate", "wrap"].includes(overflow)
  )
    throw new Error("Invalid table conversion settings.");
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (options.header) lines.shift();
  if (lines.length > 1_000_000)
    throw new Error("Table exceeds the one million word limit.");
  const min = signed ? -(2 ** (wordWidth - 1)) : 0,
    max = signed ? 2 ** (wordWidth - 1) - 1 : 2 ** wordWidth - 1;
  const rows = lines.map((line, index) => {
    const cell = line.includes(",")
      ? line.split(",")[column]
      : line.trim().split(/\s+/)[column];
    if (cell === undefined || !cell.trim() || !Number.isFinite(Number(cell)))
      throw new Error(`Invalid numeric value at line ${index + 1}.`);
    const original = Number(cell),
      scaled = original * 2 ** fractionalBits;
    if (!Number.isFinite(scaled) || !Number.isSafeInteger(Math.trunc(scaled)))
      throw new Error(`Value at line ${index + 1} exceeds safe precision.`);
    let quantized =
      rounding === "nearest"
        ? Math.round(scaled)
        : rounding === "floor"
          ? Math.floor(scaled)
          : Math.trunc(scaled);
    if (overflow === "reject" && (quantized < min || quantized > max))
      throw new Error(`Overflow at line ${index + 1}.`);
    if (overflow === "saturate")
      quantized = Math.max(min, Math.min(max, quantized));
    const modulus = 2 ** wordWidth;
    const encodedNumber = ((quantized % modulus) + modulus) % modulus;
    if (overflow === "wrap")
      quantized =
        signed && encodedNumber >= 2 ** (wordWidth - 1)
          ? encodedNumber - modulus
          : encodedNumber;
    return {
      original,
      quantized: quantized / 2 ** fractionalBits,
      encoded: BigInt(encodedNumber),
      error: quantized / 2 ** fractionalBits - original,
    };
  });
  return {
    image: memory(
      rows.map((row) => row.encoded),
      wordWidth,
      new TextEncoder().encode(text).length,
    ),
    rows,
  };
}
export function convertPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: ImageOptions,
): { image: MemoryImage; palette?: MemoryImage; preview: Uint8ClampedArray } {
  const { mode, threshold, alpha } = options;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 1_000_000 ||
    rgba.length !== width * height * 4 ||
    !["mono", "indexed", "rgb565"].includes(mode) ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 255 ||
    !["transparent-black", "transparent-white"].includes(alpha)
  )
    throw new Error("Invalid image or image settings.");
  const colors: number[] = [],
    preview = new Uint8ClampedArray(rgba.length);
  for (let p = 0; p < width * height; p++) {
    const i = 4 * p,
      a = rgba[i + 3] / 255,
      bg = alpha === "transparent-white" ? 255 : 0;
    const r = Math.round(rgba[i] * a + bg * (1 - a)),
      g = Math.round(rgba[i + 1] * a + bg * (1 - a)),
      b = Math.round(rgba[i + 2] * a + bg * (1 - a));
    const packed =
      mode === "mono"
        ? Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b) >= threshold
          ? 1
          : 0
        : mode === "rgb565"
          ? ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
          : ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    colors.push(packed);
  }
  if (mode === "indexed" && new Set(colors).size > 256) {
    // Fixed RGB332 buckets keep the palette deterministic for photographic inputs.
    for (let index = 0; index < colors.length; index++) {
      const value = colors[index],
        r3 = ((value >> 11) & 31) >> 2,
        g3 = ((value >> 5) & 63) >> 3,
        b2 = (value & 31) >> 3;
      colors[index] = ((r3 * 4 + 2) << 11) | ((g3 * 8 + 4) << 5) | (b2 * 8 + 4);
    }
  }
  const paletteValues =
    mode === "indexed" ? [...new Set(colors)].sort((a, b) => a - b) : [];
  const indices = new Map(paletteValues.map((value, index) => [value, index]));
  const words = colors.map((value) =>
    BigInt(mode === "indexed" ? indices.get(value)! : value),
  );
  for (let p = 0; p < colors.length; p++) {
    const v = mode === "indexed" ? paletteValues[Number(words[p])] : colors[p],
      i = 4 * p;
    const r = mode === "mono" ? (v ? 255 : 0) : (((v >> 11) & 31) * 255) / 31;
    const g = mode === "mono" ? r : (((v >> 5) & 63) * 255) / 63;
    const b = mode === "mono" ? r : ((v & 31) * 255) / 31;
    preview.set([r, g, b, 255], i);
  }
  return {
    image: memory(
      words,
      mode === "mono" ? 1 : mode === "indexed" ? 8 : 16,
      rgba.length,
      words.length * (mode === "mono" ? 1 : mode === "indexed" ? 8 : 16),
      "row-major",
    ),
    palette:
      mode === "indexed"
        ? memory(paletteValues.map(BigInt), 16, rgba.length)
        : undefined,
    preview,
  };
}
export async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
