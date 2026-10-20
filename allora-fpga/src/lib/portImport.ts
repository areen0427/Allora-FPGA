import type { HdlPort } from "../pages/dashboard/pinMappingUtils";

export type OutputDeclaration = {
  name: string;
  width: number;
  indices?: number[];
};
export type ImportUnit = {
  name: string;
  file: string;
  outputs: OutputDeclaration[];
  error?: string;
};
export type ImportSource = { name: string; content: string };
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function expandOutputDeclaration(
  declaration: OutputDeclaration,
): HdlPort[] {
  if (!declaration.indices && declaration.width === 1)
    return [{ name: declaration.name, direction: "output" }];
  return (
    declaration.indices ??
    Array.from(
      { length: declaration.width },
      (_, i) => declaration.width - i - 1,
    )
  ).map((index) => ({
    name: `${declaration.name}[${index}]`,
    baseName: declaration.name,
    index,
    direction: "output",
  }));
}

/** A bounded constant-expression reader; never executes imported source code. */
function integerExpression(
  source: string,
  constants: Map<string, number>,
  insensitive = false,
): number {
  const normalized = source.trim();
  const tokens =
    normalized.match(/[A-Za-z_][A-Za-z0-9_$]*|\d+|[-+*/()]/g) ?? [];
  if (tokens.join("") !== normalized.replace(/\s/g, "") || tokens.length > 128)
    throw new Error(`Unsupported constant expression: ${source}`);
  let position = 0;
  function atom(): number {
    const token = tokens[position++];
    if (token === "+") return atom();
    if (token === "-") return -atom();
    if (token === "(") {
      const value = sum();
      if (tokens[position++] !== ")")
        throw new Error("Unbalanced constant expression.");
      return value;
    }
    const value = /^\d+$/.test(token ?? "")
      ? Number(token)
      : constants.get(insensitive ? token?.toLowerCase() : token);
    if (value === undefined)
      throw new Error(`Cannot resolve constant ${token ?? source}.`);
    return value;
  }
  function product(): number {
    let value = atom();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position++];
      const right = atom();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const right = product();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }
  const result = sum();
  if (position !== tokens.length || !Number.isSafeInteger(result))
    throw new Error(`Cannot resolve integer expression: ${source}`);
  return result;
}

function splitTopLevel(source: string, separator: string): string[] {
  let depth = 0;
  let start = 0;
  const chunks: string[] = [];
  for (let i = 0; i < source.length; i++) {
    if ("([{".includes(source[i])) depth++;
    if (")]}".includes(source[i])) depth--;
    if (depth < 0) throw new Error("Unbalanced HDL declaration.");
    if (!depth && source[i] === separator) {
      chunks.push(source.slice(start, i));
      start = i + 1;
    }
  }
  if (depth) throw new Error("Unbalanced HDL declaration.");
  chunks.push(source.slice(start));
  return chunks;
}

function parenthesized(source: string, start: number) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "(") depth++;
    if (source[i] === ")" && --depth === 0)
      return { body: source.slice(start + 1, i), end: i + 1 };
  }
  throw new Error("Unclosed HDL port or parameter list.");
}

function declaration(
  name: string,
  range: string | undefined,
  constants: Map<string, number>,
  vhdl = false,
): OutputDeclaration {
  if (!identifier.test(name) || (vhdl && name.includes("$")))
    throw new Error(`Unsupported output identifier: ${name}`);
  if (!range) return { name, width: 1 };
  const parts = range.split(vhdl ? /\s+(?:downto|to)\s+/i : /:/);
  if (parts.length !== 2)
    throw new Error(`Unsupported range for ${name}: ${range}`);
  const first = integerExpression(parts[0], constants, vhdl);
  const last = integerExpression(parts[1], constants, vhdl);
  if (vhdl && (/\bdownto\b/i.test(range) ? first < last : first > last))
    throw new Error(`Null range for ${name}.`);
  const width = Math.abs(first - last) + 1;
  if (width > 4096)
    throw new Error(`Output ${name} exceeds the 4096-bit import limit.`);
  return {
    name,
    width,
    indices: Array.from(
      { length: width },
      (_, i) => first + (first <= last ? i : -i),
    ),
  };
}

