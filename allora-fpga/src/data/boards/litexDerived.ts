import type { BoardDefinition, BoardPin } from "../boardTypes";

function makeLed(name: string, pin: string, index?: number): BoardPin {
  return {
    name,
    signal: index === undefined ? "led" : `led${index}`,
    pin,
    type: "led",
    group: "User LEDs",
    verified: true,
  };
}

function makeButton(name: string, pin: string, index?: number, activeLow = false): BoardPin {
  return {
    name,
    signal: index === undefined ? "button" : `button${index}`,
    pin,
    type: "button",
    group: "User Buttons",
    activeLow,
    verified: true,
  };
}

function makeEcp5Variant({
  id,
  name,
  vendor,
  device,
  packageName,
  clockName,
  clockPin,
  clockFrequency,
  program,
  pins,
  leds,
  buttons,
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
  program: string;
  pins: BoardPin[];
  leds: BoardPin[];
  buttons: BoardPin[];
  notes: string;
}): BoardDefinition {
  return {
    id,
    name,
    vendor,
    family: "ECP5",
    device: `LFE5UM5G-${device}`,
    package: packageName,
    fpgaId: `lfe5um5g-${device.toLowerCase()}-${packageName.toLowerCase()}`,
    constraintsFile: "lpf",
    synthesisFlow: "yosys-nextpnr",
    toolchain: {
      synth: "yosys",
      placeRoute: "nextpnr-ecp5",
      pack: "ecppack",
      program,
    },
    clocks: [
      { name: clockName, pin: clockPin, frequency: clockFrequency, verified: true },
    ],
    pins,
    leds,
    buttons,
    notes,
  };
}

const BUTTERSTICK_LEDS: BoardPin[] = [
  makeLed("user_led_0", "C13", 0),
  makeLed("user_led_1", "D12", 1),
  makeLed("user_led_2", "U2", 2),
  makeLed("user_led_3", "T3", 3),
  makeLed("user_led_4", "D13", 4),
  makeLed("user_led_5", "E13", 5),
  makeLed("user_led_6", "C16", 6),
  makeLed("user_led_color_r", "T1"),
  makeLed("user_led_color_g", "R1"),
  makeLed("user_led_color_b", "U1"),
];

const BUTTERSTICK_BUTTONS: BoardPin[] = [
  makeButton("user_btn_n_0", "U16", 0, true),
  makeButton("user_btn_n_1", "T17", 1, true),
];

const BUTTERSTICK_PINS: BoardPin[] = [
  ...BUTTERSTICK_LEDS,
  ...BUTTERSTICK_BUTTONS,
  { name: "spiflash_cs_n", signal: "spi_cs_n", pin: "R2", type: "spi", group: "SPI Flash", activeLow: true, verified: true },
  { name: "spiflash_dq0", signal: "spi_dq0", pin: "W2", type: "spi", group: "SPI Flash", verified: true },
  { name: "spiflash_dq1", signal: "spi_dq1", pin: "V2", type: "spi", group: "SPI Flash", verified: true },
  { name: "sdcard_clk", signal: "sdcard_clk", pin: "B13", type: "spi", group: "SDCard", verified: true },
  { name: "sdcard_cmd", signal: "sdcard_cmd", pin: "A13", type: "spi", group: "SDCard", verified: true },
  { name: "sdcard_data0", signal: "sdcard_data0", pin: "C12", type: "spi", group: "SDCard", verified: true },
  { name: "eth_rx_ctl", signal: "eth_rx_ctl", pin: "B18", type: "gpio", group: "Ethernet", verified: true },
  { name: "eth_tx_ctl", signal: "eth_tx_ctl", pin: "D15", type: "gpio", group: "Ethernet", verified: true },
  { name: "ulpi_clk", signal: "ulpi_clk", pin: "B6", type: "gpio", group: "USB ULPI", verified: true },
  { name: "ulpi_dir", signal: "ulpi_dir", pin: "A6", type: "gpio", group: "USB ULPI", verified: true },
];

