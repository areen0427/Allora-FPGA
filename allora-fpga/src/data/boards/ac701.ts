import type { BoardDefinition, BoardPin } from "../boardTypes";

const AC701_LEDS: BoardPin[] = [
  {
    name: "AC701_GPIO_LED[0]",
    signal: "led[0]",
    pin: "M26",
    type: "led",
    group: "User LEDs",
    verified: true,
  },
  {
    name: "AC701_GPIO_LED[1]",
    signal: "led[1]",
    pin: "T24",
    type: "led",
    group: "User LEDs",
    verified: true,
  },
  {
    name: "AC701_GPIO_LED[2]",
    signal: "led[2]",
    pin: "T25",
    type: "led",
    group: "User LEDs",
    verified: true,
  },
  {
    name: "AC701_GPIO_LED[3]",
    signal: "led[3]",
    pin: "R26",
    type: "led",
    group: "User LEDs",
    verified: true,
  },
];

const AC701_BUTTONS: BoardPin[] = [
  {
    name: "AC701_GPIO_Button_CPU_Reset",
    signal: "cpu_reset",
    pin: "U4",
    type: "button",
    group: "Special Buttons",
    verified: true,
  },
];

const AC701_PINS: BoardPin[] = [
  ...AC701_LEDS,
  ...AC701_BUTTONS,

  {
    name: "AC701_SystemClock_200MHz_p",
    signal: "sys_clk_p",
    pin: "R3",
    type: "clock",
    group: "System Clock",
    verified: true,
  },
  {
    name: "AC701_SystemClock_200MHz_n",
    signal: "sys_clk_n",
    pin: "P3",
    type: "clock",
    group: "System Clock",
    verified: true,
  },

  {
    name: "AC701_IIC_SerialClock",
    signal: "i2c_scl",
    pin: "N18",
    type: "i2c",
    group: "Main I2C",
    verified: true,
  },
  {
    name: "AC701_IIC_SerialData",
    signal: "i2c_sda",
    pin: "K25",
    type: "i2c",
    group: "Main I2C",
    verified: true,
  },
  {
    name: "AC701_IIC_Switch_Reset_n",
    signal: "i2c_switch_reset_n",
    pin: "R17",
    type: "gpio",
    group: "Main I2C",
    activeLow: true,
    verified: true,
  },

  {
    name: "AC701_USB_UART_TX",
    signal: "uart_tx",
    pin: "T19",
    type: "uart",
    group: "USB UART",
    verified: true,
  },
  {
    name: "AC701_USB_UART_RX",
    signal: "uart_rx",
    pin: "U19",
    type: "uart",
    group: "USB UART",
    verified: true,
  },
  {
    name: "AC701_USB_UART_RTS_n",
    signal: "uart_rts_n",
    pin: "V19",
    type: "uart",
    group: "USB UART",
    activeLow: true,
    verified: true,
  },
  {
    name: "AC701_USB_UART_CTS_n",
    signal: "uart_cts_n",
    pin: "W19",
    type: "uart",
    group: "USB UART",
    activeLow: true,
    verified: true,
  },

  {
    name: "AC701_FanControl_PWM",
    signal: "fan_pwm",
    pin: "J26",
    type: "gpio",
    group: "Fan Control",
    verified: true,
  },
  {
    name: "AC701_FanControl_Tacho",
    signal: "fan_tacho",
    pin: "J25",
    type: "gpio",
    group: "Fan Control",
    verified: true,
  },
];

export const ac701: BoardDefinition = {
  id: "ac701",
  name: "AC701",
  vendor: "Xilinx",
  family: "Artix-7",
  device: "XC7A200T",
  package: "FBG676C",
  fpgaId: "xc7a200t-fbg676-2",
  constraintsFile: "xdc",
  synthesisFlow: "vivado",
  toolchain: {
    synth: "vivado",
    placeRoute: "vivado",
    program: "vivado",
  },
  clocks: [
    {
      name: "sys_clk_200mhz",
      pin: "R3/P3",
      frequency: 200000000,
      verified: true,
    },
  ],
  pins: AC701_PINS,
  leds: AC701_LEDS,
  buttons: AC701_BUTTONS,
  notes:
    "Pin mapping populated from the provided AC701 XDC files: system clock, LEDs, CPU reset button, main I2C, USB UART, and fan control.",
};
