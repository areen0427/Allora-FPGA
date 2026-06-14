import type { BoardDefinition, BoardPin } from "./boardTypes";

/**
 * Stylized board layouts for the virtual board view.
 *
 * Coordinates are abstract units (roughly millimeters). Components reference
 * board database entries by pin name, so a layout never invents pins — it only
 * positions what the board definition already knows about.
 *
 * Hand-crafted layouts are stylized: component placement follows the real
 * board's general arrangement (from public board documentation), but is not
 * dimensionally exact. Boards without a hand-crafted layout get an
 * auto-generated generic layout so every board works.
 */

export type LedColor = "green" | "red" | "blue" | "amber" | "white";

export type LayoutComponent =
  | {
      kind: "led";
      x: number;
      y: number;
      pinName: string;
      label?: string;
      color?: LedColor;
    }
  | {
      kind: "button";
      x: number;
      y: number;
      pinName: string;
      label?: string;
    }
  | {
      kind: "clock";
      x: number;
      y: number;
      clockName: string;
      label?: string;
    }
  | {
      kind: "chip";
      x: number;
      y: number;
      w: number;
      h: number;
      label: string;
      sublabel?: string;
    }
  | {
      kind: "usb";
      x: number;
      y: number;
      w: number;
      h: number;
      label?: string;
    }
  | {
      kind: "header";
      x: number;
      y: number;
      w: number;
      h: number;
      label?: string;
    };

export type BoardLayout = {
  width: number;
  height: number;
  handcrafted: boolean;
  components: LayoutComponent[];
};

type LayoutBuilder = {
  matches: (boardId: string) => boolean;
  build: (board: BoardDefinition) => BoardLayout;
};

export function getBoardLayout(board: BoardDefinition): BoardLayout {
  const builder = HAND_LAYOUTS.find((layout) => layout.matches(board.id));
  return builder ? builder.build(board) : buildAutoLayout(board);
}

// ── Hand-crafted layouts ─────────────────────────────────────────────────

function buildUlx3sLayout(board: BoardDefinition): BoardLayout {
  const components: LayoutComponent[] = [
    { kind: "usb", x: 0, y: 8, w: 7, h: 9, label: "US1" },
    { kind: "usb", x: 0, y: 34, w: 7, h: 9, label: "US2" },
    { kind: "header", x: 10, y: 0.5, w: 74, h: 4, label: "GPIO J1" },
    { kind: "header", x: 10, y: 46.5, w: 74, h: 4, label: "GPIO J2" },
    { kind: "chip", x: 40, y: 17, w: 16, h: 16, label: "ECP5", sublabel: board.device },
    { kind: "header", x: 86, y: 18, w: 7, h: 14, label: "SD" },
  ];

  const clock = board.clocks[0];
  if (clock) {
    components.push({ kind: "clock", x: 34, y: 22, clockName: clock.name, label: "25 MHz" });
  }

  // 8 user LEDs in a row left of the FPGA, matching the real board's strip.
  board.leds.slice(0, 8).forEach((led, index) => {
    components.push({
      kind: "led",
      x: 11 + index * 3.4,
      y: 41,
      pinName: led.name,
      label: `D${index}`,
      color: index < 4 ? "green" : "amber",
    });
  });

  // Power button left, fire buttons center-bottom, direction cluster right.
  const buttonSpots: Record<string, { x: number; y: number; label: string }> = {
    btn0: { x: 11, y: 28, label: "PWR" },
    btn1: { x: 46, y: 41, label: "F1" },
    btn2: { x: 52, y: 41, label: "F2" },
    btn3: { x: 72, y: 33, label: "UP" },
    btn4: { x: 72, y: 43, label: "DN" },
    btn5: { x: 66, y: 38, label: "LT" },
    btn6: { x: 78, y: 38, label: "RT" },
  };

  for (const button of board.buttons) {
    const spot = buttonSpots[button.name];
    if (spot) {
      components.push({
        kind: "button",
        x: spot.x,
        y: spot.y,
        pinName: button.name,
        label: spot.label,
      });
    }
  }

  return { width: 94, height: 51, handcrafted: true, components };
}