function verilogOutputs(body: string): OutputDeclaration[] {
  if (/`|\\|\(\*/.test(body))
    throw new Error(
      "Preprocessor directives, escaped names and attributes require a flattened top-level HDL file.",
    );
  const constants = new Map<string, number>();
  let rest = body.trim();
  if (rest.startsWith("#")) {
    rest = rest.slice(1).trimStart();
    if (!rest.startsWith("(")) throw new Error("Unsupported parameter list.");
    const parameters = parenthesized(rest, 0);
    for (const part of splitTopLevel(parameters.body, ",")) {
      const match = part
        .trim()
        .match(
          /^(?:(?:parameter|localparam|integer|int|unsigned|signed)\s+)*([A-Za-z_][\w$]*)\s*=\s*([\s\S]+)$/,
        );
      if (!match) throw new Error("Unsupported parameter declaration.");
      constants.set(match[1], integerExpression(match[2], constants));
    }
    rest = rest.slice(parameters.end).trimStart();
  }
  if (!rest.startsWith("(")) throw new Error("No top-level port list found.");
  const header = parenthesized(rest, 0);
  const outputs: OutputDeclaration[] = [];
  const seen = new Set<string>();
  const add = (name: string, range?: string) => {
    if (seen.has(name.toLowerCase()))
      throw new Error(
        `Duplicate or case-conflicting output declaration: ${name}`,
      );
    seen.add(name.toLowerCase());
    outputs.push(declaration(name, range, constants));
  };
  const ansi = /\b(?:input|output|inout)\b/.test(header.body);
  let direction = "";
  let range: string | undefined;
  function parsePart(raw: string) {
    let part = raw.trim();
    const prefix = part.match(/^(input|output|inout)\b/);
    if (prefix) {
      direction = prefix[1];
      range = undefined;
      part = part.slice(prefix[0].length).trim();
    }
    if (direction !== "output") return;
    part = part.replace(/^(?:(?:wire|reg|logic|signed|unsigned)\b\s*)*/, "");
    const ranged = part.match(/^\[([^\]]+)\]\s*/);
    if (ranged) {
      range = ranged[1];
      part = part.slice(ranged[0].length);
    }
    // Reject arrays, typedef/interface ports and initializers instead of silently guessing widths.
    if (!identifier.test(part))
      throw new Error(`Unsupported output declaration: ${raw.trim()}`);
    add(part, range);
  }
  if (ansi) splitTopLevel(header.body, ",").forEach(parsePart);
  else {
    const names = new Set(
      splitTopLevel(header.body, ",").map((name) => name.trim()),
    );
    if ([...names].some((name) => !identifier.test(name)))
      throw new Error("Unsupported non-ANSI port list.");
    const implementation = rest
      .slice(header.end)
      .replace(/\b(function|task)\b[\s\S]*?\bend(?:function|task)\b/g, "");
    for (const match of implementation.matchAll(/\b(output)\b([^;]*);/g)) {
      direction = "";
      range = undefined;
      const parts = splitTopLevel(match[0].slice(0, -1), ",");
      parts.forEach(parsePart);
    }
    if (outputs.some((port) => !names.has(port.name)))
      throw new Error(
        "Output declaration does not match the top-level port list.",
      );
  }
  return outputs;
}

function vhdlOutputs(body: string): OutputDeclaration[] {
  const constants = new Map<string, number>();
  const generic = /\bgeneric\s*\(/i.exec(body);
  if (generic) {
    const block = parenthesized(
      body,
      generic.index + generic[0].lastIndexOf("("),
    );
    for (const part of splitTopLevel(block.body, ";")) {
      const match = part
        .trim()
        .match(
          /^([\w\s,]+):\s*(?:integer|natural|positive)\s*:=\s*([\s\S]+)$/i,
        );
      if (!match)
        throw new Error(
          "Unsupported VHDL generic; use a top-level file with resolved integer generics.",
        );
      for (const name of match[1].split(","))
        constants.set(
          name.trim().toLowerCase(),
          integerExpression(match[2], constants, true),
        );
    }
  }
  const port = /\bport\s*\(/i.exec(body);
  if (!port) return [];
  const block = parenthesized(body, port.index + port[0].lastIndexOf("("));
  const outputs: OutputDeclaration[] = [];
  for (const part of splitTopLevel(block.body, ";")) {
    const match = part
      .trim()
      .match(/^([\w\s,]+):\s*(out|buffer)\b\s*([\s\S]+)$/i);
    if (!match) {
      if (/:\s*(?:in|inout)\b/i.test(part)) continue;
      throw new Error(`Unsupported VHDL port declaration: ${part.trim()}`);
    }
    const type = match[3].trim();
    const vector = type.match(
      /^(?:std_logic_vector|std_ulogic_vector|signed|unsigned|bit_vector)\s*\(([\s\S]+)\)$/i,
    );
    if (!vector && !/^(?:std_logic|std_ulogic|bit)$/i.test(type))
      throw new Error(`Unsupported VHDL output type: ${type}`);
    for (const name of match[1].split(","))
      outputs.push(declaration(name.trim(), vector?.[1], constants, true));
  }
  if (
    new Set(outputs.map((port) => port.name.toLowerCase())).size !==
    outputs.length
  )
    throw new Error("Duplicate VHDL output declaration.");
  return outputs;
}

export function parseImportSources(sources: ImportSource[]): ImportUnit[] {
  if (sources.length > 256)
    throw new Error("Import supports at most 256 HDL files.");
  const units: ImportUnit[] = [];
  for (const file of sources) {
    if (new TextEncoder().encode(file.content).length > MAX_IMPORT_FILE_BYTES)
      throw new Error(`${file.name} exceeds the 2 MiB file limit.`);
    const vhdl = /\.vhdl?$/i.test(file.name);
    const source = vhdl
      ? file.content.replace(/"(?:[^"\n]|"")*"|--[^\n]*/g, " ")
      : file.content.replace(
          /"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
          (token) => (token.startsWith('"') ? '""' : " "),
        );
    const pattern = vhdl
      ? /\bentity\s+([A-Za-z_]\w*)\s+is\b([\s\S]*?)\bend\s*(?:entity\b\s*)?(?:[A-Za-z_]\w*\s*)?;/gi
      : /\bmodule\s+(?:automatic\s+)?([A-Za-z_][\w$]*)\b([\s\S]*?)\bendmodule\b/g;
    for (const match of source.matchAll(pattern)) {
      try {
        // A directive before a module can affect its interface too.
        if (!vhdl && /`/.test(source))
          throw new Error(
            "Preprocessed HDL requires a flattened top-level file.",
          );
        const outputs = vhdl ? vhdlOutputs(match[2]) : verilogOutputs(match[2]);
        if (outputs.reduce((sum, port) => sum + port.width, 0) > 16384)
          throw new Error(
            "The selected top exceeds the 16384-bit import limit.",
          );
        units.push({ name: match[1], file: file.name, outputs });
      } catch (error) {
        units.push({
          name: match[1],
          file: file.name,
          outputs: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  if (!units.length)
    throw new Error(
      "No complete Verilog module or VHDL entity found. Select a top-level HDL file or provide a generated Vivado wrapper.",
    );
  return units;
}

export function mergeOutputDeclarations(
  existing: OutputDeclaration[],
  incoming: OutputDeclaration[],
) {
  const names = new Set(existing.map((port) => port.name.toLowerCase()));
  const added = incoming.filter((port) => {
    const name = port.name.toLowerCase();
    if (names.has(name)) return false;
    names.add(name);
    return true;
  });
  return {
    declarations: [...existing, ...added],
    added,
    skipped: incoming.length - added.length,
  };
}
