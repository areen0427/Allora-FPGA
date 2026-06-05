export type ConstraintFile = "pcf" | "lpf" | "xdc" | "cst";

export type SynthesisFlow =
  | "yosys-nextpnr"
  | "gowin"
  | "vivado"
  | "quartus";

export type BoardPin = {
  name: string;
  pin: string;
};

export type BoardClock = {
  name: string;
  pin?: string;
  frequency: number;
};

export type BoardDefinition = {
  id: string;
  name: string;

  vendor: string;
  family: string;
  device: string;
  package: string;

  constraintsFile: ConstraintFile;
  synthesisFlow: SynthesisFlow;

  clocks: BoardClock[];
  leds: BoardPin[];
  buttons: BoardPin[];
};

export const BOARDS: BoardDefinition[] = [
  {
    id: "icebreaker",
    name: "iCEBreaker",
    vendor: "Lattice",
    family: "iCE40 UltraPlus",
    device: "iCE40UP5K",
    package: "SG48",
    constraintsFile: "pcf",
    synthesisFlow: "yosys-nextpnr",
    clocks: [],
    leds: [],
    buttons: [],
  },
  {
    id: "ulx3s",
    name: "ULX3S",
    vendor: "Lattice",
    family: "ECP5",
    device: "LFE5U-85F",
    package: "CABGA381",
    constraintsFile: "lpf",
    synthesisFlow: "yosys-nextpnr",
    clocks: [],
    leds: [],
    buttons: [],
  },
  {
    id: "orangecrab",
    name: "OrangeCrab",
    vendor: "Lattice",
    family: "ECP5",
    device: "LFE5U-25F",
    package: "CSFBGA285",
    constraintsFile: "lpf",
    synthesisFlow: "yosys-nextpnr",
    clocks: [],
    leds: [],
    buttons: [],
  },
  {
    id: "tangnano9k",
    name: "Tang Nano 9K",
    vendor: "Gowin",
    family: "GW1NR",
    device: "GW1NR-9",
    package: "QN88",
    constraintsFile: "cst",
    synthesisFlow: "gowin",
    clocks: [],
    leds: [],
    buttons: [],
  },
];

export function getBoardById(id: string) {
  return BOARDS.find((board) => board.id === id);
}