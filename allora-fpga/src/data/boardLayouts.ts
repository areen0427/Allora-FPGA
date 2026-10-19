import type { BoardDefinition, BoardPin } from "./boardTypes";
import {
  formatClockFrequency,
  getResourceGroupsForBrowser,
} from "./pinResourceGroups";

/**
 * Every physical board uses the same schematic resource layout, generated from
 * the catalog. This is a resource map, not a claim about PCB placement. Virtual
 * FPGA simulation has its own UI and is deliberately unaffected.
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
  | { kind: "button"; x: number; y: number; pinName: string; label?: string }
  | { kind: "pin"; x: number; y: number; pinName: string }
  | { kind: "clock"; x: number; y: number; clockName: string; label?: string }
  | {
      kind: "chip";
      x: number;
      y: number;
      w: number;
      h: number;
      label: string;
      sublabel?: string;
    }
  | { kind: "usb"; x: number; y: number; w: number; h: number; label?: string }
  | {
      kind: "header";
      x: number;
      y: number;
      w: number;
      h: number;
      label?: string;
      resource?: boolean;
    };

export type BoardLayout = {
  width: number;
  height: number;
  handcrafted: boolean;
  components: LayoutComponent[];
};

export function getBoardLayout(
  board: BoardDefinition,
  compact = false,
): BoardLayout {
  return board.id === "allora-virtual"
    ? buildVirtualLayout(board)
    : buildAutoLayout(board, compact);
}

/** No component count is capped: adding a catalog entry updates every view. */
export function buildAutoLayout(
  board: BoardDefinition,
  compact = false,
): BoardLayout {
  const width = 128;
  const components: LayoutComponent[] = [
    {
      kind: "chip",
      x: 8,
      y: 9,
      w: 30,
      h: 22,
      label: board.family,
      sublabel: board.device,
    },
  ];
  const leds = uniquePins(board.leds);
  const buttons = uniquePins(board.buttons);
  const ledRows = Math.ceil(leds.length / 10);
  const buttonStart = 18 + ledRows * 8;
  leds.forEach((led, index) =>
    components.push({
      kind: "led",
      x: 49 + (index % 10) * 7.5,
      y: 13 + Math.floor(index / 10) * 8,
      pinName: led.name,
      label: compactLabel(led, "D", index),
      color: inferLedColor(led),
    }),
  );
  buttons.forEach((button, index) =>
    components.push({
      kind: "button",
      x: 49 + (index % 8) * 10,
      y: buttonStart + Math.floor(index / 8) * 9,
      pinName: button.name,
      label: compactLabel(button, "B", index),
    }),
  );
  board.clocks.forEach((clock, index) =>
    components.push({
      kind: "clock",
      x: 9 + (index % 2) * 17,
      y: 38 + Math.floor(index / 2) * 11,
      clockName: clock.name,
      label: formatClockFrequency(clock.frequency),
    }),
  );

  let nextY = Math.max(
    52,
    39 + Math.ceil(board.clocks.length / 2) * 11,
    buttonStart + Math.ceil(buttons.length / 8) * 9 + 5,
  );
  const peripheralGroups = getResourceGroupsForBrowser(board)
    .map((group) => ({
      ...group,
      pins: group.pins.filter(
        (pin) =>
          !["led", "button"].includes(pin.type) &&
          (pin.type !== "clock" || pin.key.startsWith("pin:")),
      ),
    }))
    .filter((group) => group.pins.length > 0);
  const columns = compact ? 4 : 3;
  const columnWidth = compact ? 30 : 40;
  for (let row = 0; row < peripheralGroups.length; row += columns) {
    const rowGroups = peripheralGroups.slice(row, row + columns);
    const rowHeight = compact
      ? 8
      : Math.max(
          ...rowGroups.map(
            (group) => 11 + Math.ceil(group.pins.length / 10) * 3.4,
          ),
        );
    rowGroups.forEach((group, column) => {
      const x = 6 + column * columnWidth;
      components.push({
        kind: "header",
        x,
        y: nextY,
        w: columnWidth - 4,
        h: rowHeight,
        label: `${group.title} · ${group.pins.length}`,
        resource: true,
      });
      if (!compact)
        group.pins.forEach((pin, index) =>
          components.push({
            kind: "pin",
            x: x + 4 + (index % 10) * 3.1,
            y: nextY + 9 + Math.floor(index / 10) * 3.4,
            pinName: pin.name,
          }),
        );
    });
    nextY += rowHeight + 5;
  }
  return { width, height: nextY + 7, handcrafted: false, components };
}

// Retain the previous empty-target visual; the simulator's interactive canvas
// is independent of this board catalog component.
function buildVirtualLayout(board: BoardDefinition): BoardLayout {
  return {
    width: 100,
    height: 56,
    handcrafted: false,
    components: [
      { kind: "usb", x: 0, y: 23, w: 7, h: 10, label: "USB" },
      {
        kind: "chip",
        x: 26,
        y: 19,
        w: 18,
        h: 18,
        label: "VIRTUAL",
        sublabel: board.device,
      },
      { kind: "header", x: 12, y: 0.5, w: 76, h: 4 },
      { kind: "header", x: 12, y: 51.5, w: 76, h: 4 },
    ],
  };
}

function uniquePins(pins: BoardPin[]) {
  return [
    ...new Map(pins.map((pin) => [`${pin.name}:${pin.pin}`, pin])).values(),
  ];
}

function compactLabel(pin: BoardPin, prefix: string, index: number) {
  const compact = pin.name.replace(/[^a-zA-Z0-9]/g, "");
  return compact.length <= 7 ? compact.toUpperCase() : `${prefix}${index}`;
}

function inferLedColor(led: BoardPin): LedColor {
  const text = `${led.name} ${led.signal ?? ""}`.toLowerCase();
  if (/red|(?:^|_)r(?:_|$)/.test(text)) return "red";
  if (/blue|(?:^|_)b(?:_|$)/.test(text)) return "blue";
  if (/amber|orange|yellow/.test(text)) return "amber";
  if (/white/.test(text)) return "white";
  return "green";
}
