import { getBoardCapabilities } from "../data/boardCapabilities";
import type { BoardDefinition, BoardPin } from "../data/boards";
import { formatClockFrequency } from "../data/pinResourceGroups";
import { parseImportSources, type OutputDeclaration } from "./portImport";
import {
  createPinMappingConstraints,
  getPinMappingElectricalIssues,
  getPinOptions,
  normalizeName,
  type HdlPort,
} from "../pages/dashboard/pinMappingUtils";
import { invokeTauri } from "./tauri";
import type { RtlPort } from "./virtualFpga";

export type MigrationFile = {
  relativePath: string;
  content: string | null;
  size: number;
  sha256: string;
};
export type MigrationSnapshot = {
  projectPath: string;
  fingerprint: string;
  files: MigrationFile[];
  directories: string[];
  topModule: string;
  ports: RtlPort[];
  portError: string | null;
  excluded: string[];
};
export type MigrationIssue = {
  id: string;
  level: "manual" | "blocked" | "info";
  message: string;
  file?: string;
  port?: string;
  line?: number;
};
export type MigrationMapping = {
  port: HdlPort;
  source: string;
  target: string;
  reason: string;
  invert: boolean;
};
export type MigrationPatch = { relativePath: string; content: string };
export type MigrationReport = {
  schemaVersion: 1;
  createdAt: string;
  sourceBoardId: string;
  sourceBoardName: string;
  targetBoardId: string;
  sourceFingerprint: string;
  requiresReview: boolean;
  issues: MigrationIssue[];
  mappings: MigrationMapping[];
  changes: string[];
  excluded: string[];
  clockPolicy: Record<string, boolean>;
};
export type MigrationPlan = {
  automatic: boolean;
  blocked: boolean;
  issues: MigrationIssue[];
  mappings: MigrationMapping[];
  patches: MigrationPatch[];
  archivePaths: string[];
  topModule: string;
  folderName: string;
  report: MigrationReport;
};
export type MigrationChoices = {
  mappings?: Record<string, string>;
  keepCycles?: Record<string, boolean>;
  clockParameters?: Record<string, string>;
};
export const constraintExtension = /\.(pcf|lpf|xdc|cst|qsf|pdc|ccf|peri)$/i;

export const boardMigrationApi = {
  inspect: (projectPath: string, topModule?: string | null) =>
    invokeTauri<MigrationSnapshot>("inspect_board_migration", {
      request: { projectPath, topModule },
    }),
  createCopy: (
    snapshot: MigrationSnapshot,
    plan: MigrationPlan,
    parentDirectory?: string | null,
  ) =>
    invokeTauri<{ projectPath: string; fileCount: number; excluded: string[] }>(
      "create_board_migration_copy",
      {
        request: {
          projectPath: snapshot.projectPath,
          fingerprint: snapshot.fingerprint,
          folderName: plan.folderName,
          parentDirectory,
          patches: plan.patches,
          archivePaths: plan.archivePaths,
        },
      },
    ),
};

export function migrationEligibility(board: BoardDefinition): string | null {
  if (board.id === "allora-virtual")
    return "Virtual FPGA has no physical source constraints; attaching hardware requires manual mapping.";
  if (board.identityUnresolved)
    return "The populated FPGA identity needs verification.";
  const support = getBoardCapabilities(board);
  if (!support.bitstream.supported || !support.synthesisDiagram.supported)
    return support.bitstream.detail;
  if (!getPinOptions(board).length)
    return "Verified physical pin data is required.";
  return null;
}

function boardPins(board: BoardDefinition) {
  return [
    ...new Map(
      [...board.pins, ...board.leds, ...board.buttons].map((pin) => [
        `${pin.name}:${pin.pin}`,
        pin,
      ]),
    ).values(),
  ];
}

function resourceForKey(
  board: BoardDefinition,
  key: string,
): BoardPin | undefined {
  return boardPins(board).find((pin) => key === `pin:${pin.name}:${pin.pin}`);
}

