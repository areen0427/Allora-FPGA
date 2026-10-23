import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { hasTauriInvoke } from "../lib/tauri";
import { parseChatMarkdown, type ChatInline, type ChatMarkdownBlock } from "../lib/chatMarkdown";
import { highlightChatHdl } from "../lib/chatHdlHighlight";
import { parseChatSourceReference, safeChatDocumentationUrl } from "../lib/chatSourceReferences";
import type { ChatArtifact } from "../lib/chatResults";
import "./ChatMarkdown.css";

type Props = {
  text: string;
  projectPath?: string;
  onOpenSource?: (artifact: ChatArtifact) => void | Promise<void>;
  disabled?: boolean;
};

/** Safe React-only Markdown: no raw HTML, embedded images or executable URL schemes. */
export default function ChatMarkdown({ text, projectPath, onOpenSource, disabled = false }: Props) {
  const blocks = useMemo(() => parseChatMarkdown(text), [text]);
  const [linkError, setLinkError] = useState("");

  function sourceLink(destination: string, children: ReactNode, key: number): ReactNode | undefined {
    const source = parseChatSourceReference(destination, projectPath);
    if (!source || !projectPath || !onOpenSource) return undefined;
    return <button key={key} type="button" data-glass="off" className="chat-source-reference"
      title={`Open ${source.relativePath}:${source.line}${source.column ? `:${source.column}` : ""} in Editor`}
      disabled={disabled} onClick={() => {
        setLinkError("");
        void Promise.resolve().then(() => onOpenSource({
          id: `source:${projectPath}:${source.relativePath}:${source.line}:${source.column ?? 1}`,
          kind: "file", label: source.relativePath, path: source.path, projectPath,
          sourceLocation: { line: source.line, ...(source.column ? { column: source.column } : {}), ...(source.endLine ? { endLine: source.endLine } : {}) },
        })).catch(error => setLinkError(error instanceof Error ? error.message : String(error)));
      }}>{children}</button>;
  }

  function externalClick(event: MouseEvent<HTMLAnchorElement>, url: string) {
    if (!hasTauriInvoke()) return;
    event.preventDefault();
    setLinkError("");
    void openUrl(url).catch(() => setLinkError("This documentation link could not be opened."));
  }

  function inline(items: ChatInline[], allowLinks = true): ReactNode[] {
    return items.map((item, key) => {
      if (item.kind === "text") return item.text;
      if (item.kind === "code") return (allowLinks && sourceLink(item.text, <code>{item.text}</code>, key)) || <code key={key}>{item.text}</code>;
      if (item.kind === "source") return (allowLinks && sourceLink(item.text, item.text, key)) || item.text;
      if (item.kind === "strong") return <strong key={key}>{inline(item.children, allowLinks)}</strong>;
      if (item.kind === "em") return <em key={key}>{inline(item.children, allowLinks)}</em>;
      if (item.kind === "strike") return <s key={key}>{inline(item.children, allowLinks)}</s>;
      const children = inline(item.children, false);
      if (!allowLinks) return <span key={key}>{children}</span>;
      const url = safeChatDocumentationUrl(item.destination);
      if (url) return <a key={key} href={url} target="_blank" rel="noopener noreferrer" onClick={event => externalClick(event, url)}>{children}</a>;
      return sourceLink(item.destination, children, key) ?? <span key={key}>{children}</span>;
    });
  }

  function render(items: ChatMarkdownBlock[]): ReactNode[] {
    return items.map((block, key) => {
      if (block.kind === "code") return <ChatCodeBlock key={key} language={block.language} code={block.code} />;
      if (block.kind === "heading") return <h3 key={key}>{inline(block.content)}</h3>;
      if (block.kind === "paragraph") return <p key={key}>{inline(block.content)}</p>;
      if (block.kind === "rule") return <hr key={key} />;
      if (block.kind === "quote") return <blockquote key={key}>{render(block.blocks)}</blockquote>;
      if (block.kind === "list") {
        const children = block.items.map((item, index) => <li key={index}>{inline(item)}</li>);
        return block.ordered ? <ol key={key} start={block.start}>{children}</ol> : <ul key={key}>{children}</ul>;
      }
      return <div className="chat-markdown-table-scroll" key={key} tabIndex={0} role="region" aria-label="Response table">
        <table><thead><tr>{block.header.map((cell, index) => <th key={index} style={{ textAlign: block.alignment[index] }}>{inline(cell)}</th>)}</tr></thead>
          <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} style={{ textAlign: block.alignment[index] }}>{inline(cell)}</td>)}</tr>)}</tbody>
        </table>
      </div>;
    });
  }

  return <div className="chat-markdown chat-markdown-rich">{render(blocks)}
    {linkError && <p role="alert" className="chat-markdown-link-error">{linkError}</p>}
  </div>;
}

function ChatCodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const tokens = useMemo(() => highlightChatHdl(code, language), [code, language]);
  return <div className="chat-code-block">
    <header><span>{language || "Code"}</span>
      <button type="button" onClick={() => {
        void navigator.clipboard.writeText(code).then(() => { setCopied(true); setCopyFailed(false); })
          .catch(() => { setCopied(false); setCopyFailed(true); });
      }}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "Copied" : copyFailed ? "Retry copy" : "Copy"}</button>
    </header>
    <pre><code>{tokens.map((token, index) => token.kind ? <span key={index} className={`chat-hdl-${token.kind}`}>{token.text}</span> : token.text)}</code></pre>
  </div>;
}
