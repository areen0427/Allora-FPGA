import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileCode2,
  FolderOpen,
  Gauge,
  Play,
  Sparkles,
  Waves,
} from "lucide-react";
import type { AppSettings } from "../data/settings";
import { getLastProjectParentDirectory } from "../data/settings";
import { hasTauriInvoke } from "../lib/tauri";
import { pickProjectParentDirectory } from "../lib/projectWorkspace";

export type SimulationStarter = "blank" | "counter" | "pwm";

type Props = {
  settings: AppSettings;
  onBack: () => void;
  onCreateProject: (
    projectName: string,
    language: "Verilog" | "SystemVerilog",
    parentDirectory: string | null,
    starter: SimulationStarter,
  ) => Promise<void> | void;
};

const STARTERS: Array<{
  id: SimulationStarter;
  title: string;
  description: string;
  tag: string;
  icon: typeof FileCode2;
}> = [
  {
    id: "counter",
    title: "Guided LED counter",
    description:
      "Start with working RTL, pre-mapped controls, and a short run-and-inspect guide.",
    tag: "Recommended",
    icon: Gauge,
  },
  {
    id: "pwm",
    title: "PWM dimmer",
    description:
      "Explore duty cycle changes through a virtual switch, LED, and live waveform.",
    tag: "Explore",
    icon: Waves,
  },
  {
    id: "blank",
    title: "Blank simulation",
    description:
      "Create an empty top module and configure the virtual hardware yourself.",
    tag: "Advanced",
    icon: FileCode2,
  },
];

export default function SimulationProjectSetup({
  settings,
  onBack,
  onCreateProject,
}: Props) {
  const initialParentDirectory =
    settings.projectLocationMode === "last-used"
      ? getLastProjectParentDirectory()
      : null;
  const [projectName, setProjectName] = useState("virtual-led-counter");
  const [language, setLanguage] = useState<"Verilog" | "SystemVerilog">(
    "SystemVerilog",
  );
  const [starter, setStarter] = useState<SimulationStarter>("counter");
  const [parentDirectory, setParentDirectory] = useState<string | null>(
    initialParentDirectory,
  );
  const [isChoosingLocation, setIsChoosingLocation] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const requiresLocation =
    hasTauriInvoke() &&
    (settings.projectLocationMode === "ask" ||
      settings.projectLocationMode === "last-used") &&
    !parentDirectory;

  async function chooseLocation() {
    if (!hasTauriInvoke() || isChoosingLocation) return;
    setIsChoosingLocation(true);
    try {
      const directory = await pickProjectParentDirectory();
      if (directory) setParentDirectory(directory);
    } finally {
      setIsChoosingLocation(false);
    }
  }

  async function createProject() {
    if (!projectName.trim() || requiresLocation || isCreating) return;
    setIsCreating(true);
    try {
      await onCreateProject(
        projectName.trim(),
        language,
        parentDirectory,
        starter,
      );
    } finally {
      setIsCreating(false);
    }
  }

  function getLocationLabel() {
    if (parentDirectory) return parentDirectory;
    if (settings.projectLocationMode === "ask") return "Choose a location";
    if (settings.projectLocationMode === "last-used") {
      return "Choose a location (no previous location found)";
    }
    return "AlloraProjects";
  }

  return (
    <div className="glass-page simulation-setup-page">
      <header className="simulation-setup-topbar">
        <button className="project-setup-back" type="button" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="project-setup-heading">
          <div className="welcome-eyebrow">Virtual FPGA</div>
          <h1>New simulation project</h1>
          <p>Begin with RTL now. A physical board is optional.</p>
        </div>
        <div className="simulation-setup-assurance">
          <Sparkles size={15} /> No board required
        </div>
      </header>

      <main className="simulation-setup-layout">
        <section className="liquid-home-card simulation-setup-details">
          <div className="project-panel-title">
            <FileCode2 size={18} /> Project details
          </div>
          <label className="project-setup-field">
            <span>Project name</span>
            <input
              value={projectName}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setProjectName(event.target.value)}
            />
          </label>
          <label className="project-setup-field">
            <span>HDL language</span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as "Verilog" | "SystemVerilog")
              }
            >
              <option value="SystemVerilog">SystemVerilog (.sv)</option>
              <option value="Verilog">Verilog (.v)</option>
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
              {isChoosingLocation ? "Choosing…" : "Change"}
            </button>
          </div>
          <div className="simulation-setup-facts">
            <span><CheckCircle2 size={14} /> Verilator-ready</span>
            <span><CheckCircle2 size={14} /> Live waveform</span>
            <span><CheckCircle2 size={14} /> Add hardware later</span>
          </div>
        </section>

        <section className="liquid-home-card simulation-starter-panel">
          <div className="project-panel-title">
            <Sparkles size={18} /> Choose a starting point
          </div>
          <div className="simulation-starter-grid">
            {STARTERS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={
                    starter === item.id
                      ? "simulation-starter-card selected"
                      : "simulation-starter-card"
                  }
                  type="button"
                  key={item.id}
                  onClick={() => setStarter(item.id)}
                >
                  <span className="simulation-starter-icon"><Icon size={20} /></span>
                  <span className="simulation-starter-copy">
                    <small>{item.tag}</small>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </span>
                  <span className="simulation-starter-check">
                    {starter === item.id ? <CheckCircle2 size={18} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="simulation-create-row">
            <div>
              <strong>{STARTERS.find((item) => item.id === starter)?.title}</strong>
              <span> opens directly in the Virtual FPGA workspace</span>
            </div>
            <button
              className="project-create-button"
              type="button"
              disabled={!projectName.trim() || requiresLocation || isCreating}
              onClick={() => void createProject()}
            >
              <Play size={16} fill="currentColor" />
              {isCreating ? "Creating…" : "Create & start"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
