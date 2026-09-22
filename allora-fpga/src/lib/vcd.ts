import type { SignalWaveTrace } from "../components/SignalWaveformPanel";

export type WaveSignal = {
  id: string;
  name: string;
  shortName: string;
  width: number;
  values: { time: number; value: string }[];
};

export type Waveform = {
  timescale: string;
  endTime: number;
  signals: WaveSignal[];
};

export function buildTestbenchWaveTraces(
  waveform: Waveform | null,
): SignalWaveTrace[] {
  return (waveform?.signals ?? []).map((signal) => ({
    id: signal.id,
    name: signal.shortName,
    fullName: signal.name,
    width: signal.width,
    values: signal.values,
  }));
}

export function formatWaveTick(value: number, unit: string) {
  if (value === 0) return `0 ${unit}`;
  if (Math.abs(value) >= 1000) {
    const compact = value / 1000;
    return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}k ${unit}`;
  }

  return `${value} ${unit}`;
}

export function parseVcd(content: string): Waveform | null {
  if (!content.trim()) return null;

  const variables = new Map<string, { name: string; width: number }>();
  const values = new Map<string, { time: number; value: string }[]>();
  const scopes: string[] = [];
  let currentTime = 0;
  let endTime = 0;
  let timescale = "ns";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("$timescale")) {
      timescale = line
        .replace("$timescale", "")
        .replace("$end", "")
        .trim()
        .replace(/\s+/g, "");
      continue;
    }

    if (line.startsWith("$scope")) {
      const parts = line.split(/\s+/);
      if (parts[2]) scopes.push(parts[2]);
      continue;
    }

    if (line.startsWith("$upscope")) {
      scopes.pop();
      continue;
    }

    if (line.startsWith("$var")) {
      const parts = line.split(/\s+/);
      const width = Number(parts[2]) || 1;
      const id = parts[3];
      const shortName = parts.slice(4, -1).join(" ");
      const scopedName = [...scopes, shortName].filter(Boolean).join(".");
      variables.set(id, { name: scopedName || shortName, width });
      values.set(id, [
        { time: 0, value: width > 1 ? "x".repeat(Math.min(width, 8)) : "x" },
      ]);
      continue;
    }

    if (line.startsWith("#")) {
      currentTime = Number(line.slice(1)) || 0;
      endTime = Math.max(endTime, currentTime);
      continue;
    }

    if (line[0] === "b") {
      const [value, id] = line.slice(1).split(/\s+/);
      pushValue(values, id, currentTime, value);
      continue;
    }

    if (/^[01xz]/i.test(line)) {
      pushValue(values, line.slice(1), currentTime, line[0]);
    }
  }

  const signals = [...variables.entries()].map(([id, variable]) => ({
    id,
    name: variable.name,
    shortName: variable.name.split(".").pop() ?? variable.name,
    width: variable.width,
    values: compactValues(mergeSameTimeValues(values.get(id) ?? [])),
  }));

  return { timescale, endTime, signals: dedupeSignalAliases(signals) };
}

function dedupeSignalAliases(signals: WaveSignal[]) {
  const unique = new Map<string, WaveSignal>();

  for (const signal of signals) {
    const key = `${signal.shortName}|${signal.width}|${valueSignature(signal.values)}`;
    const existing = unique.get(key);

    if (!existing || preferSignalAlias(signal, existing)) {
      unique.set(key, signal);
    }
  }

  return [...unique.values()];
}

function valueSignature(values: WaveSignal["values"]) {
  return values.map((value) => `${value.time}:${value.value}`).join(",");
}

function preferSignalAlias(candidate: WaveSignal, current: WaveSignal) {
  const candidateIsDut = candidate.name.includes(".dut.");
  const currentIsDut = current.name.includes(".dut.");
  if (candidateIsDut !== currentIsDut) return !candidateIsDut;
  return candidate.name.length < current.name.length;
}

function pushValue(
  values: Map<string, { time: number; value: string }[]>,
  id: string | undefined,
  time: number,
  value: string,
) {
  if (!id || !values.has(id)) return;
  values.get(id)?.push({ time, value });
}

function compactValues(values: { time: number; value: string }[]) {
  return values.filter(
    (value, index) => index === 0 || values[index - 1].value !== value.value,
  );
}

function mergeSameTimeValues(values: { time: number; value: string }[]) {
  const merged: { time: number; value: string }[] = [];

  for (const value of values) {
    const previous = merged[merged.length - 1];
    if (previous?.time === value.time) {
      previous.value = value.value;
    } else {
      merged.push({ ...value });
    }
  }

  return merged;
}
