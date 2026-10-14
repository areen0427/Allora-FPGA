import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, FileCode2, GitCompareArrows, History, Network, Radio, Timer, TriangleAlert, Waves } from "lucide-react";
import { diffChatFile, extractChatArtifacts, formatTurnDuration } from "../lib/chatResults";
import type { ChangeReviewData, ChatArtifact, ChatTool } from "../lib/chatResults";
import "./ChatTurnDetails.css";

export type { ChangeReviewData, ChatArtifact, ChatTool } from "../lib/chatResults";

function ArtifactIcon({ kind }: { kind: ChatArtifact["kind"] }) {
  if (kind === "waveform") return <Waves size={18} />;
  if (kind === "synthesis") return <Network size={18} />;
  if (kind === "timing") return <Timer size={18} />;
  if (kind === "bitstream") return <Radio size={18} />;
  return <FileCode2 size={18} />;
}

export default function ChatTurnDetails({ tools, elapsedMs, files = [], projectPath, artifacts: suppliedArtifacts, onOpenArtifact, interrupted, error, disabled = false, reviewIds = [], loadReview, onRestore, reviewError }: {
  tools: ChatTool[];
  elapsedMs?: number;
  files?: string[];
  projectPath?: string;
  artifacts?: ChatArtifact[];
  onOpenArtifact?: (artifact: ChatArtifact) => void;
  interrupted?: boolean;
  error?: string;
  disabled?: boolean;
  reviewIds?: string[];
  loadReview?: (id: string) => Promise<ChangeReviewData>;
  onRestore?: (id: string, projectPath: string) => Promise<void>;
  reviewError?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const artifacts = useMemo(() => suppliedArtifacts ?? extractChatArtifacts(tools, projectPath), [suppliedArtifacts, tools, projectPath]);
  const duration = formatTurnDuration(elapsedMs);
  const failed = tools.filter((tool) => tool.status === "error").length;
  const complete = tools.filter((tool) => tool.status === "complete").length;
  const running = tools.filter((tool) => tool.status === "running").length;
  const artifactContents = (artifact: ChatArtifact) => <>
    <span className="chat-result-card-heading"><ArtifactIcon kind={artifact.kind} />
      <strong>{artifact.label}</strong>{onOpenArtifact && <ArrowUpRight size={15} />}
    </span>
    {artifact.path && <small title={artifact.path}>{artifact.path.split(/[\\/]/).filter(Boolean).slice(-2).join("/")}</small>}
  </>;
  if (!duration && !tools.length && !files.length && !artifacts.length && !interrupted && !error && !reviewIds.length && !reviewError) return null;
  return <div className="chat-turn-details">
    {!!artifacts.length && <div className="chat-result-cards" aria-label="Results">{artifacts.map((artifact) => <div key={artifact.id} className="chat-result-entry">
      {onOpenArtifact
        ? <button type="button" data-glass="off" className={`chat-result-card ${artifact.kind}`} disabled={disabled} onClick={() => onOpenArtifact(artifact)}>{artifactContents(artifact)}</button>
        : <div className={`chat-result-card ${artifact.kind}`}>{artifactContents(artifact)}</div>}
      {artifact.data !== undefined && <details className="chat-result-data"><summary>Report details</summary><pre>{JSON.stringify(artifact.data, null, 2)}</pre></details>}
    </div>)}</div>}
    <details className={`chat-turn-summary ${interrupted || error || failed ? "has-errors" : ""}`} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>{interrupted || error || failed ? <TriangleAlert size={13} /> : <CheckCircle2 size={13} />}
        <span>{interrupted ? "Turn interrupted" : error ? "Turn ended with an error" : "Turn summary"}</span>
        {duration && <small>{duration}</small>}{tools.length > 0 && <small>{complete}/{tools.length} tools completed</small>}
        {files.length > 0 && <small>{files.length} {files.length === 1 ? "file changed" : "files changed"}</small>}
      </summary>
      <div>{duration && <p><Timer size={13} /> Elapsed: {duration}</p>}
        {tools.length > 0 && <><p>{complete} tool calls completed{failed ? ` · ${failed} failed` : ""}{running ? ` · ${running} still running` : ""}.</p>
          <ul className="chat-turn-operation-list">{tools.map(tool => <li key={tool.id}><span>{tool.name.replace(/^mcp__allora__|^allora[._]/, "").replaceAll("_", " ")}</span><small className={tool.status}>{tool.status === "complete" ? "Completed" : tool.status === "error" ? "Failed" : "Running"}</small></li>)}</ul>
        </>}
        {error && <p role="status">{error}</p>}
        {interrupted && <p>The turn stopped before its work was complete. Check results before using them.</p>}
        {files.length > 0 && !reviewIds.length && <><strong>Changed files</strong><ul>{files.map((file) => <li key={file}><code>{file}</code></li>)}</ul></>}
        {reviewError && <p className="chat-review-error" role="status">{reviewError}</p>}
        {expanded && loadReview && onRestore && reviewIds.map(id => <TurnChangeReview key={id} id={id} loadReview={loadReview} onRestore={onRestore} disabled={disabled} />)}
      </div>
    </details>
  </div>;
}

function TurnChangeReview({ id, loadReview, onRestore, disabled }: {
  id: string;
  loadReview: (id: string) => Promise<ChangeReviewData>;
  onRestore: (id: string, projectPath: string) => Promise<void>;
  disabled: boolean;
}) {
  const [review, setReview] = useState<ChangeReviewData | null>(null);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadReview(id).then(value => { if (active) setReview(value); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [id, loadReview, attempt]);
  async function restore() {
    if (!review || restoring || disabled) return;
    setRestoring(true);
    setError("");
    try {
      await onRestore(id, review.projectPath);
      setReview(current => current ? { ...current, canRestore: false } : current);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setRestoring(false); }
  }
  if (!review) return <div className="chat-turn-review-status" role="status">
    {error ? <><span>{error}</span><button type="button" data-glass="off" disabled={disabled} onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry loading changes</button></> : "Loading changes…"}
  </div>;
  return <ChangeReview review={review} onRestore={() => void restore()} restoring={restoring} disabled={disabled} error={error} />;
}

function FileDiff({ file }: { file: ChangeReviewData["files"][number] }) {
  const lines = useMemo(() => diffChatFile(file.before, file.after), [file.before, file.after]);
  const added = lines.filter((line) => line.kind === "added").length;
  const removed = lines.filter((line) => line.kind === "removed").length;
  return <details className="chat-review-file">
    <summary><FileCode2 size={14} /><code>{file.path}</code><small className="chat-diff-added">+{added}</small><small className="chat-diff-removed">−{removed}</small><span className="chat-review-file-kind">{file.before === null ? "Added" : file.after === null ? "Deleted" : "Modified"}</span></summary>
    <div className="chat-file-diff" role="region" aria-label={`Changes to ${file.path}`} tabIndex={0}>
      {lines.length ? lines.slice(0, 1500).map((line, index) => <div key={index} className={`chat-diff-line ${line.kind}`}>
        <span className="chat-diff-number" aria-hidden="true">{line.before ?? ""}</span><span className="chat-diff-number" aria-hidden="true">{line.after ?? ""}</span><span className="chat-diff-marker">{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span><code>{line.text || " "}</code>
      </div>) : <p>No text changes.</p>}
      {lines.length > 1500 && <p className="chat-review-limit">Showing the first 1,500 diff lines of {lines.length.toLocaleString()}.</p>}
    </div>
  </details>;
}

export function ChangeReview({ review, onRestore, restoring = false, disabled = false, error }: {
  review: ChangeReviewData;
  onRestore: (id: string) => void;
  restoring?: boolean;
  disabled?: boolean;
  error?: string;
}) {
  const skipped = Array.isArray(review.skipped) ? review.skipped.length : review.skipped ?? 0;
  if (!review.files.length && !skipped) return <section className="chat-change-review" aria-label="Review changes"><p>No text files changed in this turn.</p></section>;
  return <section className="chat-change-review" aria-label="Review changes">
    <header><div><GitCompareArrows size={16} /><strong>Changes</strong><small>{review.files.length} {review.files.length === 1 ? "file" : "files"}</small></div>
      {review.files.length > 0 && review.canRestore !== false && <button type="button" data-glass="off" disabled={restoring || disabled} onClick={() => onRestore(review.id)}><History size={13} />{restoring ? "Restoring…" : "Restore turn"}</button>}
    </header>
    <p>{review.canRestore === false ? review.id.startsWith("created:") ? "Initial files in this new project. Subsequent turns support restoring changes; the project folder is preserved." : "This turn has already been restored." : "Restore returns these files to their state before this turn. Files changed again afterwards are protected."}</p>
    {error && <p className="chat-review-error" role="alert">{error}</p>}
    {review.files.map((file) => <FileDiff key={file.path} file={file} />)}
    {skipped > 0 && <details className="chat-review-skipped"><summary>{skipped} {skipped === 1 ? "file was" : "files were"} excluded from this checkpoint</summary>
      <p>Binary, oversized, or unavailable files cannot be restored by this checkpoint.</p>
      {Array.isArray(review.skipped) && <ul>{review.skipped.map((path) => <li key={path}><code>{path}</code></li>)}</ul>}
    </details>}
  </section>;
}