function createButterstickVariant(device: "25F" | "45F" | "85F"): BoardDefinition {
  return makeEcp5Variant({
    id: `butterstick-${device.toLowerCase()}`,
    name: `ButterStick ${device}`,
    vendor: "GSD",
    device,
    packageName: "BG381C",
    clockName: "clk30",
    clockPin: "B12",
    clockFrequency: 30000000,
    program: "openocd / dfu-util",
    pins: BUTTERSTICK_PINS,
    leds: BUTTERSTICK_LEDS,
    buttons: BUTTERSTICK_BUTTONS,
    notes:
      "Pin mapping based on the LiteX ButterStick r1.0 platform. High-speed SYZYGY and DDR3 buses are summarized.",
  });
}

const ECPIX5_LEDS: BoardPin[] = [
  makeLed("rgb_led_0_r", "P21", 0),
  makeLed("rgb_led_0_g", "R23", 1),
  makeLed("rgb_led_0_b", "P22", 2),
  makeLed("rgb_led_1_r", "K21", 3),
  makeLed("rgb_led_1_g", "K24", 4),
  makeLed("rgb_led_1_b", "M21", 5),
];

const ECPIX5_BUTTONS: BoardPin[] = [
  makeButton("rst_n", "N5", undefined, true),
];

const ECPIX5_PINS: BoardPin[] = [
  ...ECPIX5_LEDS,
  ...ECPIX5_BUTTONS,
  { name: "serial_rx", signal: "uart_rx", pin: "R26", type: "uart", group: "Serial", verified: true },
  { name: "serial_tx", signal: "uart_tx", pin: "R24", type: "uart", group: "Serial", verified: true },
  { name: "spiflash_cs_n", signal: "spi_cs_n", pin: "AA2", type: "spi", group: "SPI Flash", activeLow: true, verified: true },
  { name: "spiflash_mosi", signal: "spi_mosi", pin: "AE2", type: "spi", group: "SPI Flash", verified: true },
  { name: "spiflash_miso", signal: "spi_miso", pin: "AD2", type: "spi", group: "SPI Flash", verified: true },
  { name: "sdcard_clk", signal: "sdcard_clk", pin: "P24", type: "spi", group: "SDCard", verified: true },
  { name: "sdcard_cmd", signal: "sdcard_cmd", pin: "M24", type: "spi", group: "SDCard", verified: true },
  { name: "eth_rx_ctl", signal: "eth_rx_ctl", pin: "A11", type: "gpio", group: "Ethernet", verified: true },
  { name: "eth_tx_ctl", signal: "eth_tx_ctl", pin: "C9", type: "gpio", group: "Ethernet", verified: true },
  { name: "pmod0_0", signal: "pmod0_0", pin: "T25", type: "gpio", group: "PMOD 0", verified: true },
  { name: "pmod1_0", signal: "pmod1_0", pin: "U23", type: "gpio", group: "PMOD 1", verified: true },
];

function createEcpix5Variant(device: "45F" | "85F"): BoardDefinition {
  return makeEcp5Variant({
    id: `ecpix-5-${device.toLowerCase()}`,
    name: `ECPIX-5 ${device}`,
    vendor: "LambdaConcept",
    device,
    packageName: "BG554I",
    clockName: "clk100",
    clockPin: "K23",
    clockFrequency: 100000000,
    program: "openFPGALoader",
    pins: ECPIX5_PINS,
    leds: ECPIX5_LEDS,
    buttons: ECPIX5_BUTTONS,
    notes:
      "Pin mapping based on the LiteX ECPIX-5 platform. PMOD, DDR3, USB-C, SATA, and HDMI buses are summarized.",
  });
}

const ICESUGAR_PRO_LEDS: BoardPin[] = [
  makeLed("user_led_n_r", "B11", 0),
  makeLed("user_led_n_g", "A11", 1),
  makeLed("user_led_n_b", "A12", 2),
];

const ICESUGAR_PRO_BUTTONS: BoardPin[] = [
  makeButton("cpu_reset_n", "L14", undefined, true),
];

