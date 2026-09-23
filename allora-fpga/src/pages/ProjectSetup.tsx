import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Cpu,
  FileCode2,
  FolderOpen,
  Layers3,
  Lightbulb,
  ListChecks,
  MemoryStick,
  Zap,
} from "lucide-react";
import type { BoardDefinition } from "../data/boards";
import { getBoardCapabilities } from "../data/boardCapabilities";
import {
  getLastProjectParentDirectory,
  type AppSettings,
} from "../data/settings";
import {
  PROJECT_TEMPLATES,
  getTemplateById,
  getTemplateUnavailableReason,
  type TemplateLanguage,
} from "../data/templates";
import BoardDiagram from "../components/BoardDiagram";
import { hasTauriInvoke } from "../lib/tauri";
import { pickProjectParentDirectory } from "../lib/projectWorkspace";

type ProjectSetupProps = {
  board: BoardDefinition;
  settings: AppSettings;
  onBack: () => void;
  onCreateProject: (
    projectName: string,
    language: string,
    parentDirectory: string | null,
    templateId: string,
    topModule: string,
    sourceFileName: string,
    createTestbench: boolean,
    initializeGit: boolean,
  ) => Promise<void> | void;
};

export default function ProjectSetup({
  board,
  settings,
  onBack,
  onCreateProject,
}: ProjectSetupProps) {
  const lastProjectParentDirectory = getLastProjectParentDirectory();
  const initialParentDirectory =
    settings.projectLocationMode === "last-used"
      ? lastProjectParentDirectory
      : null;
  const [projectName, setProjectName] = useState("");
  const [language, setLanguage] = useState<TemplateLanguage>("Verilog");
  const [isCreating, setIsCreating] = useState(false);
  const [parentDirectory, setParentDirectory] = useState<string | null>(
    initialParentDirectory,
  );
  const [isChoosingLocation, setIsChoosingLocation] = useState(false);
  const [templateId, setTemplateId] = useState("blinky");
  const [topModule, setTopModule] = useState("top");
  const [sourceFileName, setSourceFileName] = useState("top.v");
  const [topModuleCustomized, setTopModuleCustomized] = useState(false);
  const [sourceFileCustomized, setSourceFileCustomized] = useState(false);
  const [createTestbench, setCreateTestbench] = useState(false);
  const [initializeGit, setInitializeGit] = useState(false);
  const [creationError, setCreationError] = useState("");
  const capabilities = useMemo(() => getBoardCapabilities(board), [board]);
  const selectedTemplate = getTemplateById(templateId) ?? PROJECT_TEMPLATES[0];
  const projectPlan = getProjectPlan(
    topModule,
    sourceFileName,
    language,
    board,
    createTestbench,
    initializeGit,
  );
  const availableTemplateCount = PROJECT_TEMPLATES.filter(
    (template) => !getTemplateUnavailableReason(template, board, language),
  ).length;

  function changeLanguage(nextLanguage: TemplateLanguage) {
    setLanguage(nextLanguage);
    setSourceFileName((current) =>
      replaceSourceExtension(current, getSourceExtension(nextLanguage)),
    );
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

  function changeProjectName(nextProjectName: string) {
    setProjectName(nextProjectName);
    if (topModuleCustomized) return;

    const nextTopModule = sanitizeModuleName(nextProjectName || "top");
    setTopModule(nextTopModule);
    if (!sourceFileCustomized) {
      setSourceFileName(`${nextTopModule}.${getSourceExtension(language)}`);
    }
  }

  function changeTopModule(nextTopModule: string) {
    setTopModule(nextTopModule);
    setTopModuleCustomized(true);
    if (!sourceFileCustomized) {
      setSourceFileName(`${nextTopModule}.${getSourceExtension(language)}`);
    }
  }

  async function chooseLocation() {
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
  }

  async function createProject() {
    if (isCreating || !canCreateProject || requiresLocation) return;
    setIsCreating(true);
    setCreationError("");
    try {
      await onCreateProject(
        projectName,
        language,
        parentDirectory,
        templateId,
        topModule,
        sourceFileName,
        createTestbench,
        initializeGit,
      );
    } catch (error) {
      setCreationError(
        error instanceof Error
          ? error.message
          : "Unable to create the project.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  const requiresLocation =
    hasTauriInvoke() &&
    (settings.projectLocationMode === "ask" ||
      settings.projectLocationMode === "last-used") &&
    !parentDirectory;
  const expectedExtension = getSourceExtension(language);
  const topModuleIsValid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(topModule);
  const sourceFileIsValid =
    /^[A-Za-z0-9_.-]+$/.test(sourceFileName) &&
    sourceFileName.toLowerCase().endsWith(`.${expectedExtension}`);
  const canCreateProject =
    Boolean(projectName.trim()) && topModuleIsValid && sourceFileIsValid;

  return (
    <div className="glass-page project-setup-page">
      <header className="project-setup-topbar">
        <button className="project-setup-back" type="button" onClick={onBack}>
          ← Back
        </button>

        <div className="project-setup-heading">
          <div className="welcome-eyebrow">New Workspace</div>
          <h1>Create new project</h1>
          <p>
            {board.name} · {board.vendor} · {board.device}
          </p>
        </div>
      </header>

      <main className="project-setup-layout">
        <section className="liquid-home-card project-setup-card project-form-panel">
          <div className="project-panel-title">
            <FileCode2 size={18} />
            Project Details
          </div>

          <label className="project-setup-field">
            <span>Project name</span>
            <input
              value={projectName}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => changeProjectName(event.target.value)}
              placeholder="Enter a project name"
            />
          </label>

          <label className="project-setup-field">
            <span>Starter source type</span>
            <select
              value={language}
              onChange={(event) =>
                changeLanguage(event.target.value as TemplateLanguage)
              }
            >
              <option value="Verilog">Verilog (.v)</option>
              <option value="SystemVerilog">SystemVerilog (.sv)</option>
              <option value="VHDL">VHDL (.vhd)</option>
            </select>
          </label>

          <div className="project-location-card">
            <div className="project-location-copy">
              <FolderOpen size={18} />
              <div>
                <div>Project location</div>
                <p title={getLocationLabel()}>{getLocationLabel()}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={!hasTauriInvoke() || isChoosingLocation}
              onClick={() => void chooseLocation()}
            >
              {isChoosingLocation ? "Choosing..." : "Change"}
            </button>
          </div>

          <div className="project-detail-strip">
            <MiniFact
              icon={<FileCode2 size={14} />}
              label="Top"
              value={projectPlan.topModule}
            />
            <MiniFact
              icon={<ListChecks size={14} />}
              label="Source"
              value={projectPlan.sourceFile}
            />
            <MiniFact
              icon={<Zap size={14} />}
              label="Constraints"
              value={projectPlan.constraintsFile}
            />
          </div>

          {creationError ? (
            <div className="project-creation-error" role="alert">
              {creationError}
            </div>
          ) : null}

          <button
            className="project-create-button"
            type="button"
            disabled={!canCreateProject || requiresLocation || isCreating}
            onClick={() => void createProject()}
          >
            {isCreating ? "Creating Project..." : "Create Project"}
          </button>
        </section>

        <section className="liquid-home-card project-setup-card project-template-panel">
          <div className="project-panel-title">
            <Layers3 size={18} />
            Project Structure
          </div>

          <label className="project-setup-field project-template-select">
            <span>Starting point</span>
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              {PROJECT_TEMPLATES.map((template) => {
                const reason = getTemplateUnavailableReason(
                  template,
                  board,
                  language,
                );
                return (
                  <option
                    key={template.id}
                    value={template.id}
                    disabled={Boolean(reason)}
                  >
                    {template.name}
                    {reason ? ` — ${reason}` : ""}
                  </option>
                );
              })}
            </select>
          </label>

          <div className="project-template-summary">
            <Lightbulb size={16} />
            <div>
              <strong>{selectedTemplate.name}</strong>
              <p>{selectedTemplate.description}</p>
              <span>
                {availableTemplateCount}/{PROJECT_TEMPLATES.length} starters
                available for this board
              </span>
            </div>
          </div>

          <div className="project-name-fields">
            <label className="project-setup-field">
              <span>Top module</span>
              <input
                value={topModule}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={!topModuleIsValid}
                onChange={(event) => changeTopModule(event.target.value)}
              />
              {!topModuleIsValid ? (
                <small>
                  Use letters, numbers, and underscores; do not start with a
                  number.
                </small>
              ) : null}
            </label>
            <label className="project-setup-field">
              <span>Source file</span>
              <input
                value={sourceFileName}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={!sourceFileIsValid}
                onChange={(event) => {
                  setSourceFileName(event.target.value);
                  setSourceFileCustomized(true);
                }}
              />
              {!sourceFileIsValid ? (
                <small>
                  Use a .{expectedExtension} filename without folders.
                </small>
              ) : null}
            </label>
          </div>

          <div className="project-option-list">
            <label className="project-option-row">
              <span>
                <strong>Create testbench</strong>
                <small>
                  Add{" "}
                  {projectPlan.testbenchFile ??
                    `sim/${topModule || "top"}_tb.${expectedExtension}`}
                </small>
              </span>
              <input
                type="checkbox"
                checked={createTestbench}
                onChange={(event) => setCreateTestbench(event.target.checked)}
              />
            </label>
            <label className="project-option-row">
              <span>
                <strong>Initialize local Git repository</strong>
                <small>Creates .git and a project .gitignore</small>
              </span>
              <input
                type="checkbox"
                checked={initializeGit}
                onChange={(event) => setInitializeGit(event.target.checked)}
              />
            </label>
          </div>

          <div className="project-file-preview">
            <div>
              <ListChecks size={16} />
              <span>Files to create</span>
            </div>
            <ul>
              {projectPlan.files.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="project-setup-side">
          <section className="liquid-home-card project-setup-card board-summary-panel">
            <div className="project-panel-title">
              <Cpu size={18} />
              Board Summary
            </div>

            <div className="project-board-preview">
              <BoardDiagram board={board} compact />
            </div>

            <div className="board-resource-strip">
              <MiniFact
                icon={<MemoryStick size={14} />}
                label="Pins"
                value={String(board.pins.length)}
              />
              <MiniFact
                icon={<Zap size={14} />}
                label="Clocks"
                value={String(board.clocks.length)}
              />
              <MiniFact
                icon={<Lightbulb size={14} />}
                label="LEDs"
                value={String(board.leds.length)}
              />
              <MiniFact
                icon={<ListChecks size={14} />}
                label="Buttons"
                value={String(board.buttons.length)}
              />
            </div>

            <div className="capability-pill-list">
              <CapabilityPill
                label="Synthesis"
                supported={capabilities.synthesisDiagram.supported}
              />
              <CapabilityPill
                label="Bitstream"
                supported={capabilities.bitstream.supported}
              />
              <CapabilityPill
                label="Pin Mapping"
                supported={capabilities.pinMapping.supported}
              />
              <CapabilityPill
                label="Programming"
                supported={capabilities.programming.supported}
              />
              <CapabilityPill
                label="Diagram"
                supported={capabilities.synthesisDiagram.supported}
              />
            </div>

            <div className="project-summary-grid">
              <SummaryItem label="Family" value={board.family} />
              <SummaryItem label="Device" value={board.device} />
              <SummaryItem label="Package" value={board.package} />
              <SummaryItem label="Toolchain" value={capabilities.toolchain} />
              <SummaryItem
                label="Constraints"
                value={board.constraintsFile.toUpperCase()}
              />
              <SummaryItem
                label="Programmer"
                value={
                  board.programmer?.command ??
                  board.toolchain.program ??
                  "Not configured"
                }
              />
            </div>
          </section>
        </aside>
      </main>
    </div>
  );

  function getLocationLabel() {
    if (parentDirectory) return parentDirectory;
    if (settings.projectLocationMode === "ask") return "Choose a location";
    if (settings.projectLocationMode === "last-used") {
      return "Choose a location (no previous location found)";
    }
    return "Documents/Allora FPGA Projects";
  }
}

function MiniFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="project-mini-fact">
      {icon}
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function CapabilityPill({
  label,
  supported,
}: {
  label: string;
  supported: boolean;
}) {
  return (
    <span
      className={supported ? "capability-pill supported" : "capability-pill"}
    >
      {label}
    </span>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="project-summary-item">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function getProjectPlan(
  topModule: string,
  sourceFileName: string,
  language: TemplateLanguage,
  board: BoardDefinition,
  createTestbench: boolean,
  initializeGit: boolean,
) {
  const sourceExtension = getSourceExtension(language);
  const safeTopModule = topModule || "top";
  const testbenchFile = createTestbench
    ? `sim/${safeTopModule}_tb.${sourceExtension}`
    : null;
  const files = [
    `src/${sourceFileName || `${safeTopModule}.${sourceExtension}`}`,
    ...(testbenchFile ? [testbenchFile] : []),
    `constraints/constraints.${board.constraintsFile}`,
    "allora-project.json",
    ...(initializeGit ? [".gitignore"] : []),
  ];

  return {
    topModule: safeTopModule,
    sourceFile: sourceFileName || `${safeTopModule}.${sourceExtension}`,
    constraintsFile: `constraints.${board.constraintsFile}`,
    testbenchFile,
    files,
  };
}

function getSourceExtension(language: TemplateLanguage) {
  return language === "SystemVerilog"
    ? "sv"
    : language === "VHDL"
      ? "vhd"
      : "v";
}

function replaceSourceExtension(fileName: string, extension: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "") || "top";
  return `${baseName}.${extension}`;
}

function sanitizeModuleName(name: string) {
  const sanitized = name
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!sanitized) return "top";
  if (/^[0-9]/.test(sanitized)) return `top_${sanitized}`;
  return sanitized;
}
