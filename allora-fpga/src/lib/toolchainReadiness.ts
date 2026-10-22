import type { BoardDefinition } from "../data/boards";

export type ToolRequirement = {
  command: string;
  label: string;
  purpose: string;
  installHint: string;
  downloadUrl: string;
};

export type DetectedTool = {
  command: string;
  available: boolean;
  path: string | null;
};

const OSS_CAD_URL = "https://github.com/YosysHQ/oss-cad-suite-build";
const VIVADO_URL =
  "https://www.amd.com/en/products/software/adaptive-socs-and-fpgas/vivado.html";
const vendorUrls: Record<string, string> = {
  gowin: "https://www.gowinsemi.com/en/support/download_eda/",
  quartus: "https://www.altera.com/downloads",
  efinity: "https://www.efinixinc.com/support/efinity.php",
  radiant: "https://www.latticesemi.com/latticeradiant",
  microchip:
    "https://www.microchip.com/en-us/products/fpgas-and-plds/fpga-and-soc-design-tools/libero-soc-design-suite",
  gatemate: "https://github.com/YosysHQ/oss-cad-suite-build",
  quicklogic: "https://github.com/QuickLogic-Corp/quicklogic-fpga-toolchain",
};
const programmerUrls: Record<string, string> = {
  iceprog: "https://github.com/YosysHQ/icestorm",
  ecpprog: "https://github.com/gregdavill/ecpprog",
  openFPGALoader: "https://github.com/trabucayre/openFPGALoader",
  fujprog: "https://github.com/kost/fujprog",
  ujprog: "https://github.com/f32c/tools/tree/master/ujprog",
  ecpdap: "https://github.com/adamgreig/ecpdap",
  icesprog: "https://github.com/wuxx/icesugar",
  "dfu-util": "https://dfu-util.sourceforge.net/",
  openocd: "https://openocd.org/",
  tinyprog: "https://github.com/tinyfpga/TinyFPGA-Bootloader",
  tinyfpgab: "https://github.com/tinyfpga/TinyFPGA-Programmer-Application",
  vivado: VIVADO_URL,
  quartus_pgm: vendorUrls.quartus,
};

// Catalog suite labels are not always executable names. Probe actual command
// names, and never pass alternatives, arguments, or paths to native detection.
const suiteCommands: Record<string, string> = {
  gowin: "gw_sh",
  quartus: "quartus_sh",
  efinity: "efx_run",
  radiant: "radiantc",
  microchip: "libero",
};

const knownCommands = new Set([
  "yosys",
  "nextpnr-ice40",
  "nextpnr-ecp5",
  "icepack",
  "ecppack",
  "vivado",
  "quartus_sh",
  "quartus_pgm",
  "gw_sh",
  "gowin_sh",
  "efx_run",
  "radiantc",
  "libero",
  "diamondc",
  "pnr_gowin",
  "ldprog",
  ...Object.keys(programmerUrls),
]);

export function getBoardToolRequirements(
  board: BoardDefinition,
): ToolRequirement[] {
  if (board.id === "allora-virtual" || board.family.toLowerCase() === "virtual")
    return [];
  const requirements = new Map<string, ToolRequirement>();
  const add = (
    command: string | undefined,
    purpose: string,
    downloadUrl: string,
    openSource = false,
  ) => {
    if (
      !command ||
      !knownCommands.has(command) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.+-]*$/.test(command)
    )
      return;
    const existing = requirements.get(command);
    if (existing) {
      if (!existing.purpose.includes(purpose))
        existing.purpose += ` / ${purpose}`;
      return;
    }
    requirements.set(command, {
      command,
      label:
        command === "yosys"
          ? "Yosys"
          : command === "vivado"
            ? "Vivado"
            : command,
      purpose,
      downloadUrl,
      installHint: openSource
        ? `Download OSS CAD Suite for your operating system, extract it and add its bin directory to PATH, restart Allora if PATH changed, then rescan for ${command}.`
        : `Install ${command} using the official instructions, add its executable directory to PATH, restart Allora if PATH changed, then rescan.`,
    });
  };

  if (board.synthesisFlow === "yosys-nextpnr") {
    // The native runner supports these two families. Do not infer an ECP5
    // flow simply because a catalog entry is not iCE40.
    add("yosys", "Synthesis", OSS_CAD_URL, true);
    if (!board.identityUnresolved) {
      const family = board.family.toLowerCase();
      if (family.includes("ice40")) {
        add("nextpnr-ice40", "Place and route", OSS_CAD_URL, true);
        add("icepack", "Bitstream packing", OSS_CAD_URL, true);
      } else if (family.includes("ecp5")) {
        add("nextpnr-ecp5", "Place and route", OSS_CAD_URL, true);
        add("ecppack", "Bitstream packing", OSS_CAD_URL, true);
      }
    }
  } else {
    const url =
      board.synthesisFlow === "vivado"
        ? VIVADO_URL
        : (vendorUrls[board.synthesisFlow] ?? OSS_CAD_URL);
    for (const [key, purpose] of [
      ["synth", "Synthesis"],
      ["placeRoute", "Place and route"],
      ["pack", "Bitstream packing"],
    ] as const) {
      const declared = board.toolchain[key];
      add(
        declared ? (suiteCommands[declared] ?? declared) : undefined,
        purpose,
        url,
      );
    }
  }

  const programmer = board.programmer?.command ?? board.toolchain.program;
  // Only recognized, single programmer executables have installation guidance.
  // Entries such as "openocd / dfu-util" require choosing an adapter first.
  if (programmer && programmerUrls[programmer]) {
    add(programmer, "Programming", programmerUrls[programmer]);
  }
  return [...requirements.values()];
}