function buildIcebreakerLayout(board: BoardDefinition): BoardLayout {
  const components: LayoutComponent[] = [
    { kind: "usb", x: 0, y: 17, w: 7, h: 10, label: "USB" },
    { kind: "chip", x: 26, y: 15, w: 13, h: 13, label: "iCE40", sublabel: "UP5K" },
    { kind: "chip", x: 14, y: 32, w: 8, h: 6, label: "FLASH" },
    { kind: "header", x: 69, y: 3, w: 6, h: 16, label: "PMOD 1A" },
    { kind: "header", x: 69, y: 25, w: 6, h: 16, label: "PMOD 1B" },
    { kind: "header", x: 42, y: 38, w: 16, h: 6, label: "PMOD 2" },
  ];

  const clock = board.clocks[0];
  if (clock) {
    components.push({ kind: "clock", x: 22, y: 10, clockName: clock.name, label: "12 MHz" });
  }

  // RGB LED cluster center-right of the FPGA.
  const ledColors: Record<string, LedColor> = {
    rgb_red: "red",
    rgb_green: "green",
    rgb_blue: "blue",
  };
  board.leds.forEach((led, index) => {
    components.push({
      kind: "led",
      x: 48,
      y: 12 + index * 5,
      pinName: led.name,
      label: led.name.replace("rgb_", "").toUpperCase().slice(0, 1),
      color: ledColors[led.name] ?? "green",
    });
  });

  const userButton = board.buttons[0];
  if (userButton) {
    components.push({
      kind: "button",
      x: 56,
      y: 19,
      pinName: userButton.name,
      label: "uBTN",
    });
  }

  return { width: 76, height: 44, handcrafted: true, components };
}

function buildOrangeCrabLayout(board: BoardDefinition): BoardLayout {
  // Feather form factor: long and narrow, USB-C on the short edge.
  const components: LayoutComponent[] = [
    { kind: "usb", x: 0, y: 8.5, w: 6, h: 8, label: "USB-C" },
    { kind: "chip", x: 18, y: 6, w: 13, h: 13, label: "ECP5", sublabel: board.device },
    { kind: "chip", x: 35, y: 8, w: 9, h: 9, label: "DDR3" },
    { kind: "header", x: 8, y: 0.5, w: 40, h: 3.5, label: "IO" },
    { kind: "header", x: 8, y: 21, w: 40, h: 3.5, label: "IO" },
  ];

  const clock = board.clocks[0];
  if (clock) {
    components.push({ kind: "clock", x: 14, y: 17, clockName: clock.name, label: "48 MHz" });
  }

  const ledColors: Record<string, LedColor> = {
    led_rgb_r: "red",
    led_rgb_g: "green",
    led_rgb_b: "blue",
  };
  board.leds.forEach((led, index) => {
    components.push({
      kind: "led",
      x: 8.5,
      y: 7 + index * 4,
      pinName: led.name,
      label: led.name.slice(-1).toUpperCase(),
      color: ledColors[led.name] ?? "green",
    });
  });

  const buttonSpots: Record<string, { x: number; y: number; label: string }> = {
    usr_btn: { x: 46.5, y: 18.5, label: "BTN" },
    rst_n: { x: 46.5, y: 6.5, label: "RST" },
  };
  for (const button of board.buttons) {
    const spot = buttonSpots[button.name];
    if (spot) {
      components.push({
        kind: "button",
        x: spot.x,
        y: spot.y,
        pinName: button.name,
        label: spot.label,
      });
    }
  }

  return { width: 51, height: 25, handcrafted: true, components };
}

function buildTinyFpgaBxLayout(board: BoardDefinition): BoardLayout {
  // Small DIP-style stick, USB on the top short edge.
  const components: LayoutComponent[] = [
    { kind: "usb", x: 5.5, y: 0, w: 7, h: 5, label: "USB" },
    { kind: "chip", x: 5, y: 12, w: 8, h: 8, label: "iCE40", sublabel: "LP8K" },
    { kind: "chip", x: 5.5, y: 24, w: 7, h: 5, label: "FLASH" },
    { kind: "header", x: 0.5, y: 6, w: 2.5, h: 28, label: "1-13" },
    { kind: "header", x: 15, y: 6, w: 2.5, h: 28, label: "14-24" },
  ];

  const clock = board.clocks[0];
  if (clock) {
    components.push({ kind: "clock", x: 4, y: 9, clockName: clock.name, label: "16 MHz" });
  }

  const led = board.leds[0];
  if (led) {
    components.push({ kind: "led", x: 12.5, y: 8.5, pinName: led.name, label: "LED", color: "green" });
  }

  return { width: 18, height: 36, handcrafted: true, components };
}

