import type { BoardDefinition, BoardPin } from "../boardTypes";

function led(name: string, pin: string, signal = name): BoardPin {
  return { name, signal, pin, type: "led", group: "User LEDs", verified: true };
}

function button(name: string, pin: string, activeLow = false): BoardPin {
  return {
    name,
    signal: name,
    pin,
    type: "button",
    group: "User Buttons",
    activeLow,
    verified: true,
  };
}

function uart(name: string, signal: string, pin: string): BoardPin {
  return { name, signal, pin, type: "uart", group: "Serial", verified: true };
}

function spi(
  name: string,
  signal: string,
  pin: string,
  activeLow = false,
): BoardPin {
  return {
    name,
    signal,
    pin,
    type: "spi",
    group: "SPI Flash",
    activeLow,
    verified: true,
  };
}

function gpio(
  name: string,
  signal: string,
  pin: string,
  group = "GPIO",
): BoardPin {
  return { name, signal, pin, type: "gpio", group, verified: true };
}

function makeIce40Board({
  id,
  name,
  vendor,
  packageName = "SG48",
  clockPin,
  pins,
  leds,
  buttons,
  program,
  notes,
}: {
  id: string;
  name: string;
  vendor: string;
  packageName?: string;
  clockPin: string;
  pins: BoardPin[];
  leds: BoardPin[];
  buttons: BoardPin[];
  program: string;
  notes: string;
}): BoardDefinition {
  return {
    id,
    name,
    vendor,
    family: "iCE40 UltraPlus",
    device: "ICE40-UP5K",
    package: packageName,
    fpgaId: `ice40up5k-${packageName.toLowerCase()}`,
    constraintsFile: "pcf",
    synthesisFlow: "yosys-nextpnr",
    toolchain: {
      synth: "yosys",
      placeRoute: "nextpnr-ice40",
      pack: "icepack",
      program,
    },
    clocks: [
      { name: "clk12", pin: clockPin, frequency: 12000000, verified: true },
    ],
    pins,
    leds,
    buttons,
    notes,
  };
}

function makeEcp5Board({
  id,
  name,
  vendor,
  device,
  packageName,
  clockName,
  clockPin,
  clockFrequency,
  pins,
  leds,
  buttons,
  program,
  notes,
}: {
  id: string;
  name: string;
  vendor: string;
  device: string;
  packageName: string;
  clockName: string;
  clockPin: string;
  clockFrequency: number;
  pins: BoardPin[];
  leds: BoardPin[];
  buttons: BoardPin[];
  program: string;
  notes: string;
}): BoardDefinition {
  return {
    id,
    name,
    vendor,
    family: "ECP5",
    device,
    package: packageName,
    fpgaId: `${device.toLowerCase()}-${packageName.toLowerCase()}`,
    constraintsFile: "lpf",
    synthesisFlow: "yosys-nextpnr",
    toolchain: {
      synth: "yosys",
      placeRoute: "nextpnr-ecp5",
      pack: "ecppack",
      program,
    },
    clocks: [
      {
        name: clockName,
        pin: clockPin,
        frequency: clockFrequency,
        verified: true,
      },
    ],
    pins,
    leds,
    buttons,
    notes,
  };
}

function makeVivadoBoard({
  id,
  name,
  vendor,
  family,
  device,
  packageName,
  fpgaId,
  clockName,
  clockPin,
  clockFrequency,
  pins,
  leds,
  buttons = [],
  notes,
}: {
  id: string;
  name: string;
  vendor: string;
  family: string;
  device: string;
  packageName: string;
  fpgaId: string;
  clockName: string;
  clockPin: string;
  clockFrequency: number;
  pins: BoardPin[];
  leds: BoardPin[];
  buttons?: BoardPin[];
  notes: string;
}): BoardDefinition {
  return {
    id,
    name,
    vendor,
    family,
    device,
    package: packageName,
    fpgaId,
    constraintsFile: "xdc",
    synthesisFlow: "vivado",
    toolchain: {
      synth: "vivado",
      placeRoute: "vivado",
      program: "vivado",
    },
    clocks: [
      {
        name: clockName,
        pin: clockPin,
        frequency: clockFrequency,
        verified: true,
      },
    ],
    pins,
    leds,
    buttons,
    notes,
  };
}

