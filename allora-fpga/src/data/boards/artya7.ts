import type { BoardDefinition, BoardPin } from "../boardTypes";

const ARTY_A7_35T_LEDS: BoardPin[] = [
  { name: "ArtyA735T_GPIO_LED[0]_R", signal: "rgb_led0_r", pin: "G6", type: "led", group: "RGB LED 0", verified: true },
  { name: "ArtyA735T_GPIO_LED[0]_G", signal: "rgb_led0_g", pin: "F6", type: "led", group: "RGB LED 0", verified: true },
  { name: "ArtyA735T_GPIO_LED[0]_B", signal: "rgb_led0_b", pin: "E1", type: "led", group: "RGB LED 0", verified: true },
  { name: "ArtyA735T_GPIO_LED[1]_R", signal: "rgb_led1_r", pin: "G3", type: "led", group: "RGB LED 1", verified: true },
  { name: "ArtyA735T_GPIO_LED[1]_G", signal: "rgb_led1_g", pin: "J4", type: "led", group: "RGB LED 1", verified: true },
  { name: "ArtyA735T_GPIO_LED[1]_B", signal: "rgb_led1_b", pin: "G4", type: "led", group: "RGB LED 1", verified: true },
  { name: "ArtyA735T_GPIO_LED[2]_R", signal: "rgb_led2_r", pin: "J3", type: "led", group: "RGB LED 2", verified: true },
  { name: "ArtyA735T_GPIO_LED[2]_G", signal: "rgb_led2_g", pin: "J2", type: "led", group: "RGB LED 2", verified: true },
  { name: "ArtyA735T_GPIO_LED[2]_B", signal: "rgb_led2_b", pin: "H4", type: "led", group: "RGB LED 2", verified: true },
  { name: "ArtyA735T_GPIO_LED[3]_R", signal: "rgb_led3_r", pin: "K1", type: "led", group: "RGB LED 3", verified: true },
  { name: "ArtyA735T_GPIO_LED[3]_G", signal: "rgb_led3_g", pin: "H6", type: "led", group: "RGB LED 3", verified: true },
  { name: "ArtyA735T_GPIO_LED[3]_B", signal: "rgb_led3_b", pin: "K2", type: "led", group: "RGB LED 3", verified: true },
  { name: "ArtyA735T_GPIO_LED[4]", signal: "led4", pin: "H5", type: "led", group: "User LEDs", verified: true },
  { name: "ArtyA735T_GPIO_LED[5]", signal: "led5", pin: "J5", type: "led", group: "User LEDs", verified: true },
  { name: "ArtyA735T_GPIO_LED[6]", signal: "led6", pin: "T9", type: "led", group: "User LEDs", verified: true },
  { name: "ArtyA735T_GPIO_LED[7]", signal: "led7", pin: "T10", type: "led", group: "User LEDs", verified: true },
];

const ARTY_A7_35T_BUTTONS: BoardPin[] = [
  { name: "ArtyA735T_GPIO_Button_CPU_Reset", signal: "cpu_reset", pin: "C2", type: "button", group: "Special Buttons", activeLow: true, verified: true },
];

const ARTY_A7_35T_PINS: BoardPin[] = [
  ...ARTY_A7_35T_LEDS,
  ...ARTY_A7_35T_BUTTONS,
  { name: "ArtyA735T_SystemClock_100MHz", signal: "sys_clk", pin: "E3", type: "clock", group: "System Clock", verified: true },
  { name: "ArtyA735T_SPI_SerialClock", signal: "spi_sck", pin: "F1", type: "spi", group: "SPI Header", verified: true },
  { name: "ArtyA735T_SPI_SlaveSelect", signal: "spi_ss", pin: "C1", type: "spi", group: "SPI Header", verified: true },
  { name: "ArtyA735T_SPI_MOSI", signal: "spi_mosi", pin: "H1", type: "spi", group: "SPI Header", verified: true },
  { name: "ArtyA735T_SPI_MISO", signal: "spi_miso", pin: "G1", type: "spi", group: "SPI Header", verified: true },
  { name: "ArtyA735T_USB_UART_TX", signal: "uart_tx", pin: "A9", type: "uart", group: "USB UART", verified: true },
  { name: "ArtyA735T_USB_UART_RX", signal: "uart_rx", pin: "D10", type: "uart", group: "USB UART", verified: true },
];

function createArtyA7Variant({
  id,
  name,
  device,
  fpgaId,
  pins,
  leds,
  buttons,
  notes,
}: {
  id: string;
  name: string;
  device: string;
  fpgaId: string;
  pins: BoardPin[];
  leds: BoardPin[];
  buttons: BoardPin[];
  notes: string;
}): BoardDefinition {
  return {
    id,
    name,
    vendor: "Digilent",
    family: "Artix-7",
    device,
    package: "CSG324-1L",
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
        name: "sys_clk_100mhz",
        pin: "E3",
        frequency: 100000000,
        verified: id === "arty-a7-35t",
      },
    ],
    pins,
    leds,
    buttons,
    notes,
  };
}

export const artyA735T = createArtyA7Variant({
  id: "arty-a7-35t",
  name: "Arty A7-35T",
  device: "XC7A35T",
  fpgaId: "xc7a35t-csg324-1",
  pins: ARTY_A7_35T_PINS,
  leds: ARTY_A7_35T_LEDS,
  buttons: ARTY_A7_35T_BUTTONS,
  notes:
    "Pin mapping from the provided Arty A7-35T XDC files: 100 MHz system clock, SPI header, CPU reset button, USB UART, RGB LEDs, and user LEDs.",
});

export const artyA7100T = createArtyA7Variant({
  id: "arty-a7-100t",
  name: "Arty A7-100T",
  device: "XC7A100T",
  fpgaId: "xc7a100t-csg324-1",
  pins: [],
  leds: [],
  buttons: [],
  notes:
    "Arty A7-100T metadata is available, but only info.yml was provided. Pin mappings are intentionally left empty until verified XDC files are added.",
});

export const ARTY_A7_BOARDS: BoardDefinition[] = [artyA735T, artyA7100T];
