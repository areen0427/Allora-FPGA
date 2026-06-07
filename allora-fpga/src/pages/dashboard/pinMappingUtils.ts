import type { BoardDefinition, BoardPin } from "../../data/boards";
import type { ProjectFile } from "./types";

export type HdlPort = {
  name: string;
  direction: "input" | "output" | "inout";
  baseName?: string;
  index?: number;
};

export function findPorts(files: ProjectFile[]) {
  const ports: HdlPort[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const discovered = file.name.endsWith(".vhd") || file.name.endsWith(".vhdl")
      ? findVhdlPorts(file.content)
      : findVerilogPorts(file.content);

    for (const port of discovered) {
      if (seen.has(port.name)) continue;
      seen.add(port.name);
      ports.push(port);
    }
  }

  return ports;
}

function findVerilogPorts(content: string) {
  const ports: HdlPort[] = [];
  const source = stripVerilogComments(content);
  const portPattern = /\b(input|output|inout)\b\s+([\s\S]*?)(?=\binput\b|\boutput\b|\binout\b|\);|;)/g;

  for (const match of source.matchAll(portPattern)) {
    const direction = match[1] as HdlPort["direction"];
    const declaration = match[2]
      .replace(/\b(?:wire|reg|logic|signed|unsigned)\b/g, " ")
      .trim();
    const rangeMatch = declaration.match(/\[(\d+)\s*:\s*(\d+)\]/);
    const declarationWithoutRanges = declaration.replace(/\[[^\]]+\]/g, " ");

    for (const rawName of declarationWithoutRanges.split(",")) {
      const name = rawName
        .replace(/=.*$/, "")
        .trim()
        .match(/[a-zA-Z_][a-zA-Z0-9_$]*$/)?.[0];

      if (!name) continue;

      ports.push(
        ...expandPort({
          direction,
          name,
          msb: rangeMatch?.[1],
          lsb: rangeMatch?.[2],
        })
      );
    }
  }

  return ports;
}

function stripVerilogComments(content: string) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ");
}

function findVhdlPorts(content: string) {
  const ports: HdlPort[] = [];
  const portBlock = content.match(/port\s*\(([\s\S]*?)\)\s*;/i)?.[1] ?? "";
  const portPattern =
    /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(in|out|inout)\b[^;]*(?:\((\d+)\s+downto\s+(\d+)\))?/gi;

  for (const match of portBlock.matchAll(portPattern)) {
    const direction = match[2].toLowerCase() as HdlPort["direction"];
    ports.push(
      ...expandPort({
        name: match[1],
        direction,
        msb: match[3],
        lsb: match[4],
      })
    );
  }

  return ports;
}

function expandPort({
  name,
  direction,
  msb,
  lsb,
}: {
  name: string;
  direction: HdlPort["direction"];
  msb?: string;
  lsb?: string;
}) {
  if (!msb || !lsb) return [{ name, direction }];

  const start = Number(msb);
  const end = Number(lsb);
  const step = start >= end ? -1 : 1;
  const ports: HdlPort[] = [];

  for (let index = start; step > 0 ? index <= end : index >= end; index += step) {
    ports.push({
      name: `${name}[${index}]`,
      baseName: name,
      index,
      direction,
    });
  }

  return ports;
}

export function createSuggestedMappings(
  ports: HdlPort[],
  pins: BoardPin[],
  clocks: BoardDefinition["clocks"]
) {
  const mappings: Record<string, string> = {};
  const usedPins = new Set<string>();

  for (const port of ports) {
    const clockMatch = findClockMatch(port, clocks);

    if (clockMatch?.pin) {
      mappings[port.name] = `clock:${clockMatch.name}`;
      continue;
    }

    const pinMatch = findPinMatch(port, pins, usedPins);

    if (pinMatch) {
      mappings[port.name] = `pin:${pinMatch.name}:${pinMatch.pin}`;
      usedPins.add(pinMatch.name);
    }
  }

  return mappings;
}

function findClockMatch(
  port: HdlPort,
  clocks: BoardDefinition["clocks"]
) {
  const aliases = getPortAliases(port);
  const isClockPort = aliases.some((alias) =>
    ["clk", "clock", "sysclk", "clk12", "clk25", "clk48"].includes(alias)
  );

  if (!isClockPort) return null;

  return (
    clocks.find((clock) =>
      aliases.some((alias) => normalizeName(clock.name).includes(alias))
    ) ?? clocks[0] ?? null
  );
}

function findPinMatch(
  port: HdlPort,
  pins: BoardPin[],
  usedPins: Set<string>
) {
  const aliases = getPortAliases(port);
  const preferredTypes = getPreferredTypes(aliases, port.direction);
  const isResetPort = aliases.some((alias) =>
    ["rst", "reset", "rstn", "resetn"].includes(alias)
  );
  const hasSpecificAlias = aliases.some((alias) => alias.length > 1);

  for (const type of preferredTypes) {
    const candidates = pins.filter((pin) => pin.type === type && !usedPins.has(pin.name));
    const indexedMatch = findIndexedCandidate(port, candidates);
    if (indexedMatch) return indexedMatch;

    const aliasMatch = findAliasCandidate(aliases, candidates);
    if (aliasMatch) return aliasMatch;

    if (isResetPort && type === "button") {
      const resetCandidate =
        candidates.find((pin) => pin.activeLow) ?? candidates[0] ?? null;
      if (resetCandidate) return resetCandidate;
    }

    if (candidates.length === 1) return candidates[0];

    if (!hasSpecificAlias && candidates.length > 0) {
      return candidates[0];
    }
  }

  return findAliasCandidate(
    aliases,
    pins.filter((pin) => !usedPins.has(pin.name)),
    { allowShortAliases: false }
  );
}

