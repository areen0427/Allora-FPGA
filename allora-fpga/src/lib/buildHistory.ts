import type { ProjectFile } from "../pages/dashboard/types";
import { writeProjectFile } from "./projectWorkspace";

export const BUILD_HISTORY_FILE_NAME = "build-history.json";
const MAX_RECORDS = 50;

export type BuildUtilizationEntry = {
  resource: string;
  used: number;
  total: number;
};

export type BuildRecord = {
  id: string;
  timestamp: string;
  success: boolean;
  durationMs: number;
  topModule?: string;
  bytes?: number;
  fmaxMhz?: number;
  timingPass?: boolean;
  utilization?: BuildUtilizationEntry[];
  message?: string;
};

export function readBuildHistory(files: ProjectFile[]): BuildRecord[] {
  const historyFile = files.find(
    (file) => file.name === BUILD_HISTORY_FILE_NAME && !file.isBinary
  );
  if (!historyFile?.content) return [];

  try {
    const parsed = JSON.parse(historyFile.content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (record): record is BuildRecord =>
        Boolean(record) && typeof record === "object" && "timestamp" in record
    );
  } catch {
    return [];
  }
}

/**
 * Pull fmax and device utilization out of yosys/nextpnr build logs.
 * nextpnr reports lines like:
 *   Info: Max frequency for clock 'clk': 73.26 MHz (PASS at 12.00 MHz)
 *   Info:            ICESTORM_LC:    99/ 5280     1%
 */
export function parseBuildMetrics(logs: string[]) {
  let fmaxMhz: number | undefined;
  let timingPass: boolean | undefined;
  const utilization: BuildUtilizationEntry[] = [];
  const seenResources = new Set<string>();

  for (const line of logs) {
    const fmaxMatch = line.match(
      /max frequency for clock\s+'?\$?[^':]*'?\s*:\s*([\d.]+)\s*MHz(?:\s*\((PASS|FAIL)\b)?/i
    );
    if (fmaxMatch) {
      const value = Number.parseFloat(fmaxMatch[1]);
      if (Number.isFinite(value)) {
        // Track the worst clock so the headline number is the binding one.
        fmaxMhz = fmaxMhz === undefined ? value : Math.min(fmaxMhz, value);
      }
      if (fmaxMatch[2]) {
        const pass = fmaxMatch[2].toUpperCase() === "PASS";
        timingPass = timingPass === undefined ? pass : timingPass && pass;
      }
      continue;
    }

    const utilizationMatch = line.match(
      /^\s*(?:Info:)?\s*([A-Z][A-Z0-9_]+):\s*(\d+)\s*\/\s*(\d+)/
    );
    if (utilizationMatch) {
      const resource = utilizationMatch[1];
      const used = Number.parseInt(utilizationMatch[2], 10);
      const total = Number.parseInt(utilizationMatch[3], 10);
      if (total > 0 && !seenResources.has(resource)) {
        seenResources.add(resource);
        utilization.push({ resource, used, total });
      }
    }
  }

  return { fmaxMhz, timingPass, utilization };
}

const RESOURCE_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^(ICESTORM_LC|TRELLIS_SLICE|TRELLIS_COMB|SLICE)$/, label: "Logic" },
  { pattern: /^(ICESTORM_RAM|DP16KD|EBR)$/, label: "Block RAM" },
  { pattern: /^(ICESTORM_DSP|MULT18X18D|DSP)$/, label: "DSP" },
  { pattern: /^(ICESTORM_PLL|EHXPLLL|PLL)$/, label: "PLL" },
  { pattern: /^(SB_IO|TRELLIS_IO|IO)$/, label: "I/O" },
];

export function getResourceLabel(resource: string) {
  return (
    RESOURCE_LABELS.find((entry) => entry.pattern.test(resource))?.label ?? null
  );
}

/** Order utilization entries with the headline resources first. */
export function getDisplayUtilization(entries: BuildUtilizationEntry[]) {
  const labeled = entries
    .map((entry) => ({ ...entry, label: getResourceLabel(entry.resource) }))
    .filter((entry) => entry.label !== null) as Array<
    BuildUtilizationEntry & { label: string }
  >;

  if (labeled.length > 0) return labeled;

  return entries
    .filter((entry) => entry.used > 0)
    .slice(0, 4)
    .map((entry) => ({ ...entry, label: entry.resource }));
}

export function appendBuildRecord(
  files: ProjectFile[],
  record: BuildRecord
): { fileName: string; content: string; records: BuildRecord[] } {
  const records = [...readBuildHistory(files), record].slice(-MAX_RECORDS);
  return {
    fileName: BUILD_HISTORY_FILE_NAME,
    content: JSON.stringify(records, null, 2),
    records,
  };
}

export async function persistBuildHistory(
  projectPath: string,
  content: string
) {
  await writeProjectFile(`${projectPath}/build/${BUILD_HISTORY_FILE_NAME}`, content);
}

export function createBuildRecordId() {
  return window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