/** Only location/electrical/clock syntax whose meaning is understood may be automatic. */
export function readMigrationConstraints(
  files: MigrationFile[],
  source: BoardDefinition,
) {
  const assignments = new Map<string, string>();
  const issues: MigrationIssue[] = [];
  const constraints = files.filter(
    (file) =>
      constraintExtension.test(file.relativePath) &&
      !file.relativePath.startsWith(".allora-migration/"),
  );
  if (!constraints.length)
    issues.push({
      id: "constraints-missing",
      level: "manual",
      message:
        "No physical constraints were found. Assign every top-level port on the destination board.",
    });
  for (const file of constraints) {
    if (file.content === null) {
      issues.push({
        id: `unreadable:${file.relativePath}`,
        level: "manual",
        file: file.relativePath,
        message:
          "This constraints file is unreadable or exceeds the analysis size limit.",
      });
      continue;
    }
    for (const [index, raw] of file.content.split(/\r?\n/).entries()) {
      const line = raw.replace(/\s+#.*$/, "").trim();
      if (!line || line.startsWith("#") || line.startsWith("//")) continue;
      let port: string | undefined, pad: string | undefined;
      const pcf = line.match(
        /^set_io\s+([A-Za-z_]\w*(?:\[-?\d+\])?)\s+([\w]+)\s*$/,
      );
      const lpf = line.match(
        /^LOCATE\s+COMP\s+"([^"]+)"\s+SITE\s+"([^"]+)";$/i,
      );
      if (source.constraintsFile === "pcf" && pcf) [, port, pad] = pcf;
      else if (source.constraintsFile === "lpf" && lpf) [, port, pad] = lpf;
      else if (source.constraintsFile === "lpf") {
        const electrical = line.match(
          /^IOBUF\s+PORT\s+"([^"]+)"\s+IO_TYPE=([A-Za-z0-9_]+);$/i,
        );
        const clock = line.match(
          /^FREQUENCY\s+PORT\s+"([^"]+)"\s+([\d.]+)\s+MHZ;$/i,
        );
        if (electrical) {
          // Validate the value after assignments from all lines have been read.
          continue;
        }
        if (clock) {
          continue;
        }
      }
      if (port && pad) {
        if (assignments.has(port))
          issues.push({
            id: `duplicate:${file.relativePath}:${index}`,
            level: "manual",
            port,
            file: file.relativePath,
            line: index + 1,
            message: `Repeated assignment for ${port}; resolve which source assignment is active.`,
          });
        assignments.set(port, pad);
      } else
        issues.push({
          id: `custom:${file.relativePath}:${index}`,
          level: "manual",
          file: file.relativePath,
          line: index + 1,
          message: `Review custom constraint: ${line.slice(0, 240)}`,
        });
    }
  }
  for (const file of constraints.filter((file) => file.content !== null)) {
    for (const [index, line] of file.content!.split(/\r?\n/).entries()) {
      const io = line
        .trim()
        .match(/^IOBUF\s+PORT\s+"([^"]+)"\s+IO_TYPE=([A-Za-z0-9_]+);$/i);
      const clock = line
        .trim()
        .match(/^FREQUENCY\s+PORT\s+"([^"]+)"\s+([\d.]+)\s+MHZ;$/i);
      const pad = assignments.get(io?.[1] ?? clock?.[1] ?? "");
      if (
        io &&
        !boardPins(source).some(
          (pin) =>
            pin.pin === pad &&
            pin.verified &&
            pin.ioStandard?.toUpperCase() === io[2].toUpperCase(),
        ) &&
        !source.clocks.some(
          (item) =>
            item.pin === pad &&
            item.verified &&
            item.ioStandard?.toUpperCase() === io[2].toUpperCase(),
        )
      ) {
        issues.push({
          id: `io:${file.relativePath}:${index}`,
          level: "manual",
          file: file.relativePath,
          line: index + 1,
          message: `The source electrical setting for ${io[1]} differs from verified catalog data.`,
        });
      }
      if (
        clock &&
        !source.clocks.some(
          (item) =>
            item.pin === pad &&
            item.verified &&
            Math.abs(item.frequency - Number(clock[2]) * 1e6) < 1,
        )
      ) {
        issues.push({
          id: `timing:${file.relativePath}:${index}`,
          level: "manual",
          file: file.relativePath,
          line: index + 1,
          message: `The source timing requirement for ${clock[1]} differs from its documented oscillator. Review PLL/divider intent.`,
        });
      }
    }
  }
  return {
    assignments,
    issues,
    paths: constraints.map((file) => file.relativePath),
  };
}

