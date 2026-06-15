import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
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
import type { AppSettings } from "../data/settings";
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
  const capabilities = useMemo(() => getBoardCapabilities(board), [board]);
  const selectedTemplate = getTemplateById(templateId) ?? PROJECT_TEMPLATES[0];
  const projectPlan = getProjectPlan(projectName, language, board);
  const availableTemplateCount = PROJECT_TEMPLATES.filter(
    (template) => !getTemplateUnavailableReason(template, board, language),
  ).length;

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
    if (isCreating) return;
    setIsCreating(true);
    try {
      await onCreateProject(projectName, language, parentDirectory, templateId);
    } finally {
      setIsCreating(false);
    }
  }

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
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="my_fpga_project"
            />
          </label>

          <label className="project-setup-field">
            <span>HDL language</span>
            <select
              value={language}
              onChange={(event) =>
                changeLanguage(event.target.value as TemplateLanguage)
              }
            >
              <option>Verilog</option>
              <option>SystemVerilog</option>
              <option>VHDL</option>
            </select>
          </label>

          <div className="project-location-card">
            <div className="project-location-copy">
              <FolderOpen size={18} />
              <div>
                <div>Project location</div>
                <p title={parentDirectory ?? "Documents/Allora FPGA Projects"}>
                  {parentDirectory ?? "Documents/Allora FPGA Projects"}
                </p>
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

          <button
            className="project-create-button"
            type="button"
            onClick={() => void createProject()}
          >
            {isCreating ? "Creating Project..." : "Create Project"}
          </button>
        </section>

        <section className="liquid-home-card project-setup-card project-template-panel">
          <div className="project-panel-title">
            <Layers3 size={18} />
            Starter Template
          </div>

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

          <div className="project-template-note">
            <CheckCircle2 size={15} />
            <span>
              {selectedTemplate.name} · {availableTemplateCount}/
              {PROJECT_TEMPLATES.length} available
            </span>
          </div>

          <div className="template-inspector">
            <div>
              <Lightbulb size={16} />
              <span>Template Output</span>
            </div>
            <p>{selectedTemplate.description}</p>
            <div className="template-meta-row">
              <span>{language}</span>
              <span>{selectedTemplate.generate ? "Pre-mapped I/O" : "Starter flow"}</span>
              <span>{selectedTemplate.languages.join(" / ")}</span>
            </div>
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
              <CapabilityPill label="Synthesis" supported={capabilities.synthesisDiagram.supported} />
              <CapabilityPill label="Bitstream" supported={capabilities.bitstream.supported} />
              <CapabilityPill label="Pin Mapping" supported={capabilities.pinMapping.supported} />
              <CapabilityPill label="Programming" supported={capabilities.programming.supported} />
              <CapabilityPill label="Diagram" supported={capabilities.synthesisDiagram.supported} />
            </div>

            <div className="project-summary-grid">
              <SummaryItem label="Family" value={board.family} />
              <SummaryItem label="Device" value={board.device} />
              <SummaryItem label="Package" value={board.package} />
              <SummaryItem label="Toolchain" value={capabilities.toolchain} />
              <SummaryItem label="Constraints" value={board.constraintsFile.toUpperCase()} />
              <SummaryItem
                label="Programmer"
                value={board.programmer?.command ?? board.toolchain.program ?? "Not configured"}
              />
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
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
    <span className={supported ? "capability-pill supported" : "capability-pill"}>
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
  projectName: string,
  language: TemplateLanguage,
  board: BoardDefinition,
) {
  const topModule = sanitizeModuleName(projectName || "top");
  const sourceExtension =
    language === "SystemVerilog" ? "sv" : language === "VHDL" ? "vhd" : "v";

  return {
    topModule,
    sourceFile: `${topModule}.${sourceExtension}`,
    constraintsFile: `constraints.${board.constraintsFile}`,
  };
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
