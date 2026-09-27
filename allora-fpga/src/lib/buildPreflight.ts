import type { BoardDefinition } from "../data/boards";
import { getBoardCapabilities } from "../data/boardCapabilities";
import { findTopModule, isHdlFile } from "../hooks/utils";
import type { ProjectFile } from "../pages/dashboard/types";
import {
  createSuggestedMappings,
  findPorts,
  getPinOptions,
  readPinMappingsFromConstraints,
} from "../pages/dashboard/pinMappingUtils";

export type PreflightCheck = {
  id: string;
  label: string;
  detail: string;
  state: "ready" | "warning" | "blocked";
  destination?: "editor" | "pin-mapping";
};

export function getBuildPreflight({
  board,
  files,
  topLevelFileName,
  dirtyFileNames = [],
  nativeAvailable,
  yosysAvailable,
}: {
  board: BoardDefinition;
  files: ProjectFile[];
  topLevelFileName: string | null;
  dirtyFileNames?: string[];
  nativeAvailable: boolean;
  yosysAvailable: boolean | null;
}): PreflightCheck[] {
  const capabilities = getBoardCapabilities(board);
  const hdlFiles = files.filter(
    (file) => isHdlFile(file.name) && !file.isBinary,
  );
  const topFile = hdlFiles.find((file) => file.name === topLevelFileName);
  const topModule = topFile ? findTopModule([topFile]) : null;
  const ports = topFile ? findPorts([topFile]) : [];
  const constraints = files.find((file) =>
    file.name.toLowerCase().endsWith(`.${board.constraintsFile.toLowerCase()}`),
  );
  const savedMappings = constraints
    ? readPinMappingsFromConstraints(board, ports, constraints.content)
    : null;
  const mappings =
    savedMappings ??
    (constraints
      ? null
      : createSuggestedMappings(ports, board.pins, board.clocks));
  const pinOptions = new Map(
    getPinOptions(board).map((option) => [option.key, option.pin]),
  );
  const assignedPins = mappings
    ? ports
        .map((port) => pinOptions.get(mappings[port.name] ?? ""))
        .filter((pin): pin is string => Boolean(pin))
    : [];
  const unmappedCount = mappings ? ports.length - assignedPins.length : 0;
  const duplicatePins = assignedPins.length - new Set(assignedPins).size;

  return [
    {
      id: "board",
      label: "Board build support",
      detail: capabilities.bitstream.detail,
      state: capabilities.bitstream.supported ? "ready" : "blocked",
    },
    {
      id: "sources",
      label: "HDL sources",
      detail: hdlFiles.length
        ? `${hdlFiles.length} source file${hdlFiles.length === 1 ? "" : "s"} in the project`
        : "Add or import an HDL source file.",
      state: hdlFiles.length ? "ready" : "blocked",
      destination: "editor",
    },
    {
      id: "top",
      label: "Top module",
      detail: topModule
        ? `${topModule} in ${topFile?.name}`
        : "Select an HDL file containing a module or entity declaration.",
      state: topModule ? "ready" : "blocked",
      destination: "editor",
    },
    {
      id: "pins",
      label: "Ports and constraints",
      detail:
        !ports.length && !constraints
          ? "No top-level ports or constraints were found."
          : duplicatePins
            ? `${duplicatePins} physical pin conflict${duplicatePins === 1 ? "" : "s"} found. Review pin mapping.`
            : unmappedCount
              ? `${unmappedCount} top-level port${unmappedCount === 1 ? " is" : "s are"} unmapped. Review pin mapping.`
              : mappings
                ? `${ports.length} ports mapped ${savedMappings ? "in saved constraints" : "by board suggestions"}; review before building.`
                : `${constraints?.name ?? "Constraints"} uses custom assignments; review them before building.`,
      state:
        (!ports.length && !constraints) || duplicatePins || unmappedCount
          ? "blocked"
          : "warning",
      destination: "pin-mapping",
    },
    {
      id: "tools",
      label: "Local toolchain",
      detail: !nativeAvailable
        ? "Open the desktop app to check and run the FPGA tools."
        : yosysAvailable === false
          ? "Yosys was not found. Install the local FPGA toolchain."
          : yosysAvailable === null
            ? "Checking Yosys; nextpnr and the packer are checked when the build runs."
            : "Yosys found; nextpnr and the packer are checked when the build runs.",
      state:
        !nativeAvailable || yosysAvailable === false ? "blocked" : "warning",
    },
    ...(dirtyFileNames.length
      ? [
          {
            id: "save",
            label: "Unsaved changes",
            detail: `${dirtyFileNames.length} file${dirtyFileNames.length === 1 ? " has" : "s have"} unsaved changes. The build uses the current editor contents.`,
            state: "warning" as const,
            destination: "editor" as const,
          },
        ]
      : []),
  ];
}