function expandInterface(declarations: OutputDeclaration[]): HdlPort[] {
  return declarations.flatMap((port) =>
    port.indices
      ? port.indices.map((index) => ({
          name: `${port.name}[${index}]`,
          direction: port.direction!,
          baseName: port.name,
          index,
        }))
      : [{ name: port.name, direction: port.direction! }],
  );
}

function interfaceForSnapshot(snapshot: MigrationSnapshot) {
  const sources = snapshot.files.filter(
    (file) =>
      /\.(v|sv|vhd|vhdl)$/i.test(file.relativePath) &&
      !file.relativePath.startsWith(".allora-migration/") &&
      file.content !== null,
  );
  const units = parseImportSources(
    sources.map((file) => ({
      name: file.relativePath,
      content: file.content!,
    })),
    true,
  );
  const tops = units.filter((unit) => unit.name === snapshot.topModule);
  if (tops.length !== 1 || tops[0].error)
    throw new Error(
      tops[0]?.error ?? "Select one unambiguous top module before migrating.",
    );
  const declarations = tops[0].outputs;
  if (!snapshot.portError) {
    if (snapshot.ports.length !== declarations.length)
      throw new Error(
        "Declared ports differ from the elaborated interface. Manual review is required.",
      );
    for (const port of declarations) {
      const actual = snapshot.ports.find((item) => item.name === port.name);
      const offset = port.indices ? Math.min(...port.indices) : 0;
      if (
        !actual ||
        actual.width !== port.width ||
        actual.direction !== port.direction ||
        (actual.offset ?? 0) !== offset ||
        (port.width > 1 &&
          Boolean(actual.upto) !== port.indices![0] < port.indices!.at(-1)!)
      )
        throw new Error(
          `Elaboration and declaration parsing disagree for ${port.name}.`,
        );
    }
  }
  return {
    ports: expandInterface(declarations),
    declarations,
    file: tops[0].file,
  };
}

function proposeTarget(
  source: BoardPin,
  destination: BoardDefinition,
  direction: HdlPort["direction"],
): string | undefined {
  if (
    (source.type === "led" && direction !== "output") ||
    (source.type === "button" && direction !== "input")
  )
    return;
  if (!["led", "button"].includes(source.type)) return;
  const options = getPinOptions(destination);
  const candidates = boardPins(destination).filter(
    (pin) =>
      pin.type === source.type &&
      options.some((option) => option.key === `pin:${pin.name}:${pin.pin}`),
  );
  const sourceTerms = [source.name, source.signal]
    .filter(Boolean)
    .map((value) => normalizeName(value!));
  const exact = candidates.filter((pin) =>
    [pin.name, pin.signal]
      .filter(Boolean)
      .some((value) => sourceTerms.includes(normalizeName(value!))),
  );
  const uniquePads = (pins: BoardPin[]) => [
    ...new Map(pins.map((pin) => [pin.pin, pin])).values(),
  ];
  const matches = uniquePads(exact);
  if (matches.length === 1) return `pin:${matches[0].name}:${matches[0].pin}`;
  // A single generic indicator/button has a clear role; colored LEDs and reset buttons need exact roles.
  const roles = /red|green|blue|reset|rst/i;
  if (!roles.test(`${source.name} ${source.signal ?? ""}`)) {
    const generic = uniquePads(
      candidates.filter(
        (pin) => !roles.test(`${pin.name} ${pin.signal ?? ""}`),
      ),
    );
    if (generic.length === 1) return `pin:${generic[0].name}:${generic[0].pin}`;
  }
}