function findIndexedCandidate(port: HdlPort, candidates: BoardPin[]) {
  if (port.index === undefined) return null;
  const normalizedBase = normalizeName(port.baseName ?? port.name);

  return (
    candidates.find((pin) => {
      const searchable = getPinSearchTerms(pin).join(" ");
      return (
        normalizeName(searchable).includes(normalizedBase) &&
        new RegExp(`(^|[^0-9])${port.index}([^0-9]|$)`).test(searchable)
      );
    }) ?? candidates[port.index] ?? null
  );
}

function findAliasCandidate(
  aliases: string[],
  candidates: BoardPin[],
  options: { allowShortAliases?: boolean } = {}
) {
  const searchableAliases = options.allowShortAliases === false
    ? aliases.filter((alias) => alias.length > 1)
    : aliases;

  if (searchableAliases.length === 0) return null;

  return (
    candidates.find((pin) =>
      getPinSearchTerms(pin).some((term) => {
        const normalizedPin = normalizeName(term);
        return searchableAliases.some(
          (alias) =>
            normalizedPin === alias ||
            normalizedPin.includes(alias) ||
            alias.includes(normalizedPin)
        );
      })
    ) ?? null
  );
}

function getPreferredTypes(
  aliases: string[],
  direction: HdlPort["direction"]
): BoardPin["type"][] {
  if (aliases.some((alias) => ["rst", "reset", "rstn", "resetn", "btn", "button", "sw", "switch"].includes(alias))) {
    return ["button", "gpio"];
  }

  if (aliases.some((alias) => ["led", "rgb", "red", "green", "blue", "r", "g", "b"].includes(alias))) {
    return ["led", "gpio"];
  }

  if (aliases.some((alias) => ["tx", "uarttx"].includes(alias))) {
    return ["uart", "gpio"];
  }

  if (aliases.some((alias) => ["rx", "uartrx"].includes(alias))) {
    return ["uart", "gpio"];
  }

  if (aliases.some((alias) => alias.startsWith("gpio") || alias === "io")) {
    return ["gpio"];
  }

  return direction === "output" ? ["led", "gpio"] : ["button", "gpio"];
}

function getPortAliases(port: HdlPort) {
  const rawName = port.baseName ?? port.name;
  const normalized = normalizeName(rawName);
  const aliases = new Set([normalized]);

  if (["clk", "clock", "sysclk"].includes(normalized)) {
    aliases.add("clk");
    aliases.add("clock");
  }

  if (["rst", "reset", "rstn", "resetn"].includes(normalized)) {
    aliases.add("rst");
    aliases.add("reset");
    aliases.add("rstn");
  }

  if (normalized.startsWith("led")) aliases.add("led");
  if (normalized.startsWith("btn") || normalized.includes("button")) {
    aliases.add("btn");
    aliases.add("button");
  }
  if (normalized.includes("uart") && normalized.endsWith("tx")) aliases.add("tx");
  if (normalized.includes("uart") && normalized.endsWith("rx")) aliases.add("rx");
  if (normalized.endsWith("tx")) aliases.add("tx");
  if (normalized.endsWith("rx")) aliases.add("rx");

  return Array.from(aliases);
}

function getPinSearchTerms(pin: BoardPin) {
  return [pin.name, pin.signal, pin.group, pin.pin].filter(Boolean).map(String);
}

export function getPinOptions(board: BoardDefinition) {
  return [
    ...board.clocks
      .filter((clock) => clock.pin)
      .map((clock) => ({
        key: `clock:${clock.name}`,
        label: `${clock.name} (${clock.pin}) - Clock`,
        shortLabel: `${clock.name} ${clock.pin}`,
        pin: clock.pin ?? "",
        type: "clock",
        symbol: "CLK",
      })),
    ...board.pins.map((pin) => ({
      key: `pin:${pin.name}:${pin.pin}`,
      label: `${pin.name} (${pin.pin})${pin.group ? ` - ${pin.group}` : ""}`,
      shortLabel: `${pin.name} ${pin.pin}`,
      pin: pin.pin,
      type: pin.type,
      symbol: getPinSymbol(pin),
    })),
  ];
}

export function getPinSymbol(pin: BoardPin) {
  if (pin.type === "clock") return "CLK";
  if (pin.type === "led") return "LED";
  if (pin.type === "button") return pin.activeLow ? "RST" : "BTN";
  if (pin.type === "uart") return "URT";
  if (pin.type === "spi" || pin.type === "flash") return "SPI";
  if (pin.type === "i2c") return "I2C";
  if (pin.group?.toLowerCase().includes("usb") || pin.signal?.toLowerCase().includes("usb")) {
    return "USB";
  }
  if (pin.type === "gpio") return "IO";
  return "PIN";
}

export function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
