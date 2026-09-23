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
    const discovered =
      file.name.endsWith(".vhd") || file.name.endsWith(".vhdl")
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
  const portPattern =
    /\b(input|output|inout)\b\s+([\s\S]*?)(?=\binput\b|\boutput\b|\binout\b|\);|;)/g;

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
        }),
      );
    }
  }

  return ports;
}

function stripVerilogComments(content: string) {
  return content.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
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
      }),
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

  for (
    let index = start;
    step > 0 ? index <= end : index >= end;
    index += step
  ) {
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
  clocks: BoardDefinition["clocks"],
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

function findClockMatch(port: HdlPort, clocks: BoardDefinition["clocks"]) {
  const aliases = getPortAliases(port);
  const isClockPort = aliases.some(
    (alias) =>
      ["clk", "clock", "sysclk"].includes(alias) || /^clk\d+$/.test(alias),
  );

  if (!isClockPort) return null;

  for (const alias of aliases) {
    const matches = clocks.filter((clock) =>
      namesExplicitlyMatch(alias, clock.name),
    );
    if (matches.length === 1) return matches[0];
  }

  return null;
}

function findPinMatch(port: HdlPort, pins: BoardPin[], usedPins: Set<string>) {
  const aliases = getPortAliases(port);
  const preferredTypes = getPreferredTypes(aliases, port.direction);

  for (const type of preferredTypes) {
    const candidates = pins.filter(
      (pin) => pin.type === type && !usedPins.has(pin.name),
    );
    const indexedMatch = findIndexedCandidate(port, candidates);
    if (indexedMatch) return indexedMatch;

    const aliasMatch = findAliasCandidate(aliases, candidates);
    if (aliasMatch) return aliasMatch;
  }

  return findAliasCandidate(
    aliases,
    pins.filter((pin) => !usedPins.has(pin.name)),
    { allowShortAliases: false },
  );
}

function findIndexedCandidate(port: HdlPort, candidates: BoardPin[]) {
  if (port.index === undefined) return null;
  const normalizedBase = normalizeName(port.baseName ?? port.name);
  const indexedName = `${normalizedBase}${port.index}`;

  return (
    candidates.find((pin) => {
      return getPinSearchTerms(pin).some((term) => {
        const parts = getNameParts(term);
        return (
          parts.includes(indexedName) ||
          (parts.includes(normalizedBase) && parts.includes(String(port.index)))
        );
      });
    }) ?? null
  );
}

function findAliasCandidate(
  aliases: string[],
  candidates: BoardPin[],
  options: { allowShortAliases?: boolean } = {},
) {
  const searchableAliases =
    options.allowShortAliases === false
      ? aliases.filter((alias) => alias.length > 1)
      : aliases;

  if (searchableAliases.length === 0) return null;

  for (const alias of searchableAliases) {
    const matches = candidates.filter((pin) =>
      getPinSearchTerms(pin).some((term) => namesExplicitlyMatch(alias, term)),
    );
    if (matches.length === 1) return matches[0];
  }

  return null;
}

function namesExplicitlyMatch(alias: string, candidateName: string) {
  const normalizedAlias = normalizeName(alias);
  const candidateParts = getNameParts(candidateName);

  if (candidateParts.includes(normalizedAlias)) return true;

  if (
    ["clk", "clock", "sysclk"].includes(normalizedAlias) &&
    candidateParts.some((part) => /^clk\d+$/.test(part))
  ) {
    return true;
  }

  const canonicalAlias = canonicalName(normalizedAlias);
  return candidateParts.some((part) => canonicalName(part) === canonicalAlias);
}

function canonicalName(name: string) {
  if (["clk", "clock", "sysclk"].includes(name)) return "clock";
  if (["rst", "reset", "rstn", "resetn"].includes(name)) return "reset";
  if (["btn", "button"].includes(name)) return "button";
  if (["sw", "switch"].includes(name)) return "switch";
  return name;
}

function getNameParts(name: string) {
  const separated = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return Array.from(
    new Set([
      normalizeName(name),
      ...separated
        .split(/[^a-zA-Z0-9]+/)
        .map(normalizeName)
        .filter(Boolean),
    ]),
  );
}

function getPreferredTypes(
  aliases: string[],
  direction: HdlPort["direction"],
): BoardPin["type"][] {
  if (
    aliases.some((alias) =>
      [
        "rst",
        "reset",
        "rstn",
        "resetn",
        "btn",
        "button",
        "sw",
        "switch",
      ].includes(alias),
    )
  ) {
    return ["button", "gpio"];
  }

  if (
    aliases.some((alias) =>
      ["led", "rgb", "red", "green", "blue", "r", "g", "b"].includes(alias),
    )
  ) {
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
  const ignoredParts = new Set([
    "in",
    "out",
    "input",
    "output",
    "inout",
    "signal",
    "sig",
    "p",
    "n",
    "pos",
    "neg",
  ]);
  const aliases = new Set([normalized]);

  for (const part of getNameParts(rawName)) {
    if (!ignoredParts.has(part) && !/^\d+$/.test(part)) aliases.add(part);
  }

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
  if (normalized.includes("uart") && normalized.endsWith("tx"))
    aliases.add("tx");
  if (normalized.includes("uart") && normalized.endsWith("rx"))
    aliases.add("rx");
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

export function createPinMappingConstraints(
  board: BoardDefinition,
  ports: HdlPort[],
  mappings: Record<string, string>,
) {
  const pinOptions = new Map(getPinOptions(board).map((pin) => [pin.key, pin]));
  const lines = [`# ${board.name} pin mapping saved by Allora`];

  for (const port of ports) {
    const pin = pinOptions.get(mappings[port.name] ?? "");
    if (!pin?.pin) {
      lines.push(`# ${port.name} is unmapped`);
      continue;
    }

    const portRef = port.name.includes("[") ? `{${port.name}}` : port.name;
    if (board.constraintsFile === "xdc") {
      lines.push(
        `set_property PACKAGE_PIN ${pin.pin.split("/")[0]} [get_ports ${portRef}]`,
      );
      lines.push(`set_property IOSTANDARD LVCMOS33 [get_ports ${portRef}]`);
    } else if (board.constraintsFile === "pcf") {
      lines.push(`set_io ${port.name} ${pin.pin}`);
    } else if (board.constraintsFile === "lpf") {
      lines.push(`LOCATE COMP "${port.name}" SITE "${pin.pin}";`);
      lines.push(`IOBUF PORT "${port.name}" IO_TYPE=LVCMOS33;`);
    } else if (board.constraintsFile === "cst") {
      lines.push(`IO_LOC "${port.name}" ${pin.pin};`);
    } else if (board.constraintsFile === "qsf") {
      lines.push(`set_location_assignment PIN_${pin.pin} -to ${port.name}`);
    } else if (board.constraintsFile === "pdc") {
      lines.push(`set_io -port_name {${port.name}} -pin_name ${pin.pin}`);
    } else if (board.constraintsFile === "ccf") {
      lines.push(`Pin_in "${port.name}" Loc = "${pin.pin}"`);
    } else {
      // Efinity .peri files are XML in a full project. Keep a readable,
      // durable mapping until that toolchain's project writer is wired up.
      lines.push(`# ${port.name} -> ${pin.pin}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function readPinMappingsFromConstraints(
  board: BoardDefinition,
  ports: HdlPort[],
  content: string,
) {
  const assignments = new Map<string, string>();
  const unmapped = new Set<string>();
  const portNames = new Set(ports.map((port) => port.name));

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    const unmappedMatch = trimmed.match(/^#\s+(.+?)\s+is unmapped$/);
    if (unmappedMatch && portNames.has(unmappedMatch[1])) {
      unmapped.add(unmappedMatch[1]);
      continue;
    }

    let match: RegExpMatchArray | null;
    if (board.constraintsFile === "xdc") {
      const bracedMatch = trimmed.match(
        /^set_property\s+PACKAGE_PIN\s+(\S+)\s+\[get_ports\s+\{([^}]+)}\]$/i,
      );
      const plainMatch = trimmed.match(
        /^set_property\s+PACKAGE_PIN\s+(\S+)\s+\[get_ports\s+([^\]\s]+)\]$/i,
      );
      match = bracedMatch ?? plainMatch;
    } else if (board.constraintsFile === "pcf") {
      match = trimmed.match(/^set_io\s+(\S+)\s+(\S+)/i);
      if (match) match = [match[0], match[2], match[1]];
    } else if (board.constraintsFile === "lpf") {
      match = trimmed.match(/^LOCATE\s+COMP\s+"([^"]+)"\s+SITE\s+"([^"]+)"/i);
      if (match) match = [match[0], match[2], match[1]];
    } else if (board.constraintsFile === "cst") {
      match = trimmed.match(/^IO_LOC\s+"([^"]+)"\s+(\S+?);?$/i);
      if (match) match = [match[0], match[2], match[1]];
    } else if (board.constraintsFile === "qsf") {
      match = trimmed.match(
        /^set_location_assignment\s+PIN_(\S+)\s+-to\s+(\S+)/i,
      );
    } else if (board.constraintsFile === "pdc") {
      match = trimmed.match(
        /^set_io\s+-port_name\s+\{([^}]+)}\s+-pin_name\s+(\S+)/i,
      );
      if (match) match = [match[0], match[2], match[1]];
    } else if (board.constraintsFile === "ccf") {
      match = trimmed.match(/^Pin_in\s+"([^"]+)"\s+Loc\s*=\s*"([^"]+)"/i);
      if (match) match = [match[0], match[2], match[1]];
    } else {
      match = trimmed.match(/^#\s+(.+?)\s+->\s+(\S+)$/);
      if (match) match = [match[0], match[2], match[1]];
    }

    if (match && portNames.has(match[2])) assignments.set(match[2], match[1]);
  }

  const hasSavedMapping =
    assignments.size > 0 ||
    unmapped.size > 0 ||
    content.includes("pin mapping saved by Allora");
  if (!hasSavedMapping) return null;

  const options = getPinOptions(board);
  const suggestions = createSuggestedMappings(ports, board.pins, board.clocks);
  const mappings: Record<string, string> = {};

  for (const port of ports) {
    const physicalPin = assignments.get(port.name);
    if (!physicalPin) {
      mappings[port.name] = "";
      continue;
    }

    const suggested = suggestions[port.name];
    const suggestedOption = options.find(
      (option) => option.key === suggested && option.pin === physicalPin,
    );
    mappings[port.name] =
      suggestedOption?.key ??
      options.find((option) => option.pin === physicalPin)?.key ??
      "";
  }

  return mappings;
}

export function getPinSymbol(pin: BoardPin) {
  if (pin.type === "clock") return "CLK";
  if (pin.type === "led") return "LED";
  if (pin.type === "button") return pin.activeLow ? "RST" : "BTN";
  if (pin.type === "uart") return "URT";
  if (pin.type === "spi" || pin.type === "flash") return "SPI";
  if (pin.type === "i2c") return "I2C";
  if (
    pin.group?.toLowerCase().includes("usb") ||
    pin.signal?.toLowerCase().includes("usb")
  ) {
    return "USB";
  }
  if (pin.type === "gpio") return "IO";
  return "PIN";
}

export function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
