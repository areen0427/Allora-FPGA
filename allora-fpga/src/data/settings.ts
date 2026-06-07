const SETTINGS_KEY = "allora-fpga-settings";

export type AppSettings = {
  theme: "light" | "dark";
  defaultLanguage: "Verilog" | "SystemVerilog" | "VHDL";
  defaultProjectNamePattern: "my_fpga_project" | "{board}_project";
  autoSave: boolean;
  autoSaveInterval: "immediate" | "5s" | "30s";
  editorFontSize: number;
  editorTabSize: number;
  editorWordWrap: boolean;
  defaultPinMappingMode: "simple" | "advanced";
  recentProjectsLimit: number;
  confirmBeforeDelete: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  defaultLanguage: "Verilog",
  defaultProjectNamePattern: "my_fpga_project",
  autoSave: true,
  autoSaveInterval: "immediate",
  editorFontSize: 15,
  editorTabSize: 2,
  editorWordWrap: true,
  defaultPinMappingMode: "advanced",
  recentProjectsLimit: 5,
  confirmBeforeDelete: true,
};

export function getSettings(): AppSettings {
  try {
    const rawSettings = window.localStorage.getItem(SETTINGS_KEY);
    if (!rawSettings) return DEFAULT_SETTINGS;

    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(rawSettings),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