const ICE_V_WIRELESS_LEDS = [
  led("user_led_n_0", "39", "rgb_blue"),
  led("user_led_n_1", "40", "rgb_green"),
  led("user_led_n_2", "41", "rgb_red"),
];
const ICE_V_WIRELESS_BUTTONS = [button("user_btn_n", "19", true)];
export const iceVWireless = makeIce40Board({
  id: "ice-v-wireless",
  name: "iCE-V Wireless",
  vendor: "iCE-V",
  clockPin: "35",
  leds: ICE_V_WIRELESS_LEDS,
  buttons: ICE_V_WIRELESS_BUTTONS,
  program: "dfu-util",
  pins: [
    ...ICE_V_WIRELESS_LEDS,
    ...ICE_V_WIRELESS_BUTTONS,
    uart("serial_rx", "uart_rx", "11"),
    uart("serial_tx", "uart_tx", "12"),
    spi("spiflash_cs_n", "spi_cs_n", "37", true),
    spi("spiflash_clk", "spi_clk", "28"),
    spi("spiflash_mosi", "spi_mosi", "26"),
    spi("spiflash_miso", "spi_miso", "23"),
    gpio("usb_d_p", "usb_dp", "4", "USB"),
    gpio("usb_d_n", "usb_dn", "3", "USB"),
    gpio("usb_pullup", "usb_pullup", "45", "USB"),
  ],
  notes: "Pin mapping based on the LiteX iCE-V Wireless platform.",
});

function makeBitsyRevision(revision: "v0" | "v1"): BoardDefinition {
  const leds =
    revision === "v0"
      ? [
          led("user_ledr_n", "11", "rgb_red"),
          led("user_ledg_n", "37", "rgb_green"),
        ]
      : [
          led("user_ledr_n", "25", "rgb_red"),
          led("user_ledg_n", "6", "rgb_green"),
          led("rgb_led_b", "41", "rgb_blue"),
        ];
  const buttons = [button("user_btn_n", revision === "v0" ? "10" : "2", true)];
  return makeIce40Board({
    id: `icebreaker-bitsy-${revision}`,
    name: `iCEBreaker Bitsy ${revision.toUpperCase()}`,
    vendor: "1BitSquared",
    clockPin: "35",
    leds,
    buttons,
    program: "dfu-util",
    pins: [
      ...leds,
      ...buttons,
      uart("serial_rx", "uart_rx", revision === "v0" ? "18" : "47"),
      uart("serial_tx", "uart_tx", revision === "v0" ? "19" : "44"),
      spi("spiflash_cs_n", "spi_cs_n", "16", true),
      spi("spiflash_clk", "spi_clk", "15"),
      spi("spiflash_miso", "spi_miso", "17"),
      spi("spiflash_mosi", "spi_mosi", "14"),
    ],
    notes: `Pin mapping based on the LiteX iCEBreaker Bitsy ${revision} platform.`,
  });
}

const ICE40_EVN_LEDS = [
  led("user_ledb_n", "39", "rgb_blue"),
  led("user_ledg_n", "40", "rgb_green"),
  led("user_ledr_n", "41", "rgb_red"),
];
const ICE40_EVN_BUTTONS = [
  button("user_sw_0", "23"),
  button("user_sw_1", "25"),
  button("user_sw_2", "34"),
  button("user_sw_3", "43"),
];
export const latticeIce40Up5kEvn = makeIce40Board({
  id: "lattice-ice40up5k-evn",
  name: "Lattice iCE40UP5K EVN",
  vendor: "Lattice",
  clockPin: "35",
  leds: ICE40_EVN_LEDS,
  buttons: ICE40_EVN_BUTTONS,
  program: "iceprog",
  pins: [
    ...ICE40_EVN_LEDS,
    ...ICE40_EVN_BUTTONS,
    spi("spiflash_cs_n", "spi_cs_n", "16", true),
    spi("spiflash_clk", "spi_clk", "15"),
    spi("spiflash_mosi", "spi_mosi", "14"),
    spi("spiflash_miso", "spi_miso", "17"),
  ],
  notes: "Pin mapping based on the LiteX Lattice iCE40UP5K EVN platform.",
});