function createPolarityWrapper(
  top: string,
  wrapper: string,
  declarations: OutputDeclaration[],
  inverted: Set<string>,
) {
  const range = (port: OutputDeclaration) =>
    port.indices ? `[${port.indices[0]}:${port.indices.at(-1)}] ` : "";
  const wireName = (port: OutputDeclaration) => `allora_core_${port.name}`;
  const adapted = declarations.filter((port) =>
    [...inverted].some(
      (name) => name === port.name || name.startsWith(`${port.name}[`),
    ),
  );
  const lines = [
    "// Board Migration Assistant: verified physical polarity adapter.",
    `module ${wrapper}(`,
    declarations
      .map((port) => `  ${port.direction} wire ${range(port)}${port.name}`)
      .join(",\n"),
    ");",
    "",
  ];
  for (const port of adapted) {
    lines.push(`  wire ${range(port)}${wireName(port)};`);
    const bits = port.indices
      ? port.indices.map((index) => ({
          external: `${port.name}[${index}]`,
          internal: `${wireName(port)}[${index}]`,
        }))
      : [{ external: port.name, internal: wireName(port) }];
    for (const bit of bits) {
      const [left, right] =
        port.direction === "input"
          ? [bit.internal, bit.external]
          : [bit.external, bit.internal];
      lines.push(
        `  assign ${left} = ${inverted.has(bit.external) ? "~" : ""}${right};`,
      );
    }
  }
  lines.push(
    "",
    `  ${top} core (`,
    declarations
      .map(
        (port) =>
          `    .${port.name}(${adapted.includes(port) ? wireName(port) : port.name})`,
      )
      .join(",\n"),
    "  );",
    "endmodule",
    "",
  );
  return lines.join("\n");
}

/** Named, literal clock-frequency parameters are offered only with explicit user selection. */
export function clockParameterOptions(snapshot: MigrationSnapshot) {
  const options: Array<{
    key: string;
    file: string;
    name: string;
    value: number;
    start: number;
    end: number;
  }> = [];
  for (const file of snapshot.files.filter(
    (item) =>
      /\.(v|sv)$/i.test(item.relativePath) &&
      item.content !== null &&
      !item.relativePath.startsWith("sim/") &&
      !item.relativePath.startsWith(".allora-migration/"),
  )) {
    const content = file.content!;
    const masked = content.replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"/g,
      (token) => " ".repeat(token.length),
    );
    // Each declaration must name its own parameter; grouped/unresolved expressions stay manual.
    const pattern =
      /\b(?:parameter|localparam)\s+(?:(?:integer|int|unsigned|signed|longint)\s+)*((?:CLK|CLOCK)(?:_FREQ)?_HZ)\s*=\s*([\d][\d_]*)\s*(?=[,;)])/g;
    for (const match of masked.matchAll(pattern)) {
      const numberStart = match.index! + match[0].lastIndexOf(match[2]);
      options.push({
        key: `${file.relativePath}:${match[1]}`,
        file: file.relativePath,
        name: match[1],
        value: Number(match[2].replaceAll("_", "")),
        start: numberStart,
        end: numberStart + match[2].length,
      });
    }
  }
  // Duplicate parameter names in one file need scoped HDL editing.
  return options.filter(
    (option) =>
      options.filter((other) => other.key === option.key).length === 1,
  );
}

