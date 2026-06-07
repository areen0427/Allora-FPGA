import { useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { ProjectFile } from "./types";
import type { AppSettings } from "../../data/settings";

type EditorSectionProps = {
  openFiles: ProjectFile[];
  activeFileName: string | null;
  setActiveFileName: (fileName: string) => void;
  activeFile: ProjectFile | undefined;
  dirtyFileNames: string[];
  updateActiveFile: (content: string) => void;
  createNewFile: () => void;
  closeOpenFile: (fileName: string) => void;
  renameFile: (oldName: string, newName: string) => Promise<void> | void;
  settings: AppSettings;
};

export default function EditorSection({
  openFiles,
  activeFileName,
  setActiveFileName,
  activeFile,
  dirtyFileNames,
  updateActiveFile,
  createNewFile,
  closeOpenFile,
  renameFile,
  settings,
}: EditorSectionProps) {

    const [editingFile, setEditingFile] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const isDarkEditor =
      settings.theme === "dark" || settings.theme === "black-ice";

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
            <button
  className={`editor-file-tab${file.name === activeFileName ? " active" : ""}`}
  key={file.name}
  onClick={() => setActiveFileName(file.name)}
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
</button>
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
        </div>

      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          value={activeFile?.content ?? ""}
          language={getMonacoLanguage(activeFile?.name)}
          theme={isDarkEditor ? "allora-dark" : "allora"}
          onMount={(_, monaco) => {
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
      </div>
    </div>
  );
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
        [/\b(module|endmodule|input|output|wire|reg|logic|always|always_ff|always_comb|assign|begin|end|if|else|case|endcase|for|generate|endgenerate|parameter|localparam|posedge|negedge)\b/, "keyword"],
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
        [/\b(library|use|entity|is|port|in|out|inout|architecture|of|begin|end|signal|process|if|then|else|elsif|case|when|others|std_logic|std_logic_vector|rising_edge|falling_edge)\b/i, "keyword"],
        [/\b\d+\b/, "number"],
        [/--.*$/, "comment"],
        [/".*?"/, "string"],
      ],
    },
  });
}
