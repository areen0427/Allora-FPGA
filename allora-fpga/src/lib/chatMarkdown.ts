import { CHAT_PROSE_SOURCE_PATTERN } from "./chatSourceReferences";

export type ChatInline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "source"; text: string }
  | { kind: "strong"; children: ChatInline[] }
  | { kind: "em"; children: ChatInline[] }
  | { kind: "strike"; children: ChatInline[] }
  | { kind: "link"; destination: string; children: ChatInline[] };
export type ChatMarkdownBlock =
  | { kind: "paragraph"; content: ChatInline[] }
  | { kind: "heading"; content: ChatInline[]; level: number }
  | { kind: "code"; language: string; code: string }
  | { kind: "list"; ordered: boolean; start: number; items: ChatInline[][] }
  | { kind: "quote"; blocks: ChatMarkdownBlock[] }
  | { kind: "rule" }
  | { kind: "table"; header: ChatInline[][]; rows: ChatInline[][][]; alignment: ("left" | "center" | "right")[] };

/** Return a complete Markdown link, allowing nested URL parentheses and <paths with spaces>. */
function markdownLink(value: string): { label: string; destination: string; length: number } | undefined {
  value = value.slice(0, 8192);
  const labelEnd = value.indexOf("](");
  if (!value.startsWith("[") || labelEnd < 0 || value.slice(0, labelEnd).includes("\n")) return undefined;
  const start = labelEnd + 2;
  let depth = 1;
  let end = start;
  for (; end < value.length && value[end] !== "\n"; end++) {
    if (value[end] === "\\") { end++; continue; }
    if (value[end] === "(") depth++;
    if (value[end] === ")" && --depth === 0) break;
  }
  if (depth !== 0) return undefined;
  const destination = value.slice(start, end).trim().replace(/\s+"[^"]*"$/, "");
  return { label: value.slice(1, labelEnd), destination: destination.startsWith("<") && destination.endsWith(">") ? destination.slice(1, -1) : destination, length: end + 1 };
}