export function planBoardMigration(
  snapshot: MigrationSnapshot,
  source: BoardDefinition,
  target: BoardDefinition,
  choices: MigrationChoices = {},
  now = new Date().toISOString(),
): MigrationPlan {
  const issues: MigrationIssue[] = [];
  const add = (
    id: string,
    level: MigrationIssue["level"],
    message: string,
    detail: Partial<MigrationIssue> = {},
  ) => issues.push({ id, level, message, ...detail });
  const metadataFile = snapshot.files.find(
    (file) => file.relativePath === "allora-project.json",
  );
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(metadataFile?.content ?? "");
    if (!metadata || Array.isArray(metadata) || typeof metadata !== "object")
      throw new Error();
  } catch {
    add("metadata", "blocked", "Repair the project metadata before migration.");
  }
  if (metadata.boardId !== source.id)
    add(
      "source-board",
      "blocked",
      "The project board changed. Reopen the project and analyze it again.",
    );
  if (hasPendingMigrationReview(metadataFile?.content ?? undefined))
    add(
      "source-review",
      "manual",
      "This source project has an unfinished migration review. Resolve it before claiming a seamless migration.",
    );
  if (target.id === source.id)
    add("same-board", "blocked", "Choose a different destination board.");
  const targetReason = migrationEligibility(target);
  if (targetReason) add("destination", "blocked", targetReason);
  const sourceReason = migrationEligibility(source);
  if (sourceReason)
    add(
      "source-support",
      "manual",
      `Source board requires manual review: ${sourceReason}`,
    );
  if (snapshot.portError) add("elaboration", "manual", snapshot.portError);
  let ports: HdlPort[];
  let declarations: OutputDeclaration[] = [];
  try {
    ({ ports, declarations } = interfaceForSnapshot(snapshot));
  } catch (failure) {
    add(
      "interface",
      "manual",
      failure instanceof Error ? failure.message : String(failure),
    );
    ports = snapshot.ports
      .filter((port) => ["input", "output", "inout"].includes(port.direction))
      .flatMap((port) =>
        Array.from({ length: port.width }, (_, bit) => ({
          name:
            port.width > 1 || port.offset
              ? `${port.name}[${(port.offset ?? 0) + bit}]`
              : port.name,
          direction: port.direction as HdlPort["direction"],
          ...(port.width > 1 || port.offset
            ? { baseName: port.name, index: (port.offset ?? 0) + bit }
            : {}),
        })),
      );
  }
  if (!ports.length)
    add(
      "no-ports",
      "manual",
      "The physical top-level interface could not be verified. Complete the destination constraints manually.",
    );
  const parsed = readMigrationConstraints(snapshot.files, source);
  issues.push(...parsed.issues);
  for (const name of parsed.assignments.keys())
    if (!ports.some((port) => port.name === name))
      add(
        `unknown-port:${name}`,
        "manual",
        `Source constraints refer to ${name}, which is absent from the resolved top-level interface.`,
        { port: name },
      );
  const primitives =
    /\b(?:SB_[A-Za-z0-9_]+|EHXPLLL|DP16KD|TRELLIS_[A-Za-z0-9_]+|OSCG|DCCA|ODDRX[\w]*|IDDRX[\w]*|PLLE[\w]*|MMCME[\w]*|RAMB[\w]*|IBUFDS|OBUFDS|BUFG[\w]*|ALTPLL|altsyncram|CC_[A-Za-z0-9_]+)\b/g;
  for (const file of snapshot.files.filter(
    (file) =>
      /\.(sv|v|vhd|vhdl)$/i.test(file.relativePath) &&
      !file.relativePath.startsWith("sim/") &&
      !file.relativePath.startsWith(".allora-migration/"),
  )) {
    if (file.content === null) {
      add(
        `source-unreadable:${file.relativePath}`,
        "manual",
        "This HDL file could not be analyzed.",
        { file: file.relativePath },
      );
      continue;
    }
    const text = file.content.replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*|--[^\n]*|"(?:\\.|[^"\\])*"/g,
      " ",
    );
    const found = [
      ...new Set([...text.matchAll(primitives)].map((match) => match[0])),
    ];
    if (found.length)
      add(
        `primitive:${file.relativePath}`,
        "manual",
        `Device-specific primitives need review: ${found.join(", ")}.`,
        { file: file.relativePath },
      );
  }
  const sourceOptions = getPinOptions(source),
    targetOptions = getPinOptions(target);
  const parameterEdits = new Map<
    string,
    { file: string; start: number; end: number; value: number }
  >();
  const used = new Set<string>(),
    sourcePads = new Set<string>(),
    inverted = new Set<string>();
  const mappings: MigrationMapping[] = [];
  let clockCount = 0;
  for (const port of ports) {
    const pad = parsed.assignments.get(port.name);
    const original = sourceOptions.find((option) => option.pin === pad);
    const sourcePin = original
      ? resourceForKey(source, original.key)
      : undefined;
    const sourceClock = source.clocks.find(
      (clock) =>
        clock.pin === pad && clock.verified && clock.role !== "reference",
    );
    if (!original)
      add(
        `source:${port.name}`,
        "manual",
        `${port.name} has no assignment to a verified source-board resource.`,
        { port: port.name },
      );
    if (pad && sourcePads.has(pad))
      add(
        `source-conflict:${port.name}`,
        "manual",
        `${port.name} shares source pad ${pad} with another port.`,
        { port: port.name },
      );
    if (pad) sourcePads.add(pad);
    let proposed: string | undefined;
    if (sourceClock) {
      const clocks = target.clocks.filter(
        (clock) =>
          clock.verified &&
          clock.pin &&
          !clock.differentialPin &&
          clock.role !== "reference" &&
          targetOptions.some((option) => option.key === `clock:${clock.name}`),
      );
      const same = clocks.filter(
        (clock) => clock.frequency === sourceClock.frequency,
      );
      const candidates = same.length === 1 ? same : clocks;
      if (candidates.length === 1) proposed = `clock:${candidates[0].name}`;
    } else if (sourcePin)
      proposed = proposeTarget(sourcePin, target, port.direction);
    const key = Object.hasOwn(choices.mappings ?? {}, port.name)
      ? choices.mappings![port.name]
      : (proposed ?? "");
    const option = targetOptions.find((item) => item.key === key);
    const selectedPin = option ? resourceForKey(target, option.key) : undefined;
    const selectedClock = target.clocks.find(
      (clock) => option?.key === `clock:${clock.name}`,
    );
    let reason = Object.hasOwn(choices.mappings ?? {}, port.name)
      ? "Selected by you"
      : proposed
        ? "Unique verified resource match"
        : "Select a destination resource";
    if (!option)
      add(
        `target:${port.name}`,
        "manual",
        `No unambiguous destination assignment for ${port.name}.`,
        { port: port.name },
      );
    else {
      if (used.has(option.pin))
        add(
          `conflict:${port.name}`,
          "manual",
          `${port.name} shares destination pad ${option.pin} with another port.`,
          { port: port.name },
        );
      used.add(option.pin);
      if (
        (option.type === "led" && port.direction !== "output") ||
        (["button", "clock"].includes(option.type) &&
          port.direction !== "input")
      )
        add(
          `direction:${port.name}`,
          "manual",
          `${port.name} has the wrong direction for ${option.shortLabel}.`,
          { port: port.name },
        );
      if (sourceClock) {
        clockCount++;
        if (
          !selectedClock ||
          !selectedClock.verified ||
          !Number.isFinite(selectedClock.frequency) ||
          selectedClock.frequency <= 0 ||
          sourceClock.differentialPin ||
          selectedClock.differentialPin
        )
          add(
            `clock:${port.name}`,
            "manual",
            `${port.name} requires a verified single-ended destination clock.`,
            { port: port.name },
          );
        else if (selectedClock.frequency !== sourceClock.frequency) {
          const detail = `${port.name}: ${formatClockFrequency(sourceClock.frequency)} → ${formatClockFrequency(selectedClock.frequency)}. Cycle counts stay unchanged; real-time behavior changes.`;
          const selectedParameter = clockParameterOptions(snapshot).find(
            (option) =>
              option.key === choices.clockParameters?.[port.name] &&
              option.value === sourceClock.frequency,
          );
          if (selectedParameter) {
            parameterEdits.set(selectedParameter.key, {
              ...selectedParameter,
              value: selectedClock.frequency,
            });
            add(
              `clock-rate:${port.name}`,
              "info",
              `${port.name}: you chose to update ${selectedParameter.name} from ${sourceClock.frequency} to ${selectedClock.frequency} Hz. Verify its time-based behavior with the testbench.`,
              { port: port.name, file: selectedParameter.file },
            );
          } else
            add(
              `clock-rate:${port.name}`,
              choices.keepCycles?.[port.name] ? "info" : "manual",
              choices.keepCycles?.[port.name]
                ? `${detail} You accepted preserving cycle-based behavior.`
                : `${detail} Choose whether to preserve cycles or review an explicit time-based parameter.`,
              { port: port.name },
            );
        }
        if (selectedClock)
          reason += ` · ${formatClockFrequency(selectedClock.frequency)}`;
      } else if (selectedClock)
        add(
          `clock-role:${port.name}`,
          "manual",
          `${port.name} was not connected to a verified source clock. Review its clock role.`,
          { port: port.name },
        );
      if (sourcePin && ["led", "button"].includes(sourcePin.type)) {
        if (
          !selectedPin ||
          selectedPin.type !== sourcePin.type ||
          sourcePin.activeLow === undefined ||
          selectedPin.activeLow === undefined
        )
          add(
            `polarity:${port.name}`,
            "manual",
            `${port.name} has unresolved resource function or physical polarity.`,
            { port: port.name },
          );
        else if (sourcePin.activeLow !== selectedPin.activeLow) {
          if (
            declarations.length &&
            port.direction !== "inout" &&
            !snapshot.portError &&
            !snapshot.files.some((file) => /\.vhdl?$/i.test(file.relativePath))
          ) {
            inverted.add(port.name);
            reason += " · polarity adapter";
          } else
            add(
              `polarity:${port.name}`,
              "manual",
              `${port.name} needs a manually reviewed polarity adapter.`,
              { port: port.name },
            );
        }
      }
      if (port.direction === "inout")
        add(
          `inout:${port.name}`,
          "manual",
          `${port.name} is bidirectional; review tri-state behavior, pull-ups and electrical requirements.`,
          { port: port.name },
        );
    }
    mappings.push({
      port,
      source: original?.label ?? (pad ? `Unverified pad ${pad}` : "Unmapped"),
      target: option?.key ?? "",
      reason,
      invert: inverted.has(port.name),
    });
  }
  if (clockCount > 1)
    add(
      "multi-clock",
      "manual",
      "Multiple clock domains need manual timing and clock-domain-crossing review.",
    );
  const targetMappings = Object.fromEntries(
    mappings.map((row) => [row.port.name, row.target]),
  );
  for (const [index, issue] of getPinMappingElectricalIssues(
    target,
    ports,
    targetMappings,
  ).entries())
    add(`electrical:${index}`, "manual", issue);
  let topModule = snapshot.topModule;
  const patches: MigrationPatch[] = [];
  for (const file of [
    ...new Set([...parameterEdits.values()].map((edit) => edit.file)),
  ]) {
    let content = snapshot.files.find(
      (item) => item.relativePath === file,
    )!.content!;
    for (const edit of [...parameterEdits.values()]
      .filter((item) => item.file === file)
      .sort((a, b) => b.start - a.start))
      content = `${content.slice(0, edit.start)}${edit.value}${content.slice(edit.end)}`;
    try {
      // A frequency change must preserve the physical top interface.
      interfaceForSnapshot({
        ...snapshot,
        files: snapshot.files.map((item) =>
          item.relativePath === file ? { ...item, content } : item,
        ),
      });
      patches.push({ relativePath: file, content });
    } catch {
      add(
        `parameter-interface:${file}`,
        "manual",
        "This clock parameter affects the top-level interface or uses unsupported syntax. Adjust it manually and re-analyze.",
        { file },
      );
    }
  }
  if (inverted.size && declarations.length) {
    let wrapper = "allora_migrated_top",
      suffix = 1;
    while (
      snapshot.files.some(
        (file) =>
          file.relativePath === `src/${wrapper}.sv` ||
          file.content?.match(new RegExp(`\\bmodule\\s+${wrapper}\\b`)),
      )
    )
      wrapper = `allora_migrated_top_${suffix++}`;
    patches.push({
      relativePath: `src/${wrapper}.sv`,
      content: createPolarityWrapper(
        snapshot.topModule,
        wrapper,
        declarations,
        inverted,
      ),
    });
    topModule = wrapper;
  }
  let constraints = createPinMappingConstraints(target, ports, targetMappings);
  if (target.constraintsFile === "lpf")
    for (const row of mappings) {
      const clock = target.clocks.find(
        (item) => row.target === `clock:${item.name}`,
      );
      if (clock?.frequency)
        constraints += `FREQUENCY PORT "${row.port.name}" ${clock.frequency / 1e6} MHZ;\n`;
    }
  patches.push({
    relativePath: `constraints/constraints.${target.constraintsFile}`,
    content: constraints,
  });
  const requiresReview = issues.some((issue) => issue.level !== "info");
  const report: MigrationReport = {
    schemaVersion: 1,
    createdAt: now,
    sourceBoardId: source.id,
    sourceBoardName: source.name,
    targetBoardId: target.id,
    sourceFingerprint: snapshot.fingerprint,
    requiresReview,
    issues,
    mappings,
    changes: [
      ...patches.map((patch) => patch.relativePath),
      "allora-project.json",
    ],
    excluded: snapshot.excluded,
    clockPolicy: choices.keepCycles ?? {},
  };
  const nextMetadata = {
    ...metadata,
    name: `${String(metadata.name ?? "Project")} — ${target.name}`,
    boardId: target.id,
    boardName: target.name,
    projectKind: "hardware",
    git: false,
    topModule,
    sourceFile:
      topModule !== snapshot.topModule
        ? `${topModule}.sv`
        : metadata.sourceFile,
    boardMigration: report,
  };
  delete (nextMetadata as Record<string, unknown>).aiPinAssignments;
  patches.push({
    relativePath: "allora-project.json",
    content: `${JSON.stringify(nextMetadata, null, 2)}\n`,
  });
  return {
    automatic: !requiresReview,
    blocked: issues.some((issue) => issue.level === "blocked"),
    issues,
    mappings,
    patches,
    archivePaths: parsed.paths,
    topModule,
    folderName:
      `${String(metadata.name ?? "Project")}-${target.id}`
        .replace(/[^\p{L}\p{N}_ -]/gu, "_")
        .replace(/^\.+/, "")
        .slice(0, 110) || "migrated-project",
    report,
  };
}