const HAND_LAYOUTS: LayoutBuilder[] = [
  { matches: (id) => id.startsWith("ulx3s"), build: buildUlx3sLayout },
  { matches: (id) => id === "icebreaker", build: buildIcebreakerLayout },
  { matches: (id) => id.startsWith("orangecrab"), build: buildOrangeCrabLayout },
  { matches: (id) => id === "tinyfpga-bx", build: buildTinyFpgaBxLayout },
];

// ── Auto-generated fallback ──────────────────────────────────────────────

/**
 * Generic layout for boards without a hand-crafted one: USB on the left,
 * FPGA in the middle, LEDs in rows top-right, buttons bottom-right.
 * Functional for pin mapping and playback even if it doesn't match the
 * physical board.
 */
export function buildAutoLayout(board: BoardDefinition): BoardLayout {
  const ledCount = Math.min(board.leds.length, 16);
  const buttonCount = Math.min(board.buttons.length, 8);
  const width = 100;
  const height = 56;

  const components: LayoutComponent[] = [
    { kind: "usb", x: 0, y: height / 2 - 5, w: 7, h: 10, label: "USB" },
    {
      kind: "chip",
      x: 26,
      y: height / 2 - 9,
      w: 18,
      h: 18,
      label: board.family.split(" ")[0].toUpperCase(),
      sublabel: board.device,
    },
    { kind: "header", x: 12, y: 0.5, w: width - 24, h: 4 },
    { kind: "header", x: 12, y: height - 4.5, w: width - 24, h: 4 },
  ];

  const clock = board.clocks[0];
  if (clock) {
    components.push({
      kind: "clock",
      x: 19,
      y: height / 2 + 4,
      clockName: clock.name,
      label: clock.frequency ? `${Math.round(clock.frequency / 1_000_000)} MHz` : undefined,
    });
  }

  const ledsPerRow = 8;
  board.leds.slice(0, ledCount).forEach((led, index) => {
    const row = Math.floor(index / ledsPerRow);
    const column = index % ledsPerRow;
    components.push({
      kind: "led",
      x: 54 + column * 4.6,
      y: 12 + row * 6,
      pinName: led.name,
      label: ledLabel(led, index),
      color: inferLedColor(led),
    });
  });

  board.buttons.slice(0, buttonCount).forEach((button, index) => {
    components.push({
      kind: "button",
      x: 54 + index * 9,
      y: 38,
      pinName: button.name,
      label: buttonLabel(button, index),
    });
  });

  return { width, height, handcrafted: false, components };
}

function ledLabel(led: BoardPin, index: number) {
  const compact = led.name.replace(/[^a-zA-Z0-9]/g, "");
  if (compact.length <= 4) return compact.toUpperCase();
  return `D${index}`;
}

function buttonLabel(button: BoardPin, index: number) {
  const text = `${button.name} ${button.signal ?? ""} ${button.group ?? ""}`.toLowerCase();
  if (text.includes("rst") || text.includes("reset")) return "RST";
  const compact = button.name.replace(/[^a-zA-Z0-9]/g, "");
  if (compact.length <= 4) return compact.toUpperCase();
  return `B${index}`;
}

function inferLedColor(led: BoardPin): LedColor {
  const text = `${led.name} ${led.signal ?? ""} ${led.group ?? ""}`.toLowerCase();
  if (/(^|[^a-z])r(ed)?([^a-z]|$)|_r$|red/.test(text) && text.includes("rgb")) return "red";
  if (text.includes("red")) return "red";
  if (text.includes("blue")) return "blue";
  if (text.includes("amber") || text.includes("orange") || text.includes("yellow")) return "amber";
  return "green";
}
