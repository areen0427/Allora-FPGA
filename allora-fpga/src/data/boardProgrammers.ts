import type { BoardDefinition, BoardProgrammer, ProgrammerBackend } from "./boardTypes";

const PROGRAMMER_COMMANDS: Record<string, BoardProgrammer> = {
  iceprog: {
    backend: "iceprog",
    command: "iceprog",
    description: "Lattice iCE40 USB programmer",
    bitstreamExtensions: ["bin"],
  },
  icesprog: {
    backend: "iceprog",
    command: "icesprog",
    description: "iCESugar iCE40 USB programmer",
    bitstreamExtensions: ["bin"],
  },
  ecpprog: {
    backend: "ecpprog",
    command: "ecpprog",
    description: "Lattice ECP5 USB programmer",
    bitstreamExtensions: ["bit"],
  },
  ecpdap: {
    backend: "openFPGALoader",
    command: "ecpdap",
    description: "ECPDAP ECP5 programmer",
    bitstreamExtensions: ["bit"],
  },
  openFPGALoader: {
    backend: "openFPGALoader",
    command: "openFPGALoader",
    description: "OpenFPGALoader multi-platform programmer",
    bitstreamExtensions: ["bit", "bin", "rbf"],
  },
  fujprog: {
    backend: "ujprog",
    command: "fujprog",
    description: "Fujprog ECP5 JTAG programmer",
    bitstreamExtensions: ["bit"],
  },
  "dfu-util": {
    backend: "iceprog",
    command: "dfu-util",
    description: "DFU USB programmer",
    defaultArgs: ["-D"],
    bitstreamExtensions: ["bin", "bit"],
  },
  tinyfpgab: {
    backend: "ftdi_jtag",
    command: "tinyfpgab",
    description: "TinyFPGA BX USB programmer",
    bitstreamExtensions: ["bit"],
  },
  tinyprog: {
    backend: "ftdi_jtag",
    command: "tinyprog",
    description: "TinyFPGA USB programmer",
    bitstreamExtensions: ["bit"],
  },
  openocd: {
    backend: "ftdi_jtag",
    command: "openocd",
    description: "OpenOCD JTAG programmer",
    bitstreamExtensions: ["bit", "rbf"],
  },
  vivado: {
    backend: "vivado_hw_manager",
    command: "vivado",
    description: "Xilinx Vivado Hardware Manager",
    defaultArgs: ["-mode", "batch", "-source", "program.tcl"],
    bitstreamExtensions: ["bit"],
  },
  "USB-Blaster": {
    backend: "quartus_pgm",
    command: "quartus_pgm",
    description: "Intel/Altera USB-Blaster programmer",
    defaultArgs: ["--mode", "JTAG"],
    bitstreamExtensions: ["sof", "rbf", "pof"],
  },
  gowin_programmer: {
    backend: "gowin_programmer",
    command: "gowin_programmer",
    description: "Gowin FPGA Programmer",
    bitstreamExtensions: ["fs", "bit"],
  },
  efinity: {
    backend: "openFPGALoader",
    command: "openFPGALoader",
    description: "Efinix FPGA Programmer",
    bitstreamExtensions: ["bit"],
  },
  radiant: {
    backend: "ftdi_jtag",
    command: "programmer",
    description: "Lattice Radiant Programmer",
    bitstreamExtensions: ["bit"],
  },
  quicklogic: {
    backend: "ftdi_jtag",
    command: "quickprogrammer",
    description: "QuickLogic Programmer",
    bitstreamExtensions: ["bit"],
  },
  libero: {
    backend: "ftdi_jtag",
    command: "LiberoProgrammer",
    description: "Microsemi Libero Programmer",
    bitstreamExtensions: ["job"],
  },
};

export function resolveBoardProgrammer(board: BoardDefinition): BoardProgrammer | null {
  if (board.programmer) {
    return board.programmer;
  }

  const programCommand = board.toolchain.program;
  if (!programCommand) {
    return null;
  }

  const known = PROGRAMMER_COMMANDS[programCommand];
  if (known) {
    return known;
  }

  return {
    backend: "ftdi_jtag",
    command: programCommand,
    description: `${programCommand} programmer`,
    bitstreamExtensions: ["bit", "bin"],
  };
}

export function getProgrammerBackendForCommand(command: string): ProgrammerBackend | null {
  const normalized = command.toLowerCase().trim();

  if (normalized.includes("iceprog")) return "iceprog";
  if (normalized.includes("ecpprog")) return "ecpprog";
  if (normalized.includes("openfpgaloader")) return "openFPGALoader";
  if (normalized.includes("fujprog") || normalized.includes("ujprog")) return "ujprog";
  if (normalized.includes("vivado")) return "vivado_hw_manager";
  if (normalized.includes("quartus") || normalized.includes("usb-blaster")) return "quartus_pgm";
  if (normalized.includes("gowin")) return "gowin_programmer";
  if (normalized.includes("openocd")) return "ftdi_jtag";
  if (normalized.includes("dfu")) return "iceprog";

  return "ftdi_jtag";
}