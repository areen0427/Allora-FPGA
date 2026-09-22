const SETTINGS_KEY = "allora-fpga-settings";
const LAST_PROJECT_PARENT_KEY = "allora-fpga-last-project-parent";
const SETTINGS_VERSION = 4;

export type AppSettings = {
  theme: "ice" | "black-ice";
  startupView: "home" | "last-project";
  restorePreviousSession: boolean;
  reduceMotion: boolean;
  editorFontSize: number;
  editorTabSize: number;
  editorWordWrap: boolean;
  editorMinimap: boolean;
  editorWhitespace: "none" | "selection" | "all";
  projectLocationMode: "ask" | "documents" | "last-used";
  showGeneratedArtifacts: boolean;
  confirmBeforeDelete: boolean;
  simulatorDefaultRadix: "binary" | "hex" | "decimal";
  simulatorStepSize: 1 | 10 | 100;
  simulatorRefreshInterval: 50 | 100 | 250;
  simulatorCaptureWaveform: boolean;
  simulatorAutoOpenWaveform: boolean;
  simulatorCycleLimit: 100_000 | 1_000_000 | 10_000_000 | 0;
  simulatorLogLevel: "errors" | "normal" | "verbose";
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "ice",
  startupView: "home",
  restorePreviousSession: true,
  reduceMotion: false,
  editorFontSize: 15,
  editorTabSize: 2,
  editorWordWrap: true,
  editorMinimap: false,
  editorWhitespace: "selection",
  projectLocationMode: "ask",
  showGeneratedArtifacts: true,
  confirmBeforeDelete: true,
  simulatorDefaultRadix: "hex",
  simulatorStepSize: 1,
  simulatorRefreshInterval: 100,
  simulatorCaptureWaveform: true,
  simulatorAutoOpenWaveform: true,
  simulatorCycleLimit: 1_000_000,
  simulatorLogLevel: "normal",
};

export function getSettings(): AppSettings {
  try {
    const rawSettings = window.localStorage.getItem(SETTINGS_KEY);
    if (!rawSettings) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(rawSettings) as unknown;
    const candidate =
      isRecord(parsed) && isRecord(parsed.settings) ? parsed.settings : parsed;

    return sanitizeSettings(candidate);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ version: SETTINGS_VERSION, settings }),
  );
}

function sanitizeSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };

  return {
    theme: isOneOf(value.theme, ["ice", "black-ice"])
      ? value.theme
      : DEFAULT_SETTINGS.theme,
    startupView: isOneOf(value.startupView, ["home", "last-project"])
      ? value.startupView
      : DEFAULT_SETTINGS.startupView,
    restorePreviousSession:
      typeof value.restorePreviousSession === "boolean"
        ? value.restorePreviousSession
        : DEFAULT_SETTINGS.restorePreviousSession,
    reduceMotion:
      typeof value.reduceMotion === "boolean"
        ? value.reduceMotion
        : DEFAULT_SETTINGS.reduceMotion,
    editorFontSize: sanitizeInteger(
      value.editorFontSize,
      11,
      24,
      DEFAULT_SETTINGS.editorFontSize,
    ),
    editorTabSize: isOneOf(value.editorTabSize, [2, 4, 8])
      ? value.editorTabSize
      : DEFAULT_SETTINGS.editorTabSize,
    editorWordWrap:
      typeof value.editorWordWrap === "boolean"
        ? value.editorWordWrap
        : DEFAULT_SETTINGS.editorWordWrap,
    editorMinimap:
      typeof value.editorMinimap === "boolean"
        ? value.editorMinimap
        : DEFAULT_SETTINGS.editorMinimap,
    editorWhitespace: isOneOf(value.editorWhitespace, [
      "none",
      "selection",
      "all",
    ])
      ? value.editorWhitespace
      : DEFAULT_SETTINGS.editorWhitespace,
    projectLocationMode: isOneOf(value.projectLocationMode, [
      "ask",
      "documents",
      "last-used",
    ])
      ? value.projectLocationMode
      : DEFAULT_SETTINGS.projectLocationMode,
    showGeneratedArtifacts:
      typeof value.showGeneratedArtifacts === "boolean"
        ? value.showGeneratedArtifacts
        : DEFAULT_SETTINGS.showGeneratedArtifacts,
    confirmBeforeDelete:
      typeof value.confirmBeforeDelete === "boolean"
        ? value.confirmBeforeDelete
        : DEFAULT_SETTINGS.confirmBeforeDelete,
    simulatorDefaultRadix: isOneOf(value.simulatorDefaultRadix, [
      "binary",
      "hex",
      "decimal",
    ])
      ? value.simulatorDefaultRadix
      : DEFAULT_SETTINGS.simulatorDefaultRadix,
    simulatorStepSize: isOneOf(value.simulatorStepSize, [1, 10, 100])
      ? value.simulatorStepSize
      : DEFAULT_SETTINGS.simulatorStepSize,
    simulatorRefreshInterval: isOneOf(
      value.simulatorRefreshInterval,
      [50, 100, 250],
    )
      ? value.simulatorRefreshInterval
      : DEFAULT_SETTINGS.simulatorRefreshInterval,
    simulatorCaptureWaveform:
      typeof value.simulatorCaptureWaveform === "boolean"
        ? value.simulatorCaptureWaveform
        : DEFAULT_SETTINGS.simulatorCaptureWaveform,
    simulatorAutoOpenWaveform:
      typeof value.simulatorAutoOpenWaveform === "boolean"
        ? value.simulatorAutoOpenWaveform
        : DEFAULT_SETTINGS.simulatorAutoOpenWaveform,
    simulatorCycleLimit: isOneOf(
      value.simulatorCycleLimit,
      [100_000, 1_000_000, 10_000_000, 0],
    )
      ? value.simulatorCycleLimit
      : DEFAULT_SETTINGS.simulatorCycleLimit,
    simulatorLogLevel: isOneOf(value.simulatorLogLevel, [
      "errors",
      "normal",
      "verbose",
    ])
      ? value.simulatorLogLevel
      : DEFAULT_SETTINGS.simulatorLogLevel,
  };
}

export function getLastProjectParentDirectory() {
  return window.localStorage.getItem(LAST_PROJECT_PARENT_KEY);
}

export function saveLastProjectParentDirectory(path: string) {
  window.localStorage.setItem(LAST_PROJECT_PARENT_KEY, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOneOf<const Value>(
  value: unknown,
  options: readonly Value[],
): value is Value {
  return options.includes(value as Value);
}

function sanitizeInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : fallback;
}