export function readMigrationReport(
  content: string | undefined,
): MigrationReport | null {
  try {
    const metadata = JSON.parse(content ?? "");
    const report = metadata.boardMigration;
    const strings = (value: unknown): value is string[] =>
      Array.isArray(value) && value.every((item) => typeof item === "string");
    return report?.schemaVersion === 1 &&
      typeof report.requiresReview === "boolean" &&
      typeof report.sourceBoardName === "string" &&
      typeof report.sourceBoardId === "string" &&
      typeof report.targetBoardId === "string" &&
      report.targetBoardId === metadata.boardId &&
      typeof report.sourceFingerprint === "string" &&
      /^[a-f0-9]{64}$/.test(report.sourceFingerprint) &&
      Array.isArray(report.issues) &&
      report.issues.every(
        (item: MigrationIssue) =>
          item &&
          typeof item.id === "string" &&
          typeof item.message === "string" &&
          ["blocked", "manual", "info"].includes(item.level),
      ) &&
      Array.isArray(report.mappings) &&
      report.mappings.every(
        (row: MigrationMapping) =>
          row?.port &&
          typeof row.port.name === "string" &&
          typeof row.source === "string" &&
          typeof row.target === "string",
      ) &&
      strings(report.changes) &&
      strings(report.excluded)
      ? report
      : null;
  } catch {
    return null;
  }
}

