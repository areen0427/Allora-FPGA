import type { BoardCapabilities, BoardDefinition } from "./boards";

export function getBoardCapabilities(
  board: BoardDefinition,
): BoardCapabilities {
  if (board.synthesisFlow === "yosys-nextpnr") {
    const fpga = board.fpgaId.toLowerCase();
    const packageKnown = Boolean(board.package && board.package !== "unknown");
    const ice40Device =
      board.family.toLowerCase().includes("ice40") &&
      /(up5k|up3k|hx8k|hx4k|hx1k|lp8k|lp4k|lp1k)/.test(fpga);
    const ecp5Device =
      board.family.toLowerCase().includes("ecp5") &&
      /lfe5u(m5g|m)?-(12f|25f|45f|85f)/.test(fpga);
    const canBuild =
      packageKnown && !board.identityUnresolved && (ice40Device || ecp5Device);
    return {
      toolchain: "Yosys + NextPNR",
      pinMapping: {
        supported: true,
        label: "Supported",
        detail: `Pin mapping uses ${board.constraintsFile.toUpperCase()} constraints.`,
      },
      synthesisDiagram: {
        supported: true,
        label: "Supported",
        detail:
          "Hardware diagrams are generated through the local Yosys flow. Yosys must be installed and available on PATH.",
      },
      bitstream: {
        supported: canBuild,
        label: canBuild ? "Build available" : "Device or package unresolved",
        detail: canBuild
          ? "The local Yosys, NextPNR, and packer build path is available. This does not establish physical programming support."
          : board.identityUnresolved
            ? "Published sources disagree on the populated FPGA class. Confirm the physical part before building."
            : "A supported iCE40 or ECP5 device and a known package are required before building.",
      },
      programming: getProgrammingCapability(board),
    };
  }

  if (board.synthesisFlow === "vivado") {
    return {
      toolchain: "Vivado",
      pinMapping: {
        supported: true,
        label: "Supported",
        detail: "Pin mapping uses XDC constraints.",
      },
      synthesisDiagram: {
        supported: false,
        label: "Vivado runner needed",
        detail:
          "This board is available for setup and pin mapping, but synthesis diagrams need a Vivado batch runner.",
      },
      bitstream: {
        supported: false,
        label: "Vivado runner needed",
        detail:
          "Bitstream generation for this board needs a Vivado batch runner and a local Vivado install.",
      },
      programming: getProgrammingCapability(board),
    };
  }

  return {
    toolchain: board.synthesisFlow,
    pinMapping: {
      supported: true,
      label: "Supported",
      detail: `Pin mapping uses ${board.constraintsFile.toUpperCase()} constraints.`,
    },
    synthesisDiagram: {
      supported: false,
      label: "Not wired",
      detail: "This synthesis flow does not have an app runner yet.",
    },
    bitstream: {
      supported: false,
      label: "Not wired",
      detail: "This toolchain does not have an app bitstream runner yet.",
    },
    programming: getProgrammingCapability(board),
  };
}

function getProgrammingCapability(board: BoardDefinition) {
  if (board.programmer) {
    return {
      supported: true,
      label: "Configured, untested",
      detail: `Programming is configured with ${board.programmer.description} (${board.programmer.command}); verify the adapter and result on hardware.`,
    };
  }

  if (board.toolchain.program) {
    return {
      supported: true,
      label: "Configured, untested",
      detail: `${board.toolchain.program} is listed as a programmer; verify its arguments, adapter, and result on hardware.`,
    };
  }

  return {
    supported: false,
    label: "Not configured",
    detail:
      "No programmer is configured for this board. Add programmer metadata to enable direct FPGA programming.",
  };
}
