export type ConstraintFile = "pcf" | "lpf" | "xdc" | "cst";

export type SynthesisFlow =
  | "yosys-nextpnr"
  | "gowin"
  | "vivado"
  | "quartus";

export type BoardPin = {
  name: string;
  pin: string;
  activeLow?: boolean;
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
    clocks: [{ name: "clk12", pin: "35", frequency: 12000000 }],
    leds: [
      { name: "led_red", pin: "11", activeLow: true },
      { name: "led_green", pin: "37", activeLow: true },
      { name: "rgb_red", pin: "39", activeLow: true },
      { name: "rgb_green", pin: "40", activeLow: true },
      { name: "rgb_blue", pin: "41", activeLow: true },
    ],
    buttons: [{ name: "button", pin: "10", activeLow: true }],
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
    clocks: [{ name: "clk25", pin: "G2", frequency: 25000000 }],
    leds: [
      { name: "led0", pin: "B2" },
      { name: "led1", pin: "C2" },
      { name: "led2", pin: "C1" },
      { name: "led3", pin: "D2" },
      { name: "led4", pin: "D1" },
      { name: "led5", pin: "E2" },
      { name: "led6", pin: "E1" },
      { name: "led7", pin: "H3" },
    ],
    buttons: [
      { name: "btn0", pin: "D6", activeLow: true },
      { name: "btn1", pin: "R1" },
      { name: "btn2", pin: "T1" },
      { name: "btn3", pin: "R18" },
      { name: "btn4", pin: "V1" },
      { name: "btn5", pin: "U1" },
      { name: "btn6", pin: "H16" },
    ],
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
    clocks: [{ name: "clk48", pin: "A9", frequency: 48000000 }],
    leds: [
      { name: "rgb_red", pin: "K4" },
      { name: "rgb_green", pin: "M3" },
      { name: "rgb_blue", pin: "J3" },
    ],
    buttons: [{ name: "usr_btn", pin: "J17" }],
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
    clocks: [{ name: "clk27", pin: "52", frequency: 27000000 }],
    leds: [
      { name: "led0", pin: "10" },
      { name: "led1", pin: "11" },
      { name: "led2", pin: "13" },
      { name: "led3", pin: "14" },
      { name: "led4", pin: "15" },
      { name: "led5", pin: "16" },
    ],
    buttons: [
      { name: "button1", pin: "3", activeLow: true },
      { name: "button2", pin: "4", activeLow: true },
    ],
  },
];

export function getBoardById(id: string) {
  return BOARDS.find((board) => board.id === id);
}