const ICESUGAR_PRO_PINS: BoardPin[] = [
  ...ICESUGAR_PRO_LEDS,
  ...ICESUGAR_PRO_BUTTONS,
  { name: "serial_tx", signal: "uart_tx", pin: "B9", type: "uart", group: "Serial", verified: true },
  { name: "serial_rx", signal: "uart_rx", pin: "A9", type: "uart", group: "Serial", verified: true },
  { name: "spiflash_cs_n", signal: "spi_cs_n", pin: "N8", type: "spi", group: "SPI Flash", activeLow: true, verified: true },
  { name: "spiflash_mosi", signal: "spi_mosi", pin: "T8", type: "spi", group: "SPI Flash", verified: true },
  { name: "spiflash_miso", signal: "spi_miso", pin: "T7", type: "spi", group: "SPI Flash", verified: true },
  { name: "sdcard_clk", signal: "sdcard_clk", pin: "J12", type: "spi", group: "SDCard", verified: true },
  { name: "sdcard_cmd", signal: "sdcard_cmd", pin: "H12", type: "spi", group: "SDCard", verified: true },
  { name: "gpdi_clk_p", signal: "gpdi_clk_p", pin: "E2", type: "gpio", group: "GPDI", verified: true },
  { name: "gpdi_data0_p", signal: "gpdi_data0_p", pin: "G1", type: "gpio", group: "GPDI", verified: true },
  { name: "eth_ref_clk", signal: "eth_ref_clk", pin: "D5", type: "gpio", group: "RMII Ethernet", verified: true },
  { name: "eth_tx_en", signal: "eth_tx_en", pin: "E4", type: "gpio", group: "RMII Ethernet", verified: true },
];

export const icesugarPro: BoardDefinition = makeEcp5Variant({
  id: "icesugar-pro",
  name: "iCESugar Pro",
  vendor: "Muse Lab",
  device: "25F",
  packageName: "BG256C",
  clockName: "clk25",
  clockPin: "P6",
  clockFrequency: 25000000,
  program: "ecpdap",
  pins: ICESUGAR_PRO_PINS,
  leds: ICESUGAR_PRO_LEDS,
  buttons: ICESUGAR_PRO_BUTTONS,
  notes:
    "Pin mapping based on the LiteX iCESugar Pro platform. This is the ECP5 iCESugar Pro, not the UP5K iCESugar board.",
});

const TANG_NANO_9K_LEDS: BoardPin[] = [
  makeLed("user_led_0", "10", 0),
  makeLed("user_led_1", "11", 1),
  makeLed("user_led_2", "13", 2),
  makeLed("user_led_3", "14", 3),
  makeLed("user_led_4", "15", 4),
  makeLed("user_led_5", "16", 5),
];

const TANG_NANO_20K_LEDS: BoardPin[] = [
  makeLed("led_n_0", "15", 0),
  makeLed("led_n_1", "16", 1),
  makeLed("led_n_2", "17", 2),
  makeLed("led_n_3", "18", 3),
  makeLed("led_n_4", "19", 4),
  makeLed("led_n_5", "20", 5),
  makeLed("rgb_led", "79"),
];

const TANG_NANO_9K_BUTTONS: BoardPin[] = [
  makeButton("user_btn_n_0", "3", 0, true),
  makeButton("user_btn_n_1", "4", 1, true),
];

const TANG_NANO_20K_BUTTONS: BoardPin[] = [
  makeButton("btn_0", "88", 0),
  makeButton("btn_1", "87", 1),
];

const TANG_NANO_9K_PINS: BoardPin[] = [
  ...TANG_NANO_9K_LEDS,
  ...TANG_NANO_9K_BUTTONS,
  { name: "serial_rx", signal: "uart_rx", pin: "18", type: "uart", group: "Serial", verified: true },
  { name: "serial_tx", signal: "uart_tx", pin: "17", type: "uart", group: "Serial", verified: true },
  { name: "spiflash_cs_n", signal: "spi_cs_n", pin: "60", type: "spi", group: "SPI Flash", activeLow: true, verified: true },
  { name: "spiflash_clk", signal: "spi_clk", pin: "59", type: "spi", group: "SPI Flash", verified: true },
  { name: "spiflash_miso", signal: "spi_miso", pin: "62", type: "spi", group: "SPI Flash", verified: true },
  { name: "spiflash_mosi", signal: "spi_mosi", pin: "61", type: "spi", group: "SPI Flash", verified: true },
  { name: "sdcard_clk", signal: "sdcard_clk", pin: "36", type: "spi", group: "SDCard", verified: true },
  { name: "lcd_clk", signal: "lcd_clk", pin: "35", type: "gpio", group: "LCD", verified: true },
  { name: "hdmi_clk_p", signal: "hdmi_clk_p", pin: "69", type: "gpio", group: "HDMI", verified: true },
];

