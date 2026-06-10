export type ConstraintFile =
  | "pcf"
  | "lpf"
  | "xdc"
  | "cst"
  | "qsf"
  | "peri"
  | "ccf"
  | "pdc";

export type SynthesisFlow =
  | "yosys-nextpnr"
  | "gowin"
  | "vivado"
  | "quartus"
  | "efinity"
  | "gatemate"
  | "quicklogic"
  | "radiant"
  | "microchip";

export type PinType =
  | "clock"
  | "led"
  | "button"
  | "gpio"
  | "uart"
  | "spi"
  | "i2c"
  | "flash"
  | "unknown";

export type BoardPin = {
  name: string;
  pin: string;
  type: PinType;
  group?: string;
  signal?: string;
  activeLow?: boolean;
  verified: boolean;
};

export type BoardClock = {
  name: string;
  pin?: string;
  frequency: number;
  verified: boolean;
};

export type BoardToolchain = {
  synth: string;
  placeRoute?: string;
  pack?: string;
  program?: string;
};

export type ProgrammerBackend =
  | "iceprog"
  | "ecpprog"
  | "openFPGALoader"
  | "ujprog"
  | "vivado_hw_manager"
  | "quartus_pgm"
  | "gowin_programmer"
  | "ftdi_jtag";

export type BoardProgrammer = {
  backend: ProgrammerBackend;
  command: string;
  description: string;
  defaultArgs?: string[];
  usbVendorId?: number;
  usbProductId?: number;
  bitstreamExtensions: string[];
};

export type BoardCapability = {
  supported: boolean;
  label: string;
  detail: string;
};

export type BoardCapabilities = {
  toolchain: string;
  pinMapping: BoardCapability;
  synthesisDiagram: BoardCapability;
  bitstream: BoardCapability;
  programming: BoardCapability;
};

export type BoardDefinition = {
  id: string;
  name: string;
  vendor: string;
  family: string;
  device: string;
  package: string;
  fpgaId: string;
  constraintsFile: ConstraintFile;
  synthesisFlow: SynthesisFlow;
  toolchain: BoardToolchain;
  programmer?: BoardProgrammer;
  clocks: BoardClock[];
  pins: BoardPin[];
  leds: BoardPin[];
  buttons: BoardPin[];
  notes?: string;
};
