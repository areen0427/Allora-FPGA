import type { BoardDefinition } from "../../data/boards";
import { getPinOptions } from "../dashboard/pinMappingUtils";
import type { HdlPort } from "../dashboard/pinMappingUtils";
import { createPinMappingConstraints } from "../dashboard/pinMappingUtils";

export type WelcomeConstraintDownload = {
  filename: string;
  extension: string;
  formatLabel: string;
  content: string;
  note?: string;
};

/**
 * Use the board's native constraint writer where available. Efinity's .peri
 * file is project-owned XML, so assignments are exported as the supported
 * Interface Scripting File that Efinity can import through Interface Designer.
 */
export function createWelcomeConstraintDownload(
  board: BoardDefinition,
  ports: HdlPort[],
  mappings: Record<string, string>,
): WelcomeConstraintDownload {
  const usesEfinityInterfaceScript = board.constraintsFile === "peri";
  const extension = usesEfinityInterfaceScript ? "isf" : board.constraintsFile;
  const content = usesEfinityInterfaceScript
    ? createEfinityInterfaceScript(board, ports, mappings)
    : createPinMappingConstraints(board, ports, mappings);
  const boardSlug = board.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    filename: `${boardSlug || "board"}-constraints.${extension}`,
    extension,
    formatLabel: usesEfinityInterfaceScript
      ? "Efinity Interface Script (.isf)"
      : `.${extension.toUpperCase()} constraints`,
    content,
    note: usesEfinityInterfaceScript
      ? "Import this .isf through Efinity Interface Designer. Efinity creates the project .peri.xml file from the imported assignments."
      : undefined,
  };
}

function createEfinityInterfaceScript(
  board: BoardDefinition,
  ports: HdlPort[],
  mappings: Record<string, string>,
) {
  const pinOptions = new Map(getPinOptions(board).map((pin) => [pin.key, pin]));
  const declarations = new Map<string, HdlPort[]>();

  for (const port of ports) {
    const baseName = port.baseName ?? port.name;
    const declaration = declarations.get(baseName) ?? [];
    declaration.push(port);
    declarations.set(baseName, declaration);
  }

  const lines = [
    "# Efinity Interface Configuration",
    `# Device: ${board.device.replace(/[\r\n]/g, " ")}`,
    `# Package: ${board.package.replace(/[\r\n]/g, " ")}`,
    "# Project: allora_pin_mapping",
    "# Create instance",
  ];

  for (const [name, declaration] of declarations) {
    const indexes = declaration
      .map((port) => port.index)
      .filter((index): index is number => index !== undefined);
    if (indexes.length) {
      const msb = Math.max(...indexes);
      const lsb = Math.min(...indexes);
      lines.push(`design.create_output_gpio(${quote(name)},${msb},${lsb})`);
    } else {
      lines.push(`design.create_output_gpio(${quote(name)})`);
    }
  }

  lines.push("# Set resource assignment");
  for (const port of ports) {
    const pin = pinOptions.get(mappings[port.name] ?? "");
    if (pin?.pin) {
      lines.push(`design.assign_pkg_pin(${quote(port.name)},${quote(pin.pin)})`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
