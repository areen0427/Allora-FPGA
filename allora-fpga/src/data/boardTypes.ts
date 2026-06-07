export type ConstraintFile = "pcf" | "lpf" | "xdc" | "cst";

export type SynthesisFlow =
  | "yosys-nextpnr"
  | "gowin"
  | "vivado"
  | "quartus";

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
  clocks: BoardClock[];
  pins: BoardPin[];
  leds: BoardPin[];
  buttons: BoardPin[];
  notes?: string;
};
