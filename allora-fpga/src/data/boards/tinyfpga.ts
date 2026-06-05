import type { BoardDefinition, BoardPin } from "../boardTypes";

const TINYFPGA_BX_LEDS: BoardPin[] = [
  { name: "TinyFPGABX_LED", signal: "led", pin: "B3", type: "led", group: "On-board LED", verified: true },
];

const TINYFPGA_BX_PINS: BoardPin[] = [
  ...TINYFPGA_BX_LEDS,

  { name: "TinyFPGABX_PIN_1", signal: "pin_1", pin: "A2", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_2", signal: "pin_2", pin: "A1", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_3", signal: "pin_3", pin: "B1", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_4", signal: "pin_4", pin: "C2", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_5", signal: "pin_5", pin: "C1", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_6", signal: "pin_6", pin: "D2", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_7", signal: "pin_7", pin: "D1", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_8", signal: "pin_8", pin: "E2", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_9", signal: "pin_9", pin: "E1", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_10", signal: "pin_10", pin: "G2", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_11", signal: "pin_11", pin: "H1", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_12", signal: "pin_12", pin: "J1", type: "gpio", group: "Left side", verified: true },
  { name: "TinyFPGABX_PIN_13", signal: "pin_13", pin: "H2", type: "gpio", group: "Left side", verified: true },

  { name: "TinyFPGABX_PIN_14", signal: "pin_14", pin: "H9", type: "gpio", group: "Right side", verified: true },
  { name: "TinyFPGABX_PIN_15", signal: "pin_15", pin: "D9", type: "gpio", group: "Right side", verified: true },
  { name: "TinyFPGABX_PIN_16", signal: "pin_16", pin: "D8", type: "gpio", group: "Right side", verified: true },
  { name: "TinyFPGABX_PIN_17", signal: "pin_17", pin: "C9", type: "gpio", group: "Right side", verified: true },
  { name: "TinyFPGABX_PIN_18", signal: "pin_18", pin: "A9", type: "gpio", group: "Right side", verified: true },
  { name: "TinyFPGABX_PIN_19", signal: "pin_19", pin: "B8", type: "gpio", group: "Right side", verified: true },
  { name: "TinyFPGABX_PIN_20", signal: "pin_20", pin: "A8", type: "gpio", group: "Right side", verified: true },
  { name: "TinyFPGABX_PIN_21", signal: "pin_21", pin: "B7", type: "gpio", group: "Right side", verified: true },
  { name: "TinyFPGABX_PIN_22", signal: "pin_22", pin: "A7", type: "gpio", group: "Right side", verified: true },
  { name: "TinyFPGABX_PIN_23", signal: "pin_23", pin: "B6", type: "gpio", group: "Right side", verified: true },
  { name: "TinyFPGABX_PIN_24", signal: "pin_24", pin: "A6", type: "gpio", group: "Right side", verified: true },

  { name: "TinyFPGABX_PIN_25", signal: "pin_25", pin: "G1", type: "gpio", group: "Bottom", verified: true },
  { name: "TinyFPGABX_PIN_26", signal: "pin_26", pin: "J3", type: "gpio", group: "Bottom", verified: true },
  { name: "TinyFPGABX_PIN_27", signal: "pin_27", pin: "J4", type: "gpio", group: "Bottom", verified: true },
  { name: "TinyFPGABX_PIN_28", signal: "pin_28", pin: "G9", type: "gpio", group: "Bottom", verified: true },
  { name: "TinyFPGABX_PIN_29", signal: "pin_29", pin: "J9", type: "gpio", group: "Bottom", verified: true },
  { name: "TinyFPGABX_PIN_30", signal: "pin_30", pin: "E8", type: "gpio", group: "Bottom", verified: true },
  { name: "TinyFPGABX_PIN_31", signal: "pin_31", pin: "J2", type: "gpio", group: "Bottom", verified: true },

  { name: "TinyFPGABX_SPI_SS", signal: "spi_ss", pin: "F7", type: "flash", group: "SPI flash", verified: true },
  { name: "TinyFPGABX_SPI_SCK", signal: "spi_sck", pin: "G7", type: "flash", group: "SPI flash", verified: true },
  { name: "TinyFPGABX_SPI_IO0", signal: "spi_io0", pin: "G6", type: "flash", group: "SPI flash", verified: true },
  { name: "TinyFPGABX_SPI_IO1", signal: "spi_io1", pin: "H7", type: "flash", group: "SPI flash", verified: true },
  { name: "TinyFPGABX_SPI_IO2", signal: "spi_io2", pin: "H4", type: "flash", group: "SPI flash", verified: true },
  { name: "TinyFPGABX_SPI_IO3", signal: "spi_io3", pin: "J8", type: "flash", group: "SPI flash", verified: true },

  { name: "TinyFPGABX_USBP", signal: "usb_p", pin: "B4", type: "unknown", group: "USB", verified: true },
  { name: "TinyFPGABX_USBN", signal: "usb_n", pin: "A4", type: "unknown", group: "USB", verified: true },
  { name: "TinyFPGABX_USBPU", signal: "usb_pu", pin: "A3", type: "unknown", group: "USB", verified: true },
];

function createTinyFpgaVariant({
  id,
  name,
  program,
  progId,
  pins,
  leds,
  notes,
}: {
  id: string;
  name: string;
  program: string;
  progId: string;
  pins: BoardPin[];
  leds: BoardPin[];
  notes: string;
}): BoardDefinition {
  return {
    id,
    name,
    vendor: "TinyFPGA",
    family: "iCE40 LP",
    device: "iCE40-LP8K",
    package: "CM81",
    fpgaId: "ice40lp8k-cm81",
    constraintsFile: "pcf",
    synthesisFlow: "yosys-nextpnr",
    toolchain: {
      synth: "yosys",
      placeRoute: "nextpnr-ice40",
      pack: "icepack",
      program,
    },
    clocks: [
      {
        name: "clk16",
        pin: "B2",
        frequency: 16000000,
        verified: id === "tinyfpga-bx",
      },
    ],
    pins,
    leds,
    buttons: [],
    notes: `${notes} Programmer USB ID: ${progId}.`,
  };
}

export const tinyfpgaB2 = createTinyFpgaVariant({
  id: "tinyfpga-b2",
  name: "TinyFPGA B2",
  program: "tinyfpgab",
  progId: "1209:2100",
  pins: [],
  leds: [],
  notes:
    "TinyFPGA B2 metadata is available, but no local constraints file was provided yet. Pin mappings are intentionally left empty until verified.",
});

export const tinyfpgaBx = createTinyFpgaVariant({
  id: "tinyfpga-bx",
  name: "TinyFPGA BX",
  program: "tinyprog",
  progId: "1d50:6130",
  pins: TINYFPGA_BX_PINS,
  leds: TINYFPGA_BX_LEDS,
  notes: "TinyFPGA BX pin mapping from constraints.pcf and related PCF fragments.",
});

export const TINYFPGA_BOARDS: BoardDefinition[] = [tinyfpgaB2, tinyfpgaBx];
