import { useState } from "react";
import type { BoardDefinition } from "../data/boards";
import type { AppSettings } from "../data/settings";
import {
  PROJECT_TEMPLATES,
  getTemplateUnavailableReason,
  type TemplateLanguage,
} from "../data/templates";
import { hasTauriInvoke } from "../lib/tauri";
import { pickProjectParentDirectory } from "../lib/projectWorkspace";

const formControlStyle = {
  width: "100%",
  marginTop: "10px",
  minHeight: "56px",
  height: "56px",
  padding: "0 16px",
  borderRadius: "14px",
  border: "1px solid #cbd5e1",
  fontSize: "16px",
  boxSizing: "border-box" as const,
};

type ProjectSetupProps = {
  board: BoardDefinition;
  settings: AppSettings;
  onBack: () => void;
  onCreateProject: (
    projectName: string,
    language: string,
    parentDirectory: string | null,
    templateId: string,
  ) => Promise<void> | void;
};

export default function ProjectSetup({
  board,
  settings,
  onBack,
  onCreateProject,
}: ProjectSetupProps) {
  const defaultProjectName =
    settings.defaultProjectNamePattern === "{board}_project"
      ? `${board.id.replace(/-/g, "_")}_project`
      : "my_fpga_project";
  const [projectName, setProjectName] = useState(defaultProjectName);
  const [language, setLanguage] = useState(settings.defaultLanguage);
  const [isCreating, setIsCreating] = useState(false);
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [isChoosingLocation, setIsChoosingLocation] = useState(false);
  const [templateId, setTemplateId] = useState("blinky");

  function changeLanguage(nextLanguage: TemplateLanguage) {
    setLanguage(nextLanguage);
    const selected = PROJECT_TEMPLATES.find(
      (template) => template.id === templateId,
    );
    if (
      selected &&
      getTemplateUnavailableReason(selected, board, nextLanguage)
    ) {
      setTemplateId("blinky");
    }
  }

  return (
    <div
      className="glass-page"
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "40px",
        boxSizing: "border-box",
      }}
    >
      <button
        onClick={onBack}
        style={{
          border: "none",
          background: "transparent",
          color: "#2563eb",
          fontSize: "16px",
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: "40px",
        }}
      >
        ← Back
      </button>

      <div
        className="liquid-home-card project-setup-card"
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "28px",
          padding: "40px",
          boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "44px",
            letterSpacing: "-0.04em",
          }}
        >
          Create new project
        </h1>

        <p
          style={{
            marginTop: "12px",
            fontSize: "18px",
            color: "#64748b",
          }}
        >
          {board.name} · {board.vendor} {board.device}
        </p>

        <label style={{ display: "block", marginTop: "36px", fontWeight: 700 }}>
          Project name
        </label>

        <input
          value={projectName}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="my_fpga_project"
          style={formControlStyle}
        />

        <label style={{ display: "block", marginTop: "24px", fontWeight: 700 }}>
          HDL language
        </label>

        <select
          value={language}
          onChange={(e) =>
            changeLanguage(
              e.target.value as "Verilog" | "SystemVerilog" | "VHDL",
            )
          }
          style={{
            background: "#ffffff",
            ...formControlStyle,
          }}
        >
          <option>Verilog</option>
          <option>SystemVerilog</option>
          <option>VHDL</option>
        </select>

        <label style={{ display: "block", marginTop: "24px", fontWeight: 700 }}>
          Starter template
        </label>

        <div className="template-grid">
          {PROJECT_TEMPLATES.map((template) => {
            const reason = getTemplateUnavailableReason(
              template,
              board,
              language,
            );
            const disabled = Boolean(reason);
            const selected = templateId === template.id;

            return (
              <button
                type="button"
                key={template.id}
                disabled={disabled}
                className={[
                  "template-card",
                  selected ? "selected" : "",
                  disabled ? "disabled" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={reason ?? template.description}
                onClick={() => setTemplateId(template.id)}
              >
                <span className="template-card-name">{template.name}</span>
                <span className="template-card-desc">
                  {reason ?? template.description}
                </span>
              </button>
            );
          })}
        </div>

        <label style={{ display: "block", marginTop: "24px", fontWeight: 700 }}>
          Project location
        </label>

        <div
          style={{
            marginTop: "10px",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: "10px",
            alignItems: "center",
          }}
        >
          <div
            style={{
              ...formControlStyle,
              marginTop: 0,
              display: "flex",
              alignItems: "center",
              color: parentDirectory ? "#0f172a" : "#64748b",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={parentDirectory ?? "Documents/Allora FPGA Projects"}
          >
            {parentDirectory ?? "Documents/Allora FPGA Projects"}
          </div>

          <button
            type="button"
            disabled={!hasTauriInvoke() || isChoosingLocation}
            onClick={async () => {
              if (!hasTauriInvoke() || isChoosingLocation) return;
              setIsChoosingLocation(true);
              try {
                const nextDirectory = await pickProjectParentDirectory();
                if (nextDirectory) {
                  setParentDirectory(nextDirectory);
                }
              } finally {
                setIsChoosingLocation(false);
              }
            }}
            style={{
              minHeight: "56px",
              height: "56px",
              padding: "0 16px",
              borderRadius: "14px",
              border: "1px solid #dbe4f0",
              background: "#ffffff",
              color: "#475569",
              fontSize: "15px",
              fontWeight: 700,
              cursor:
                !hasTauriInvoke() || isChoosingLocation
                  ? "not-allowed"
                  : "pointer",
              opacity: !hasTauriInvoke() || isChoosingLocation ? 0.65 : 1,
            }}
          >
            {isChoosingLocation ? "Choosing..." : "Choose Folder"}
          </button>
        </div>

        <button
          onClick={async () => {
            if (isCreating) return;
            setIsCreating(true);
            try {
              await onCreateProject(
                projectName,
                language,
                parentDirectory,
                templateId,
              );
            } finally {
              setIsCreating(false);
            }
          }}
          style={{
            width: "100%",
            marginTop: "36px",
            padding: "18px",
            borderRadius: "16px",
            border: "none",
            background: "#2563eb",
            color: "#ffffff",
            fontSize: "17px",
            fontWeight: 700,
            cursor: isCreating ? "progress" : "pointer",
            opacity: isCreating ? 0.8 : 1,
          }}
        >
          {isCreating ? "Creating Project..." : "Create Project"}
        </button>
      </div>
    </div>
  );
}
