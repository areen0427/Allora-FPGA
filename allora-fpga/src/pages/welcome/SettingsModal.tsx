import type { AppSettings } from "../../data/settings";

type SettingsModalProps = {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
};

export function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
  function updateSetting<Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="variant-modal settings-modal" onClick={(event) => event.stopPropagation()}>
        <div className="variant-modal-header">
          <h2>Settings</h2>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="settings-grid">
          <SettingSelect label="Theme" value={settings.theme} onChange={(value) => updateSetting("theme", value as AppSettings["theme"])} options={["light", "ice", "solar", "dark", "black-ice"]} />
          <SettingSelect label="Default HDL" value={settings.defaultLanguage} onChange={(value) => updateSetting("defaultLanguage", value as AppSettings["defaultLanguage"])} options={["Verilog", "SystemVerilog", "VHDL"]} />
          <SettingSelect label="Default Project Name" value={settings.defaultProjectNamePattern} onChange={(value) => updateSetting("defaultProjectNamePattern", value as AppSettings["defaultProjectNamePattern"])} options={["my_fpga_project", "{board}_project"]} />
          <SettingSelect label="Auto-save Interval" value={settings.autoSaveInterval} onChange={(value) => updateSetting("autoSaveInterval", value as AppSettings["autoSaveInterval"])} options={["immediate", "5s", "30s"]} />
          <SettingNumber label="Editor Font Size" value={settings.editorFontSize} min={11} max={24} onChange={(value) => updateSetting("editorFontSize", value)} />
          <SettingNumber label="Editor Tab Size" value={settings.editorTabSize} min={2} max={8} onChange={(value) => updateSetting("editorTabSize", value)} />
          <SettingSelect label="Pin Mapping Mode" value={settings.defaultPinMappingMode} onChange={(value) => updateSetting("defaultPinMappingMode", value as AppSettings["defaultPinMappingMode"])} options={["simple", "advanced"]} />
          <SettingNumber label="Recent Projects Limit" value={settings.recentProjectsLimit} min={1} max={12} onChange={(value) => updateSetting("recentProjectsLimit", value)} />
          <SettingToggle label="Auto-save" checked={settings.autoSave} onChange={(value) => updateSetting("autoSave", value)} />
          <SettingToggle label="Editor Word Wrap" checked={settings.editorWordWrap} onChange={(value) => updateSetting("editorWordWrap", value)} />
          <SettingToggle label="Confirm Delete" checked={settings.confirmBeforeDelete} onChange={(value) => updateSetting("confirmBeforeDelete", value)} />
        </div>
      </div>
    </div>
  );
}

function SettingSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="setting-field">
      {label}
      <select className="setting-control" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{formatSettingOption(option)}</option>
        ))}
      </select>
    </label>
  );
}

function SettingNumber({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting-field">
      {label}
      <input className="setting-control" type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="setting-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function formatSettingOption(option: string) {
  if (option === "light") return "Light";
  if (option === "ice") return "Ice";
  if (option === "solar") return "Solar";
  if (option === "dark") return "Dark";
  if (option === "black-ice") return "Black Ice";
  if (option === "immediate") return "Immediate";
  if (option === "simple") return "Simple";
  if (option === "advanced") return "Advanced";
  if (option === "board-default") return "Board Default";
  if (option === "my_fpga_project") return "my_fpga_project";
  if (option === "{board}_project") return "{board}_project";
  return option;
}