const ICEPI_ZERO_LEDS = [
  led("user_led_0", "E13", "led0"),
  led("user_led_1", "D14", "led1"),
  led("user_led_2", "E12", "led2"),
  led("user_led_3", "C13", "led3"),
  led("user_led_4", "D13", "led4"),
];
const ICEPI_ZERO_BUTTONS = [
  button("user_btn_0", "C4"),
  button("user_btn_1", "C5"),
];
function makeIcepiZero(device: "25F" | "45F"): BoardDefinition {
  return makeEcp5Board({
    id: `icepi-zero-${device.toLowerCase()}`,
    name: `iCEpi Zero ${device}`,
    vendor: "iCEpi",
    device: `LFE5U-${device}`,
    packageName: "CABGA256",
    clockName: "clk50",
    clockPin: "M1",
    clockFrequency: 50000000,
    program: "openFPGALoader",
    leds: ICEPI_ZERO_LEDS,
    buttons: ICEPI_ZERO_BUTTONS,
    pins: [
      ...ICEPI_ZERO_LEDS,
      ...ICEPI_ZERO_BUTTONS,
      uart("serial_tx", "uart_tx", "K15"),
      uart("serial_rx", "uart_rx", "K16"),
      spi("spiflash_cs_n", "spi_cs_n", "N8", true),
      spi("spiflash_mosi", "spi_mosi", "T8"),
      spi("spiflash_miso", "spi_miso", "T7"),
      gpio("usb0_d_p", "usb0_dp", "F15", "USB"),
      gpio("gpdi_clk_p", "gpdi_clk_p", "R12", "GPDI"),
    ],
    notes:
      "Pin mapping based on the LiteX iCEpi Zero platform. SDRAM, USB, GPIO header, and GPDI buses are summarized.",
  });
}

export const latticeEcp5Evn = makeEcp5Board({
  id: "lattice-ecp5-evn",
  name: "Lattice ECP5 EVN",
  vendor: "Lattice",
  device: "LFE5UM5G-85F",
  packageName: "CABGA381",
  clockName: "clk12",
  clockPin: "A10",
  clockFrequency: 12000000,
  program: "openocd",
  leds: [0, 1, 2, 3, 4, 5, 6, 7].map((index) =>
    led(
      `user_led_${index}`,
      ["A13", "A12", "B19", "A18", "B18", "C17", "A17", "B17"][index],
      `led${index}`,
    ),
  ),
  buttons: [button("button_1", "P4")],
  pins: [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((index) =>
      led(
        `user_led_${index}`,
        ["A13", "A12", "B19", "A18", "B18", "C17", "A17", "B17"][index],
        `led${index}`,
      ),
    ),
    button("button_1", "P4"),
    uart("serial_rx", "uart_rx", "P2"),
    uart("serial_tx", "uart_tx", "P3"),
    spi("spiflash_cs_n", "spi_cs_n", "R2", true),
    spi("spiflash_mosi", "spi_mosi", "W2"),
    spi("spiflash_miso", "spi_miso", "V2"),
    gpio("serdes_tx_p", "serdes_tx_p", "W4", "SERDES"),
  ],
  notes:
    "Pin mapping based on the LiteX Lattice ECP5 EVN platform. SERDES and Raspberry Pi connector signals are summarized.",
});

export const latticeVersaEcp5 = makeEcp5Board({
  id: "lattice-versa-ecp5",
  name: "Lattice Versa ECP5",
  vendor: "Lattice",
  device: "LFE5UM5G-45F",
  packageName: "CABGA381",
  clockName: "clk100",
  clockPin: "P3",
  clockFrequency: 100000000,
  program: "openocd",
  leds: [0, 1, 2, 3, 4, 5, 6, 7].map((index) =>
    led(
      `user_led_${index}`,
      ["E16", "D17", "D18", "E18", "F17", "F18", "E17", "F16"][index],
      `led${index}`,
    ),
  ),
  buttons: [button("rst_n", "T1", true)],
  pins: [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((index) =>
      led(
        `user_led_${index}`,
        ["E16", "D17", "D18", "E18", "F17", "F18", "E17", "F16"][index],
        `led${index}`,
      ),
    ),
    button("rst_n", "T1", true),
    uart("serial_rx", "uart_rx", "C11"),
    uart("serial_tx", "uart_tx", "A11"),
    spi("spiflash_cs_n", "spi_cs_n", "R2", true),
    spi("spiflash_mosi", "spi_mosi", "W2"),
    spi("spiflash_miso", "spi_miso", "V2"),
    gpio("eth_rx_ctl", "eth_rx_ctl", "U19", "Ethernet"),
    gpio("eth_tx_ctl", "eth_tx_ctl", "R20", "Ethernet"),
  ],
  notes:
    "Pin mapping based on the LiteX Lattice Versa ECP5 platform. DDR3, PCIe, Ethernet, and SMA buses are summarized.",
});

