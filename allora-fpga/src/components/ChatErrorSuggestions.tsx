import { useState } from "react";
import { CircleAlert, X } from "lucide-react";
import { diagnosticSourceLabel, type ProjectDiagnostic } from "../lib/projectDiagnostics";
import "./ChatErrorSuggestions.css";

type Props = {
  entries: readonly ProjectDiagnostic[];
  disabled?: boolean;
  onChoose: (entry: ProjectDiagnostic, prompt: string) => void;
};

export default function ChatErrorSuggestions({ entries, disabled = false, onChoose }: Props) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const entry = entries.find(item => item.state === "active");
  if (!entry) return null;
  const identity = JSON.stringify([entry.projectKey, entry.id, entry.version]);
  if (dismissed.includes(identity)) return null;
  const screen = diagnosticSourceLabel(entry.source);
  return <aside className="chat-error-suggestions" aria-label="Recent project error suggestions">
    <div className="chat-error-suggestions-heading">
      <span><CircleAlert size={13} aria-hidden="true" />{screen} · Recent error</span>
      <button type="button" data-glass="off" className="chat-error-suggestions-dismiss" aria-label="Dismiss error suggestions"
        onClick={() => setDismissed(previous => [...previous, identity].slice(-24))}>
        <X size={13} aria-hidden="true" />
      </button>
    </div>
    <div className="chat-error-suggestions-actions">
      <button type="button" data-glass="off" disabled={disabled} onClick={() => onChoose(entry, `Help me troubleshoot the recent ${screen} error in this project.`)}>Troubleshoot the recent error</button>
      <button type="button" data-glass="off" disabled={disabled} onClick={() => onChoose(entry, `Explain the recent ${screen} error in this project.`)}>Explain what went wrong</button>
    </div>
  </aside>;
}
