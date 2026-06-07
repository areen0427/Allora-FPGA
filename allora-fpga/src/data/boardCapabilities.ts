import type { BoardCapabilities, BoardDefinition } from "./boards";

export function getBoardCapabilities(board: BoardDefinition): BoardCapabilities {
  if (board.synthesisFlow === "yosys-nextpnr") {
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
        detail: "Hardware diagrams are generated through the local Yosys flow.",
      },
      bitstream: {
        supported: board.family === "iCE40 UltraPlus" || board.family === "ECP5",
        label: board.family === "iCE40 UltraPlus" || board.family === "ECP5" ? "Supported" : "Not wired",
        detail:
          board.family === "iCE40 UltraPlus" || board.family === "ECP5"
            ? "Bitstreams are generated with Yosys, NextPNR, and the board packer."
            : "This Yosys board family does not have a packer command wired up yet.",
      },
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
  };
}
