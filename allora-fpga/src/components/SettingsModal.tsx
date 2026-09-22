import { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Folder,
  Gauge,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import { DEFAULT_SETTINGS } from "../data/settings";
import type { AppSettings } from "../data/settings";
import { hasTauriInvoke } from "../lib/tauri";
import { virtualFpgaApi, type SimulationTools } from "../lib/virtualFpga";

type SettingsModalProps = {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
};

type SettingsCategory = "general" | "editor" | "workspace" | "simulator";

const categories = [
  { id: "general", label: "General", icon: Palette },
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "workspace", label: "Workspace", icon: Folder },
  { id: "simulator", label: "Simulator", icon: Gauge },
] satisfies Array<{
  id: SettingsCategory;
  label: string;
  icon: typeof Palette;
}>;

export function SettingsModal({
  settings,
  onChange,
  onClose,
}: SettingsModalProps) {
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>("general");
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const firstTabRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeCategory]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    firstTabRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  function updateSetting<Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key],
  ) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div
      className="modal-backdrop settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="variant-modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="settings-header">
          <div className="settings-heading">
            <span className="settings-heading-icon" aria-hidden="true">
              <Settings size={19} strokeWidth={2.2} />
            </span>
            <span>
              <h2 id={titleId}>Settings</h2>
              <p id={descriptionId}>Customize your Allora workspace</p>
            </span>
          </div>
          <button
            className="settings-close-button"
            type="button"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <nav className="settings-navigation" aria-label="Settings categories">
          <span className="settings-navigation-label">Preferences</span>
          {categories.map(({ id, label, icon: Icon }, index) => (
            <button
              ref={index === 0 ? firstTabRef : undefined}
              key={id}
              type="button"
              className="settings-navigation-item"
              aria-current={activeCategory === id ? "page" : undefined}
              onClick={() => setActiveCategory(id)}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        <main ref={contentRef} className="settings-content">
          {activeCategory === "general" ? (
            <SettingsSection
              title="General"
              description="Appearance and everyday workspace behavior."
            >
              <div className="settings-subsection-heading">
                <strong>Appearance</strong>
                <span>Applied immediately across the app.</span>
              </div>
              <div
                className="settings-theme-grid"
                role="radiogroup"
                aria-label="Theme"
              >
                <ThemeChoice
                  name="Ice"
                  theme="ice"
                  selected={settings.theme === "ice"}
                  onSelect={() => updateSetting("theme", "ice")}
                />
                <ThemeChoice
                  name="Black Ice"
                  theme="black-ice"
                  selected={settings.theme === "black-ice"}
                  onSelect={() => updateSetting("theme", "black-ice")}
                />
              </div>
              <SettingsGroup>
                <SettingSelect
                  label="Open on launch"
                  description="Choose where Allora starts next time."
                  value={settings.startupView}
                  onChange={(value) =>
                    updateSetting(
                      "startupView",
                      value as AppSettings["startupView"],
                    )
                  }
                  options={[
                    { value: "home", label: "Home" },
                    { value: "last-project", label: "Last project" },
                  ]}
                />
                <SettingToggle
                  label="Restore previous session"
                  description="Reopen the last active file when returning to a project."
                  checked={settings.restorePreviousSession}
                  onChange={(value) =>
                    updateSetting("restorePreviousSession", value)
                  }
                />
                <SettingToggle
                  label="Reduce Animation"
                  description="Skip the animated Simulate and Build screen transitions."
                  checked={settings.reduceMotion}
                  onChange={(value) => updateSetting("reduceMotion", value)}
                />
              </SettingsGroup>
            </SettingsSection>
          ) : null}

          {activeCategory === "editor" ? (
            <SettingsSection
              title="Editor"
              description="Changes apply to every open code editor."
            >
              <SettingsGroup>
                <SettingNumber
                  label="Font size"
                  description="Code text size in pixels."
                  value={settings.editorFontSize}
                  min={11}
                  max={24}
                  suffix="px"
                  onChange={(value) => updateSetting("editorFontSize", value)}
                />
                <SettingSelect
                  label="Tab size"
                  description="Spaces inserted when you press Tab."
                  value={String(settings.editorTabSize)}
                  onChange={(value) =>
                    updateSetting("editorTabSize", Number(value))
                  }
                  options={[2, 4, 8].map((value) => ({
                    value: String(value),
                    label: `${value} spaces`,
                  }))}
                />
                <SettingToggle
                  label="Word wrap"
                  description="Wrap long lines to the editor width."
                  checked={settings.editorWordWrap}
                  onChange={(value) => updateSetting("editorWordWrap", value)}
                />
                <SettingToggle
                  label="Minimap"
                  description="Show a compact overview of the current source file."
                  checked={settings.editorMinimap}
                  onChange={(value) => updateSetting("editorMinimap", value)}
                />
                <SettingSelect
                  label="Show whitespace"
                  description="Reveal spaces and tabs while editing HDL."
                  value={settings.editorWhitespace}
                  onChange={(value) =>
                    updateSetting(
                      "editorWhitespace",
                      value as AppSettings["editorWhitespace"],
                    )
                  }
                  options={[
                    { value: "none", label: "Never" },
                    { value: "selection", label: "Selection" },
                    { value: "all", label: "Always" },
                  ]}
                />
              </SettingsGroup>
            </SettingsSection>
          ) : null}

          {activeCategory === "workspace" ? (
            <SettingsSection
              title="Workspace"
              description="Project locations, files, and safety behavior."
            >
              <SettingsGroup>
                <SettingSelect
                  label="New project location"
                  description="Choose how new project folders are placed."
                  value={settings.projectLocationMode}
                  onChange={(value) =>
                    updateSetting(
                      "projectLocationMode",
                      value as AppSettings["projectLocationMode"],
                    )
                  }
                  options={[
                    { value: "ask", label: "Ask each time" },
                    { value: "documents", label: "Allora Projects" },
                    { value: "last-used", label: "Last used location" },
                  ]}
                />
                <SettingToggle
                  label="Show generated artifacts"
                  description="Include waveforms and build output in the project tree."
                  checked={settings.showGeneratedArtifacts}
                  onChange={(value) =>
                    updateSetting("showGeneratedArtifacts", value)
                  }
                />
                <SettingToggle
                  label="Confirm file deletion"
                  description="Ask before permanently removing a project file."
                  checked={settings.confirmBeforeDelete}
                  onChange={(value) =>
                    updateSetting("confirmBeforeDelete", value)
                  }
                />
              </SettingsGroup>
            </SettingsSection>
          ) : null}

          {activeCategory === "simulator" ? (
            <SettingsSection
              title="Simulator"
              description="Defaults for interactive and testbench simulation."
            >
              <SettingsGroup>
                <SettingSelect
                  label="Default signal radix"
                  description="Initial value format in the signal inspector."
                  value={settings.simulatorDefaultRadix}
                  onChange={(value) =>
                    updateSetting(
                      "simulatorDefaultRadix",
                      value as AppSettings["simulatorDefaultRadix"],
                    )
                  }
                  options={[
                    { value: "hex", label: "Hexadecimal" },
                    { value: "binary", label: "Binary" },
                    { value: "decimal", label: "Decimal" },
                  ]}
                />
                <SettingSelect
                  label="Step size"
                  description="Clock cycles advanced by the Step button."
                  value={String(settings.simulatorStepSize)}
                  onChange={(value) =>
                    updateSetting(
                      "simulatorStepSize",
                      Number(value) as AppSettings["simulatorStepSize"],
                    )
                  }
                  options={[
                    { value: "1", label: "1 cycle" },
                    { value: "10", label: "10 cycles" },
                    { value: "100", label: "100 cycles" },
                  ]}
                />
                <SettingSelect
                  label="Live refresh rate"
                  description="Balance interface smoothness and simulator load."
                  value={String(settings.simulatorRefreshInterval)}
                  onChange={(value) =>
                    updateSetting(
                      "simulatorRefreshInterval",
                      Number(value) as AppSettings["simulatorRefreshInterval"],
                    )
                  }
                  options={[
                    { value: "50", label: "Smooth · 50 ms" },
                    { value: "100", label: "Balanced · 100 ms" },
                    { value: "250", label: "Efficient · 250 ms" },
                  ]}
                />
                <SettingSelect
                  label="Simulation safety limit"
                  description="Pause long-running interactive simulations automatically."
                  value={String(settings.simulatorCycleLimit)}
                  onChange={(value) =>
                    updateSetting(
                      "simulatorCycleLimit",
                      Number(value) as AppSettings["simulatorCycleLimit"],
                    )
                  }
                  options={[
                    { value: "100000", label: "100,000 cycles" },
                    { value: "1000000", label: "1 million cycles" },
                    { value: "10000000", label: "10 million cycles" },
                    { value: "0", label: "No limit" },
                  ]}
                />
              </SettingsGroup>
              <SettingsGroup>
                <SettingToggle
                  label="Capture waveform"
                  description="Save simulation activity as a VCD waveform."
                  checked={settings.simulatorCaptureWaveform}
                  onChange={(value) =>
                    updateSetting("simulatorCaptureWaveform", value)
                  }
                />
                <SettingToggle
                  label="Open waveform after run"
                  description="Display a completed testbench waveform automatically."
                  checked={settings.simulatorAutoOpenWaveform}
                  onChange={(value) =>
                    updateSetting("simulatorAutoOpenWaveform", value)
                  }
                />
                <SettingSelect
                  label="Log detail"
                  description="Control how much compiler and runtime output is shown."
                  value={settings.simulatorLogLevel}
                  onChange={(value) =>
                    updateSetting(
                      "simulatorLogLevel",
                      value as AppSettings["simulatorLogLevel"],
                    )
                  }
                  options={[
                    { value: "errors", label: "Errors only" },
                    { value: "normal", label: "Normal" },
                    { value: "verbose", label: "Verbose" },
                  ]}
                />
              </SettingsGroup>
              <SimulatorToolStatus />
            </SettingsSection>
          ) : null}
        </main>

        <footer className="settings-footer">
          <span className="settings-save-status">
            <Check size={14} aria-hidden="true" />
            Changed projects auto-save every 30 seconds
          </span>
          <div className="settings-footer-actions">
            <button
              className="settings-reset-button"
              type="button"
              onClick={() => onChange({ ...DEFAULT_SETTINGS })}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Restore defaults
            </button>
            <button
              className="settings-done-button"
              type="button"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SimulatorToolStatus() {
  const desktopAvailable = hasTauriInvoke();
  const [tools, setTools] = useState<SimulationTools | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  async function scanTools() {
    if (!desktopAvailable || isScanning) return;
    setIsScanning(true);
    setScanError("");
    try {
      setTools(await virtualFpgaApi.detectTools());
    } catch {
      setScanError("Tool detection was unavailable.");
    } finally {
      setIsScanning(false);
    }
  }

  useEffect(() => {
    if (desktopAvailable) void scanTools();
    // Scan once when the Simulator pane opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopAvailable]);

  return (
    <section className="settings-toolchain" aria-label="Simulator toolchain">
      <header>
        <span>
          <strong>Simulator toolchain</strong>
          <small>Local tools used to compile and inspect RTL.</small>
        </span>
        <button
          type="button"
          disabled={!desktopAvailable || isScanning}
          onClick={() => void scanTools()}
        >
          <RefreshCw size={13} className={isScanning ? "spinning" : ""} />
          {isScanning ? "Scanning" : "Rescan"}
        </button>
      </header>
      {!desktopAvailable ? (
        <p className="settings-toolchain-message">
          Launch the desktop app to detect local simulator tools.
        </p>
      ) : scanError ? (
        <p className="settings-toolchain-message error">{scanError}</p>
      ) : (
        <div className="settings-tool-list">
          <ToolStatus name="Verilator" tool={tools?.verilator} />
          <ToolStatus name="Yosys" tool={tools?.yosys} />
        </div>
      )}
    </section>
  );
}

function ToolStatus({
  name,
  tool,
}: {
  name: string;
  tool: SimulationTools[keyof SimulationTools] | undefined;
}) {
  const available = tool?.available === true;
  return (
    <div className={`settings-tool-status${available ? " available" : ""}`}>
      {available ? (
        <CheckCircle2 size={16} aria-hidden="true" />
      ) : (
        <AlertCircle size={16} aria-hidden="true" />
      )}
      <span>
        <strong>{name}</strong>
        <small title={tool?.path ?? tool?.installHint}>
          {tool
            ? available
              ? (tool.path ?? "Detected")
              : tool.installHint
            : "Checking…"}
        </small>
      </span>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  return <div className="settings-group">{children}</div>;
}

function ThemeChoice({
  name,
  theme,
  selected,
  onSelect,
}: {
  name: string;
  theme: AppSettings["theme"];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`settings-theme-choice${selected ? " selected" : ""}`}
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
    >
      <span className={`settings-theme-preview ${theme}`} aria-hidden="true">
        <span className="settings-theme-light settings-theme-light-one" />
        <span className="settings-theme-light settings-theme-light-two" />
        <span className="settings-theme-glass">
          <span className="settings-theme-refraction" />
        </span>
      </span>
      <span className="settings-theme-choice-label">
        {name}
        {selected ? <Check size={14} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

function SettingRow({
  label,
  description,
  disabled = false,
  children,
}: {
  label: string;
  description: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`settings-row${disabled ? " disabled" : ""}`}>
      <span className="settings-row-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      {children}
    </div>
  );
}

function SettingSelect({
  label,
  description,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <SettingRow label={label} description={description} disabled={disabled}>
      <select
        className="settings-control"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </SettingRow>
  );
}

function SettingNumber({
  label,
  description,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow label={label} description={description}>
      <span className="settings-number-control">
        <input
          className="settings-control"
          aria-label={label}
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            if (nextValue >= min && nextValue <= max) onChange(nextValue);
          }}
        />
        {suffix ? <span>{suffix}</span> : null}
      </span>
    </SettingRow>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingRow label={label} description={description}>
      <button
        type="button"
        className="settings-switch"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </SettingRow>
  );
}