const TANG_NANO_20K_PINS: BoardPin[] = [
  ...TANG_NANO_20K_LEDS,
  ...TANG_NANO_20K_BUTTONS,
  { name: "serial_rx", signal: "uart_rx", pin: "70", type: "uart", group: "Serial", verified: true },
  { name: "serial_tx", signal: "uart_tx", pin: "69", type: "uart", group: "Serial", verified: true },
  { name: "spiflash_cs_n", signal: "spi_cs_n", pin: "60", type: "spi", group: "SPI Flash", activeLow: true, verified: true },
  { name: "spiflash_clk", signal: "spi_clk", pin: "59", type: "spi", group: "SPI Flash", verified: true },
  { name: "spiflash_miso", signal: "spi_miso", pin: "62", type: "spi", group: "SPI Flash", verified: true },
  { name: "spiflash_mosi", signal: "spi_mosi", pin: "61", type: "spi", group: "SPI Flash", verified: true },
  { name: "sdcard_clk", signal: "sdcard_clk", pin: "83", type: "spi", group: "SDCard", verified: true },
  { name: "hdmi_clk_p", signal: "hdmi_clk_p", pin: "33", type: "gpio", group: "HDMI", verified: true },
  { name: "hdmi_scl", signal: "hdmi_scl", pin: "52", type: "i2c", group: "HDMI", verified: true },
  { name: "hdmi_sda", signal: "hdmi_sda", pin: "53", type: "i2c", group: "HDMI", verified: true },
];

function makeTangNanoBoard({
  id,
  name,
  device,
  fpgaId,
  leds,
  buttons,
  pins,
}: {
  id: string;
  name: string;
  device: string;
  fpgaId: string;
  leds: BoardPin[];
  buttons: BoardPin[];
  pins: BoardPin[];
}): BoardDefinition {
  return {
    id,
    name,
    vendor: "Sipeed",
    family: "Gowin",
    device,
    package: "QN88",
    fpgaId,
    constraintsFile: "cst",
    synthesisFlow: "gowin",
    toolchain: {
      synth: "gowin",
      placeRoute: "gowin",
      program: "openFPGALoader",
    },
    clocks: [
      { name: "clk27", pin: id === "tang-nano-9k" ? "52" : "4", frequency: 27000000, verified: true },
    ],
    pins,
    leds,
    buttons,
    notes:
      "Pin mapping based on the LiteX Tang Nano platform. Gowin synthesis and bitstream generation are not wired in the app yet.",
  };
}

export const butterstickBoards: BoardDefinition[] = [
  createButterstickVariant("25F"),
  createButterstickVariant("45F"),
  createButterstickVariant("85F"),
];

export const ecpix5Boards: BoardDefinition[] = [
  createEcpix5Variant("45F"),
  createEcpix5Variant("85F"),
];

export const tangNanoBoards: BoardDefinition[] = [
  makeTangNanoBoard({
    id: "tang-nano-9k",
    name: "Tang Nano 9K",
    device: "GW1NR-9C",
    fpgaId: "gw1nr-lv9qn88pc6-i5",
    leds: TANG_NANO_9K_LEDS,
    buttons: TANG_NANO_9K_BUTTONS,
    pins: TANG_NANO_9K_PINS,
  }),
  makeTangNanoBoard({
    id: "tang-nano-20k",
    name: "Tang Nano 20K",
    device: "GW2AR-18C",
    fpgaId: "gw2ar-lv18qn88c8-i7",
    leds: TANG_NANO_20K_LEDS,
    buttons: TANG_NANO_20K_BUTTONS,
    pins: TANG_NANO_20K_PINS,
  }),
];
