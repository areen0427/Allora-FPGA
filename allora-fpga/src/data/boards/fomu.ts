import type { BoardDefinition, BoardPin } from "../boardTypes";

const FOMU_LEDS: BoardPin[] = [
  {
    name: "FomuPVT_RGB0",
    signal: "rgb0",
    pin: "A5",
    type: "led",
    group: "Tri-colour LED",
    activeLow: true,
    verified: true,
  },
  {
    name: "FomuPVT_RGB1",
    signal: "rgb1",
    pin: "B5",
    type: "led",
    group: "Tri-colour LED",
    activeLow: true,
    verified: true,
  },
  {
    name: "FomuPVT_RGB2",
    signal: "rgb2",
    pin: "C5",
    type: "led",
    group: "Tri-colour LED",
    activeLow: true,
    verified: true,
  },
];

const FOMU_BUTTONS: BoardPin[] = [
  {
    name: "FomuPVT_USER1",
    signal: "user1",
    pin: "E4",
    type: "button",
    group: "User Buttons",
    verified: true,
  },
  {
    name: "FomuPVT_USER2",
    signal: "user2",
    pin: "D5",
    type: "button",
    group: "User Buttons",
    verified: true,
  },
  {
    name: "FomuPVT_USER3",
    signal: "user3",
    pin: "E5",
    type: "button",
    group: "User Buttons",
    verified: true,
  },
  {
    name: "FomuPVT_USER4",
    signal: "user4",
    pin: "F5",
    type: "button",
    group: "User Buttons",
    verified: true,
  },
];

const FOMU_PINS: BoardPin[] = [
  ...FOMU_LEDS,
  ...FOMU_BUTTONS,

  {
    name: "FomuPVT_SPI_MOSI",
    signal: "spi_mosi",
    pin: "F1",
    type: "spi",
    group: "SPI Flash",
    verified: true,
  },
  {
    name: "FomuPVT_SPI_MISO",
    signal: "spi_miso",
    pin: "E1",
    type: "spi",
    group: "SPI Flash",
    verified: true,
  },
  {
    name: "FomuPVT_SPI_CLK",
    signal: "spi_clk",
    pin: "D1",
    type: "spi",
    group: "SPI Flash",
    verified: true,
  },
  {
    name: "FomuPVT_SPI_IO2",
    signal: "spi_io2",
    pin: "F2",
    type: "spi",
    group: "SPI Flash",
    verified: true,
  },
  {
    name: "FomuPVT_SPI_IO3",
    signal: "spi_io3",
    pin: "B1",
    type: "spi",
    group: "SPI Flash",
    verified: true,
  },
  {
    name: "FomuPVT_SPI_cs",
    signal: "spi_cs",
    pin: "C1",
    type: "spi",
    group: "SPI Flash",
    verified: true,
  },

  {
    name: "FomuPVT_USB_DN",
    signal: "usb_dn",
    pin: "A2",
    type: "gpio",
    group: "USB",
    verified: true,
  },
  {
    name: "FomuPVT_USB_DP",
    signal: "usb_dp",
    pin: "A1",
    type: "gpio",
    group: "USB",
    verified: true,
  },
  {
    name: "FomuPVT_USB_DP_PU",
    signal: "usb_dp_pu",
    pin: "A4",
    type: "gpio",
    group: "USB",
    verified: true,
  },
];

export const fomuPvt: BoardDefinition = {
  id: "fomu-pvt",
  name: "Fomu PVT",
  vendor: "Fomu",
  family: "iCE40 UltraPlus",
  device: "ICE40-UP5K",
  package: "UWG30",
  fpgaId: "ice40up5k-uwg30",
  constraintsFile: "pcf",
  synthesisFlow: "yosys-nextpnr",
  toolchain: {
    synth: "yosys",
    placeRoute: "nextpnr-ice40",
    pack: "icepack",
    program: "dfu-util",
  },
  clocks: [
    {
      name: "FomuPVT_CLK",
      pin: "F4",
      frequency: 48000000,
      verified: true,
    },
  ],
  pins: FOMU_PINS,
  leds: FOMU_LEDS,
  buttons: FOMU_BUTTONS,
  notes:
    "Pin mapping populated from the Fomu PVT PCF. Programming metadata references the DFU bootloader, but in-app programming is not wired yet.",
};