export function parseChatInline(text: string, depth = 0): ChatInline[] {
  if (depth > 6 || text.length > 200_000) return [{ kind: "text", text }];
  const output: ChatInline[] = [];
  let plain = "";
  const flush = () => { if (plain) { output.push({ kind: "text", text: plain }); plain = ""; } };
  for (let i = 0; i < text.length;) {
    const remaining = text.slice(i);
    if (text[i] === "\\" && /[\\`*_[\]{}()#+.!|>~-]/.test(text[i + 1] ?? "")) {
      plain += text[i + 1]; i += 2; continue;
    }
    if (text[i] === "`") {
      const ticks = /^`+/.exec(remaining)![0];
      const close = text.indexOf(ticks, i + ticks.length);
      if (close >= 0) {
        flush(); output.push({ kind: "code", text: text.slice(i + ticks.length, close) }); i = close + ticks.length; continue;
      }
    }
    if (remaining.startsWith("![")) {
      const image = markdownLink(remaining.slice(1));
      if (image) {
        // Keep image syntax as text; chat never fetches or embeds remote images.
        plain += remaining.slice(0, image.length + 1); i += image.length + 1; continue;
      }
    }
    if (text[i] === "[" && text[i - 1] !== "!") {
      const link = markdownLink(remaining);
      if (link) {
        flush(); output.push({ kind: "link", destination: link.destination, children: parseChatInline(link.label, depth + 1) }); i += link.length; continue;
      }
    }
    const autoLink = remaining.startsWith("<") ? /^<(https?:\/\/[^<>\s]+)>/i.exec(remaining) : null;
    if (autoLink) {
      flush(); output.push({ kind: "link", destination: autoLink[1], children: [{ kind: "text", text: autoLink[1] }] }); i += autoLink[0].length; continue;
    }
    if (/^https?:\/\//i.test(remaining) && (i === 0 || /[\s(>]/.test(text[i - 1]))) {
      let url = /^https?:\/\/[^\s<>]+/i.exec(remaining)![0].replace(/[.,;:!?]+$/, "");
      const unmatchedClosing = (url.match(/\)/g) ?? []).length - (url.match(/\(/g) ?? []).length;
      if (unmatchedClosing > 0) url = url.replace(/\)+$/, match => match.slice(0, Math.max(0, match.length - unmatchedClosing)));
      if (url) { flush(); output.push({ kind: "link", destination: url, children: [{ kind: "text", text: url }] }); i += url.length; continue; }
    }
    if (i === 0 || /[\s([{]/.test(text[i - 1])) {
      const source = CHAT_PROSE_SOURCE_PATTERN.exec(remaining);
      if (source && !/[\w:]/.test(text[i + source[0].length] ?? "")) {
        flush(); output.push({ kind: "source", text: source[0] }); i += source[0].length; continue;
      }
    }
    let formatted = false;
    for (const [marker, kind] of [["**", "strong"], ["__", "strong"], ["~~", "strike"], ["*", "em"], ["_", "em"]] as const) {
      if (!remaining.startsWith(marker) || /\s/.test(text[i + marker.length] ?? "")) continue;
      if (marker.includes("_") && /\w/.test(text[i - 1] ?? "")) continue;
      const close = text.indexOf(marker, i + marker.length);
      if (close <= i + marker.length || /\s/.test(text[close - 1])) continue;
      flush(); output.push({ kind, children: parseChatInline(text.slice(i + marker.length, close), depth + 1) });
      i = close + marker.length; formatted = true; break;
    }
    if (!formatted) { plain += text[i]; i++; }
  }
  flush();
  return output;
}

export function splitChatTableRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  let ticks = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && value[i + 1]) { cell += value[i] + value[++i]; continue; }
    if (value[i] === "`") {
      const run = /^`+/.exec(value.slice(i))![0];
      ticks = ticks === run.length ? 0 : ticks || run.length;
      cell += run; i += run.length - 1; continue;
    }
    if (value[i] === "|" && ticks === 0) { cells.push(cell.trim()); cell = ""; }
    else cell += value[i];
  }
  cells.push(cell.trim());
  return cells;
}

function tableAlignment(line: string) {
  const cells = splitChatTableRow(line);
  if (!cells.length || !cells.every(cell => /^:?-{3,}:?$/.test(cell))) return undefined;
  return cells.map(cell => cell.startsWith(":") && cell.endsWith(":") ? "center" as const : cell.endsWith(":") ? "right" as const : "left" as const);
}
const listLine = /^\s{0,3}(?:(\d+)[.)]|([-*+]))\s+(.*)$/;
const fenceLine = /^\s{0,3}(`{3,}|~{3,})([^\s]*)\s*$/;
const headingLine = /^\s{0,3}(#{1,6})\s+(.*)$/;
const ruleLine = /^\s{0,3}(?:\*\s*){3,}$|^\s{0,3}(?:-\s*){3,}$|^\s{0,3}(?:_\s*){3,}$/;

export function parseChatMarkdown(text: string, depth = 0): ChatMarkdownBlock[] {
  if (depth > 6) return [{ kind: "paragraph", content: [{ kind: "text", text }] }];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ChatMarkdownBlock[] = [];
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    const fence = fenceLine.exec(lines[i]);
    if (fence) {
      const code: string[] = []; i++;
      while (i < lines.length && !new RegExp(`^\\s{0,3}${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({ kind: "code", language: fence[2], code: code.join("\n") }); continue;
    }
    const heading = headingLine.exec(lines[i]);
    if (heading) { blocks.push({ kind: "heading", level: heading[1].length, content: parseChatInline(heading[2].replace(/\s+#+\s*$/, "")) }); i++; continue; }
    if (ruleLine.test(lines[i])) { blocks.push({ kind: "rule" }); i++; continue; }
    if (/^\s{0,3}>/.test(lines[i])) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s{0,3}> ?/, ""));
      blocks.push({ kind: "quote", blocks: parseChatMarkdown(quoted.join("\n"), depth + 1) }); continue;
    }
    const alignment = i + 1 < lines.length && lines[i].includes("|") ? tableAlignment(lines[i + 1]) : undefined;
    if (alignment && splitChatTableRow(lines[i]).length === alignment.length) {
      const header = splitChatTableRow(lines[i]).map(cell => parseChatInline(cell));
      const rows: ChatInline[][][] = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const cells = splitChatTableRow(lines[i++]);
        rows.push(header.map((_, column) => parseChatInline(cells[column] ?? "")));
      }
      blocks.push({ kind: "table", header, rows, alignment }); continue;
    }
    const list = listLine.exec(lines[i]);
    if (list) {
      const ordered = Boolean(list[1]);
      const items: ChatInline[][] = [];
      while (i < lines.length) {
        const item = listLine.exec(lines[i]);
        if (!item || Boolean(item[1]) !== ordered) break;
        let content = item[3]; i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !listLine.test(lines[i])) content += `\n${lines[i++].trim()}`;
        items.push(parseChatInline(content));
      }
      blocks.push({ kind: "list", ordered, start: Number(list[1] ?? 1), items }); continue;
    }
    const paragraph = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !fenceLine.test(lines[i]) && !headingLine.test(lines[i]) && !listLine.test(lines[i]) && !ruleLine.test(lines[i]) && !/^\s{0,3}>/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && tableAlignment(lines[i + 1]))) paragraph.push(lines[i++]);
    blocks.push({ kind: "paragraph", content: parseChatInline(paragraph.join("\n")) });
  }
  return blocks;
}
