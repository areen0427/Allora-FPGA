import { useEffect, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { Sparkles } from "lucide-react";
import type { ProjectFile } from "./types";
import type { AppSettings } from "../../data/settings";
import CodexAssistantPanel from "./CodexAssistantPanel";
import {
  createAssistantMessage,
  getCodexAuthState,
  sendCodexMessage,
  signInToCodex,
  signOutOfCodex,
  type AssistantAuthState,
  type AssistantMode,
  type AssistantMessage,
} from "../../lib/codexAssistant";
import { hasTauriInvoke, invokeTauri } from "../../lib/tauri";

type LintDiagnostic = {
  fileName: string;
  line: number;
  severity: string;
  message: string;
};

type LintHdlResponse = {
  available: boolean;
  diagnostics: LintDiagnostic[];
};

type EditorSectionProps = {
  openFiles: ProjectFile[];
  projectFiles: ProjectFile[];
  projectPath?: string;
  activeFileName: string | null;
  setActiveFileName: (fileName: string) => void;
  activeFile: ProjectFile | undefined;
  dirtyFileNames: string[];
  updateActiveFile: (content: string) => void;
  createNewFile: () => void;
  closeOpenFile: (fileName: string) => void;
  renameFile: (oldName: string, newName: string) => Promise<void> | void;
  onWorkspaceChanged?: () => Promise<void> | void;
  settings: AppSettings;
};

const LINT_FILE_DELIMITER = String.fromCharCode(0);
const LINT_RECORD_DELIMITER = String.fromCharCode(1);

export default function EditorSection({
  openFiles,
  projectFiles,
  projectPath,
  activeFileName,
  setActiveFileName,
  activeFile,
  dirtyFileNames,
  updateActiveFile,
  createNewFile,
  closeOpenFile,
  renameFile,
  onWorkspaceChanged,
  settings,
}: EditorSectionProps) {
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [diagnostics, setDiagnostics] = useState<LintDiagnostic[]>([]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("ask");
  const [assistantAuth, setAssistantAuth] = useState<AssistantAuthState>({
    status: "signed-out",
  });
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>(
    [],
  );
  const [assistantSendError, setAssistantSendError] = useState<string | null>(
    null,
  );
  const monacoRef = useRef<Monaco | null>(null);
  // Once iverilog reports itself unavailable, stop pinging it every keystroke.
  const lintAvailableRef = useRef(true);
  const isDarkEditor =
    settings.theme === "dark" || settings.theme === "black-ice";

  const lintableFiles = projectFiles.filter(
    (file) => /\.(v|sv)$/i.test(file.name) && !file.isBinary,
  );
  const lintKey = lintableFiles
    .map((file) => `${file.name}${LINT_FILE_DELIMITER}${file.content}`)
    .join(LINT_RECORD_DELIMITER);

  useEffect(() => {
    if (!hasTauriInvoke() || !lintAvailableRef.current) return;
    if (lintableFiles.length === 0) {
      setDiagnostics([]);
      applyLintMarkers(monacoRef.current, []);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const result = await invokeTauri<LintHdlResponse>("lint_hdl", {
          request: {
            files: lintableFiles.map((file) => ({
              name: file.name,
              content: file.content,
            })),
          },
        });
        if (cancelled) return;
        if (!result.available) {
          lintAvailableRef.current = false;
          return;
        }
        setDiagnostics(result.diagnostics);
        applyLintMarkers(monacoRef.current, result.diagnostics);
      } catch {
        // Lint is advisory; never surface failures as editor errors.
      }
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lintKey]);

  useEffect(() => {
    if (!assistantOpen) return;

    let cancelled = false;
    getCodexAuthState()
      .then((nextAuthState) => {
        if (!cancelled) setAssistantAuth(nextAuthState);
      })
      .catch((error) => {
        if (!cancelled) {
          setAssistantAuth({
            status: "auth-failed",
            error:
              error instanceof Error
                ? error.message
                : "Unable to check Codex sign-in status.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assistantOpen]);

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.length - errorCount;
  const isSigningIn = assistantAuth.status === "signing-in";
  const isSending = assistantMessages.some(
    (message) => message.status === "sending",
  );

  async function handleAssistantSignIn() {
    setAssistantSendError(null);
    setAssistantAuth({ status: "signing-in" });
    try {
      const nextAuthState = await signInToCodex();
      setAssistantAuth(nextAuthState);
    } catch (error) {
      setAssistantAuth({
        status: "auth-failed",
        error:
          error instanceof Error
            ? error.message
            : "Unable to start OpenAI sign-in.",
      });
    }
  }

  async function handleAssistantSignOut() {
    setAssistantSendError(null);
    setAssistantAuth(await signOutOfCodex());
  }

  async function handleAssistantSend() {
    const prompt = assistantPrompt.trim();
    if (!prompt || isSending || assistantAuth.status !== "signed-in") return;

    const userMessage = createAssistantMessage("user", prompt);
    const pendingMessage = createAssistantMessage(
      "assistant",
      "Waiting for Codex...",
      "sending",
    );
    const nextMessages = [...assistantMessages, userMessage, pendingMessage];
    setAssistantPrompt("");
    setAssistantSendError(null);
    setAssistantMessages(nextMessages);

    try {
      const result = await sendCodexMessage(assistantMessages, prompt, {
        projectPath,
        activeFileName,
        mode: assistantMode,
      });
      setAssistantMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === pendingMessage.id ? result.message : message,
        ),
      );
      if (result.workspaceChanged) {
        await onWorkspaceChanged?.();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Message failed to send.";
      setAssistantSendError(message);
      setAssistantMessages((currentMessages) =>
        currentMessages.map((currentMessage) =>
          currentMessage.id === pendingMessage.id
            ? {
                ...currentMessage,
                content: message,
                status: "failed",
              }
            : currentMessage,
        ),
      );
    }
  }

  return (
    <div
      className="dashboard-glass-card editor-shell"
      style={{
        height: "calc(100vh - 48px)",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "22px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 18px 40px rgba(15,23,42,0.16)",
      }}
    >
      <div
        className="editor-tab-bar"
        style={{
          height: "44px",
          display: "flex",
          alignItems: "end",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {openFiles.map((file) => (
          <div
            role="button"
            tabIndex={0}
            className={`editor-file-tab${file.name === activeFileName ? " active" : ""}`}
            key={file.name}
            onClick={() => setActiveFileName(file.name)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveFileName(file.name);
              }
            }}
            onDoubleClick={() => {
              setEditingFile(file.name);
              setEditingName(file.name);
            }}
            style={{
              height: "36px",
              padding: "0 10px 0 16px",
              border: "none",
              borderRight: "1px solid #e2e8f0",
              background: file.name === activeFileName ? "#ffffff" : "#f8fafc",
              color: file.name === activeFileName ? "#0f172a" : "#64748b",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            {editingFile === file.name ? (
              <input
                value={editingName}
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => {
                  renameFile(file.name, editingName);
                  setEditingFile(null);
                  setEditingName("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    renameFile(file.name, editingName);
                    setEditingFile(null);
                    setEditingName("");
                  }
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  fontSize: "13px",
                  fontWeight: 800,
                  color: "#0f172a",
                  width: "140px",
                }}
              />
            ) : (
              <span>{file.name}</span>
            )}

            {dirtyFileNames.includes(file.name) ? (
              <span
                aria-label="Unsaved changes"
                title="Unsaved changes"
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "999px",
                  background: "#2563eb",
                  flexShrink: 0,
                }}
              />
            ) : null}

            <button
              type="button"
              aria-label={`Close ${file.name}`}
              title={`Close ${file.name}`}
              onClick={(event) => {
                event.stopPropagation();
                closeOpenFile(file.name);
              }}
              style={{
                border: "none",
                background: "transparent",
                color: "#94a3b8",
                fontWeight: 900,
                fontSize: "15px",
                lineHeight: 1,
                padding: 0,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}

        <button
          className="editor-add-tab"
          onClick={createNewFile}
          style={{
            height: "36px",
            width: "42px",
            border: "none",
            borderRight: "1px solid #e2e8f0",
            background: "#f8fafc",
            color: "#64748b",
            fontSize: "18px",
            fontWeight: 800,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          +
        </button>

        {diagnostics.length > 0 ? (
          <div
            className={`editor-lint-chip${errorCount > 0 ? " has-errors" : ""}`}
            title={diagnostics
              .slice(0, 8)
              .map((d) => `${d.fileName}:${d.line} ${d.message}`)
              .join("\n")}
          >
            {errorCount > 0
              ? `${errorCount} error${errorCount === 1 ? "" : "s"}`
              : ""}
            {errorCount > 0 && warningCount > 0 ? " · " : ""}
            {warningCount > 0
              ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
            : ""}
          </div>
        ) : null}

        <button
          type="button"
          className={`editor-codex-button${assistantOpen ? " active" : ""}`}
          aria-label="Open Allora Codex assistant"
          title="Allora Codex"
          onClick={() => setAssistantOpen(true)}
        >
          <Sparkles size={16} />
        </button>
      </div>

      <div className="editor-body">
        <Editor
          height="100%"
          path={activeFile?.name}
          value={activeFile?.content ?? ""}
          language={getMonacoLanguage(activeFile?.name)}
          theme={isDarkEditor ? "allora-dark" : "allora"}
          onMount={(_, monaco) => {
            monacoRef.current = monaco;
            registerHdlLanguages(monaco);

            monaco.editor.defineTheme("allora", {
              base: "vs",
              inherit: true,
              rules: [
                { token: "keyword", foreground: "2563eb", fontStyle: "bold" },
                { token: "comment", foreground: "64748b", fontStyle: "italic" },
                { token: "number", foreground: "9333ea" },
                { token: "string", foreground: "16a34a" },
              ],
              colors: {
                "editor.background": "#f8fafc",
                "editorGutter.background": "#f8fafc",
                "editorOverviewRuler.border": "#f8fafc",
                "editor.lineHighlightBackground": "#eef4fb",
              },
            });

            monaco.editor.defineTheme("allora-dark", {
              base: "vs-dark",
              inherit: true,
              rules: [
                { token: "keyword", foreground: "93c5fd", fontStyle: "bold" },
                { token: "comment", foreground: "94a3b8", fontStyle: "italic" },
                { token: "number", foreground: "c4b5fd" },
                { token: "string", foreground: "86efac" },
              ],
              colors: {
                "editor.background": "#111827",
                "editorGutter.background": "#111827",
                "editorOverviewRuler.border": "#111827",
                "editor.lineHighlightBackground": "#182231",
              },
            });

            monaco.editor.setTheme(isDarkEditor ? "allora-dark" : "allora");
          }}
          onChange={(value) => updateActiveFile(value ?? "")}
          options={{
            fontSize: settings.editorFontSize,
            fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
            minimap: { enabled: false },
            lineNumbers: "on",
            wordWrap: settings.editorWordWrap ? "on" : "off",
            tabSize: settings.editorTabSize,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            scrollBeyondLastColumn: 0,
            renderLineHighlight: "none",
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            glyphMargin: false,
            folding: false,
            roundedSelection: false,
            cursorBlinking: "smooth",
            smoothScrolling: true,
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
              useShadows: false,
            },
            padding: {
              top: 20,
              bottom: 20,
            },
          }}
        />
        <CodexAssistantPanel
          isOpen={assistantOpen}
          authState={assistantAuth}
          messages={assistantMessages}
          mode={assistantMode}
          prompt={assistantPrompt}
          isSigningIn={isSigningIn}
          isSending={isSending}
          sendError={assistantSendError}
          onClose={() => setAssistantOpen(false)}
          onModeChange={setAssistantMode}
          onPromptChange={setAssistantPrompt}
          onSignIn={handleAssistantSignIn}
          onSignOut={handleAssistantSignOut}
          onRefreshAuth={() => {
            getCodexAuthState()
              .then(setAssistantAuth)
              .catch((error) => {
                setAssistantAuth({
                  status: "auth-failed",
                  error:
                    error instanceof Error
                      ? error.message
                      : "Unable to refresh Codex status.",
                });
              });
          }}
          onSend={handleAssistantSend}
        />
      </div>
    </div>
  );
}

function applyLintMarkers(
  monaco: Monaco | null,
  diagnostics: LintDiagnostic[],
) {
  if (!monaco) return;

  for (const model of monaco.editor.getModels()) {
    const fileName = model.uri.path.replace(/^\//, "");
    const lineCount = model.getLineCount();
    const markers = diagnostics
      .filter((diagnostic) => diagnostic.fileName === fileName)
      .map((diagnostic) => {
        const line = Math.min(Math.max(diagnostic.line, 1), lineCount);
        return {
          severity:
            diagnostic.severity === "warning"
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Error,
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line),
          message: diagnostic.message,
        };
      });

    monaco.editor.setModelMarkers(model, "allora-hdl-lint", markers);
  }
}

function getMonacoLanguage(fileName?: string) {
  if (!fileName) return "verilog";
  if (fileName.endsWith(".v")) return "verilog";
  if (fileName.endsWith(".sv")) return "verilog";
  if (fileName.endsWith(".vhd")) return "vhdl";
  if (fileName.endsWith(".vhdl")) return "vhdl";
  return "plaintext";
}

function registerHdlLanguages(monaco: Monaco) {
  monaco.languages.register({ id: "verilog" });

  monaco.languages.setMonarchTokensProvider("verilog", {
    tokenizer: {
      root: [
        [
          /\b(module|endmodule|input|output|wire|reg|logic|always|always_ff|always_comb|assign|begin|end|if|else|case|endcase|for|generate|endgenerate|parameter|localparam|posedge|negedge)\b/,
          "keyword",
        ],
        [/\b\d+'[bdh][0-9a-fA-F_xzXZ]+\b/, "number"],
        [/\b\d+\b/, "number"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/".*?"/, "string"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  });

  monaco.languages.register({ id: "vhdl" });

  monaco.languages.setMonarchTokensProvider("vhdl", {
    tokenizer: {
      root: [
        [
          /\b(library|use|entity|is|port|in|out|inout|architecture|of|begin|end|signal|process|if|then|else|elsif|case|when|others|std_logic|std_logic_vector|rising_edge|falling_edge)\b/i,
          "keyword",
        ],
        [/\b\d+\b/, "number"],
        [/--.*$/, "comment"],
        [/".*?"/, "string"],
      ],
    },
  });
}
