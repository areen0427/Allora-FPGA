import {
  AlertCircle,
  LogIn,
  LogOut,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type {
  AssistantAuthState,
  AssistantMode,
  AssistantMessage,
} from "../../lib/codexAssistant";

export type AssistantPanelProps = {
  isOpen: boolean;
  authState: AssistantAuthState;
  messages: AssistantMessage[];
  mode: AssistantMode;
  prompt: string;
  isSigningIn: boolean;
  isSending: boolean;
  sendError: string | null;
  onClose: () => void;
  onModeChange: (mode: AssistantMode) => void;
  onPromptChange: (prompt: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onRefreshAuth: () => void;
  onSend: () => void;
};

const ASSISTANT_PLACEHOLDER =
  "Ask about Verilog, testbenches, Yosys or nextpnr logs, pin constraints, or project cleanup.";

export default function CodexAssistantPanel({
  isOpen,
  authState,
  messages,
  mode,
  prompt,
  isSigningIn,
  isSending,
  sendError,
  onClose,
  onModeChange,
  onPromptChange,
  onSignIn,
  onSignOut,
  onRefreshAuth,
  onSend,
}: AssistantPanelProps) {
  if (!isOpen) return null;

  const signedIn = authState.status === "signed-in";
  const unavailable = authState.status === "unavailable";
  const authFailed = authState.status === "auth-failed";
  const canSend = signedIn && prompt.trim().length > 0 && !isSending;

  return (
    <aside className="codex-assistant-panel" aria-label="Allora Codex">
      <div className="codex-assistant-header">
        <div className="codex-assistant-title-group">
          <div className="codex-assistant-mark" aria-hidden="true">
            <Sparkles size={17} />
          </div>
          <div>
            <h2>Allora Codex Integration</h2>
            <p>OpenAi Codex assistant for project work</p>
          </div>
        </div>
        <button
          type="button"
          className="codex-assistant-icon-button"
          aria-label="Close Allora Codex"
          title="Close"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      <div className="codex-auth-card">
        <div>
          <div className={`codex-status-pill ${authState.status}`}>
            <span aria-hidden="true" />
            {getAuthLabel(authState)}
          </div>
          <p>
            Optional. Uses your own OpenAI or ChatGPT account once the official
            local Codex bridge is connected.
          </p>
        </div>

        {signedIn ? (
          <button
            type="button"
            className="synthesis-secondary-button codex-auth-button"
            onClick={onSignOut}
          >
            <LogOut size={15} />
            Sign out
          </button>
        ) : (
          <div className="codex-auth-actions">
            <button
              type="button"
              className="synthesis-generate-button codex-auth-button"
              disabled={isSigningIn || unavailable}
              onClick={onSignIn}
            >
              <LogIn size={15} />
              {isSigningIn ? "Signing in..." : "Sign in with OpenAI"}
            </button>
            <button
              type="button"
              className="synthesis-secondary-button codex-auth-button"
              onClick={onRefreshAuth}
            >
              <RefreshCw size={15} />
              Refresh status
            </button>
          </div>
        )}
      </div>

      {(authFailed || unavailable || sendError) && (
        <div className="codex-assistant-alert" role="status">
          <AlertCircle size={16} />
          <span>{sendError ?? authState.error}</span>
        </div>
      )}

      <div className="codex-message-area">
        {messages.length === 0 ? (
          <div className="codex-empty-state">
            <Sparkles size={22} />
            <p>{ASSISTANT_PLACEHOLDER}</p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              className={`codex-message ${message.role} ${message.status}`}
              key={message.id}
            >
              <div className="codex-message-meta">
                {message.role === "user" ? "You" : "Allora Codex"}
                {message.status === "sending" ? " · sending" : ""}
                {message.status === "failed" ? " · failed" : ""}
              </div>
              <p>{message.content}</p>
            </article>
          ))
        )}
      </div>

      <form
        className="codex-prompt-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSend();
        }}
      >
        {!signedIn ? (
          <div className="codex-input-hint">Sign in to enable assistant chat.</div>
        ) : null}
        <div className="codex-mode-toggle" aria-label="Codex mode">
          <button
            type="button"
            className={mode === "ask" ? "active" : ""}
            onClick={() => onModeChange("ask")}
          >
            Ask
          </button>
          <button
            type="button"
            className={mode === "agent" ? "active" : ""}
            onClick={() => onModeChange("agent")}
          >
            Agent
          </button>
        </div>
        {mode === "agent" ? (
          <div className="codex-agent-note">
            Agent mode can edit workspace files and run local project checks.
          </div>
        ) : null}
        <textarea
          value={prompt}
          disabled={!signedIn || isSending}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder={ASSISTANT_PLACEHOLDER}
          rows={3}
        />
        <button
          type="submit"
          className="synthesis-generate-button codex-send-button"
          disabled={!canSend}
          title="Send prompt"
          aria-label="Send prompt"
        >
          <Send size={16} />
          {isSending ? "Sending..." : "Send"}
        </button>
      </form>
    </aside>
  );
}

function getAuthLabel(authState: AssistantAuthState) {
  if (authState.status === "signed-in") {
    return authState.accountLabel ?? "Signed in";
  }
  if (authState.status === "signing-in") return "Signing in";
  if (authState.status === "auth-failed") return "Auth failed";
  if (authState.status === "unavailable") return "Codex unavailable";
  return "Not signed in";
}
