import type { BoardDefinition, BoardPin, BoardClock } from "../boardTypes";

const ULX3S_CLOCKS: BoardClock[] = [
  {
    name: "clk25",
    pin: "G2",
    frequency: 25000000,
    verified: true,
  },
];

const ULX3S_LEDS: BoardPin[] = [
  { name: "led0", signal: "led[0]", pin: "B2", type: "led", verified: true },
  { name: "led1", signal: "led[1]", pin: "C2", type: "led", verified: true },
  { name: "led2", signal: "led[2]", pin: "C1", type: "led", verified: true },
  { name: "led3", signal: "led[3]", pin: "D2", type: "led", verified: true },
  { name: "led4", signal: "led[4]", pin: "D1", type: "led", verified: true },
  { name: "led5", signal: "led[5]", pin: "E2", type: "led", verified: true },
  { name: "led6", signal: "led[6]", pin: "E1", type: "led", verified: true },
  { name: "led7", signal: "led[7]", pin: "H3", type: "led", verified: true },
];

const ULX3S_BUTTONS: BoardPin[] = [
  { name: "btn0", pin: "D6", type: "button", activeLow: true, verified: true },
  { name: "btn1", pin: "R1", type: "button", verified: true },
  { name: "btn2", pin: "T1", type: "button", verified: true },
  { name: "btn3", pin: "R18", type: "button", verified: true },
  { name: "btn4", pin: "V1", type: "button", verified: true },
  { name: "btn5", pin: "U1", type: "button", verified: true },
  { name: "btn6", pin: "H16", type: "button", verified: true },
];

const ULX3S_PINS: BoardPin[] = [...ULX3S_LEDS, ...ULX3S_BUTTONS];

function createUlx3sVariant(
  id: string,
  name: string,
  device: string,
  fpgaId: string,
): BoardDefinition {
  return {
    id,
    name,
    vendor: "Lattice",
    family: "ECP5",
    device,
    package: "CABGA381",
    fpgaId,
    constraintsFile: "lpf",
    synthesisFlow: "yosys-nextpnr",
    toolchain: {
      synth: "yosys",
      placeRoute: "nextpnr-ecp5",
      pack: "ecppack",
      program: "fujprog",
    },
    clocks: ULX3S_CLOCKS,
    pins: ULX3S_PINS,
    leds: ULX3S_LEDS,
    buttons: ULX3S_BUTTONS,
    notes:
      "Clock, LED and button pads match the maker's ulx3s_v20.lpf for ULX3S v2.x.x and v3.0.x; other revisions need their own pinout check. The maker documents fujprog bitstream.bit for SRAM, fujprog -j flash bitstream.bit for flash, and openFPGALoader --board=ulx3s equivalents. Published pins and commands have not been tested on hardware in Allora.",
  };
}

export const ulx3s12f = createUlx3sVariant(
  "ulx3s-12f",
  "ULX3S 12F",
  "LFE5U-12F",
  "lfe5u-12f-cabga381",
);

export const ulx3s25f = createUlx3sVariant(
  "ulx3s-25f",
  "ULX3S 25F",
  "LFE5U-25F",
  "lfe5u-25f-cabga381",
);

export const ulx3s45f = createUlx3sVariant(
  "ulx3s-45f",
  "ULX3S 45F",
  "LFE5U-45F",
  "lfe5u-45f-cabga381",
);

export const ulx3s85f = createUlx3sVariant(
  "ulx3s-85f",
  "ULX3S 85F",
  "LFE5U-85F",
  "lfe5u-85f-cabga381",
);

export const ULX3S_BOARDS: BoardDefinition[] = [
  ulx3s12f,
  ulx3s25f,
  ulx3s45f,
  ulx3s85f,
];