export const trellisBoard = makeEcp5Board({
  id: "trellisboard",
  name: "TrellisBoard",
  vendor: "Lattice",
  device: "LFE5UM5G-85F",
  packageName: "CABGA756",
  clockName: "clk12",
  clockPin: "L5",
  clockFrequency: 12000000,
  program: "openocd",
  leds: [led("user_led_0", "B22", "led0"), led("user_led_1", "A21", "led1")],
  buttons: [],
  pins: [
    led("user_led_0", "B22", "led0"),
    led("user_led_1", "A21", "led1"),
    uart("serial_rx", "uart_rx", "AM28"),
    uart("serial_tx", "uart_tx", "AL28"),
    spi("spiflash_cs_n", "spi_cs_n", "AJ3", true),
    spi("spiflash_mosi", "spi_mosi", "AK2"),
    spi("spiflash_miso", "spi_miso", "AJ2"),
    gpio("eth_rx_ctl", "eth_rx_ctl", "A16", "Ethernet"),
    gpio("eth_tx_ctl", "eth_tx_ctl", "D15", "Ethernet"),
  ],
  notes:
    "Pin mapping based on the LiteX TrellisBoard platform. DDR3, PCIe, Ethernet, DVI, and PMOD buses are summarized.",
});

function makeKosagiNetV2(variant: "a7-35" | "a7-100"): BoardDefinition {
  const is100 = variant === "a7-100";
  return makeVivadoBoard({
    id: `kosagi-netv2-${variant}`,
    name: `Kosagi NetV2 ${is100 ? "A7-100" : "A7-35"}`,
    vendor: "Kosagi",
    family: "Artix-7",
    device: is100 ? "XC7A100T" : "XC7A35T",
    packageName: "FGG484",
    fpgaId: is100 ? "xc7a100t-fgg484-2" : "xc7a35t-fgg484-2",
    clockName: "clk50",
    clockPin: "Y18",
    clockFrequency: 50000000,
    leds: [led("user_led", "M21")],
    pins: [
      led("user_led", "M21"),
      uart("serial_tx", "uart_tx", "M19"),
      uart("serial_rx", "uart_rx", "M20"),
    ],
    notes:
      "Pin mapping based on the LiteX Kosagi NetV2 platform. Vivado runner is needed for synthesis and bitstream generation.",
  });
}

function makeSqrlAcorn(
  variant: "cle-101" | "cle-215" | "cle-215+",
): BoardDefinition {
  const device = variant === "cle-101" ? "XC7A100T" : "XC7A200T";
  const fpgaId =
    variant === "cle-101"
      ? "xc7a100t-fgg484-2"
      : variant === "cle-215"
        ? "xc7a200t-fbg484-2"
        : "xc7a200t-fbg484-3";
  return makeVivadoBoard({
    id: `sqrl-acorn-${variant.replace("+", "plus")}`,
    name: `SQRL Acorn ${variant.toUpperCase()}`,
    vendor: "SQRL",
    family: "Artix-7",
    device,
    packageName: variant === "cle-101" ? "FGG484" : "FBG484",
    fpgaId,
    clockName: "clk200",
    clockPin: "J19/H19",
    clockFrequency: 200000000,
    leds: [led("user_led_0", "G3", "led0"), led("user_led_1", "H3", "led1")],
    pins: [
      led("user_led_0", "G3", "led0"),
      led("user_led_1", "H3", "led1"),
      uart("serial_tx", "uart_tx", "K2"),
      uart("serial_rx", "uart_rx", "J2"),
      spi("flash_cs_n", "spi_cs_n", "T19", true),
    ],
    notes:
      "Pin mapping based on the LiteX SQRL Acorn platform. Vivado runner is needed for synthesis and bitstream generation.",
  });
}

export const sqrlFk33 = makeVivadoBoard({
  id: "sqrl-fk33",
  name: "SQRL FK33",
  vendor: "SQRL",
  family: "Virtex UltraScale+",
  device: "XCVU33P",
  packageName: "FSVH2104",
  fpgaId: "xcvu33p-fsvh2104-2L-e",
  clockName: "clk200",
  clockPin: "unknown",
  clockFrequency: 200000000,
  leds: [],
  pins: [],
  notes:
    "Pin mapping based on the LiteX SQRL FK33 platform. Vivado runner is needed for synthesis and bitstream generation.",
});

export const icebreakerBitsyBoards = [
  makeBitsyRevision("v0"),
  makeBitsyRevision("v1"),
];
export const icepiZeroBoards = [makeIcepiZero("25F"), makeIcepiZero("45F")];
export const kosagiNetV2Boards = [
  makeKosagiNetV2("a7-35"),
  makeKosagiNetV2("a7-100"),
];
export const sqrlAcornBoards = [
  makeSqrlAcorn("cle-101"),
  makeSqrlAcorn("cle-215"),
  makeSqrlAcorn("cle-215+"),
];