export function hasPendingMigrationReview(
  content: string | undefined,
): boolean {
  try {
    const raw = JSON.parse(content ?? "").boardMigration;
    return (
      raw != null && (readMigrationReport(content)?.requiresReview ?? true)
    );
  } catch {
    return false;
  }
}

/** Manual completion still requires every elaborated port to have a valid physical assignment. */
export function migrationPinProblems(
  snapshot: MigrationSnapshot,
  board: BoardDefinition,
): string[] {
  if (snapshot.portError) return [snapshot.portError];
  let ports: HdlPort[];
  const parsed = readMigrationConstraints(snapshot.files, board);
  try {
    ports = interfaceForSnapshot(snapshot).ports;
  } catch {
    ports = snapshot.ports.flatMap((port) =>
      Array.from({ length: port.width }, (_, bit) => ({
        name:
          port.width > 1 || port.offset
            ? `${port.name}[${(port.offset ?? 0) + bit}]`
            : parsed.assignments.has(port.name)
              ? port.name
              : `${port.name}[0]`,
        direction: port.direction as HdlPort["direction"],
      })),
    );
  }
  const errors: string[] = [];
  if (!ports.length)
    errors.push("No physical top-level ports were elaborated.");
  const options = getPinOptions(board),
    used = new Set<string>();
  const mappings: Record<string, string> = {};
  for (const port of ports) {
    const pad = parsed.assignments.get(port.name);
    const option = options.find((item) => item.pin === pad);
    if (!option)
      errors.push(
        `${port.name} needs an assignment to a verified destination pad.`,
      );
    else {
      mappings[port.name] = option.key;
      if (used.has(option.pin))
        errors.push(
          `Destination pad ${option.pin} has conflicting assignments.`,
        );
      used.add(option.pin);
    }
  }
  for (const name of parsed.assignments.keys())
    if (!ports.some((port) => port.name === name))
      errors.push(`Constraints refer to unknown port ${name}.`);
  errors.push(
    ...parsed.issues
      .filter(
        (issue) =>
          issue.id.startsWith("duplicate:") ||
          issue.id.startsWith("unreadable:"),
      )
      .map((issue) => issue.message),
  );
  errors.push(...getPinMappingElectricalIssues(board, ports, mappings));
  return errors;
}
