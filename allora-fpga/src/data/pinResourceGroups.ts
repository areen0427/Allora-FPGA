import type { BoardDefinition, BoardPin } from "./boards";

export type PinBrowserResourceGroup = {
  title: string;
  detail: string;
  pins: Array<{
    key: string;
    name: string;
    pin: string;
    type: string;
    symbol: string;
    detail?: string;
    assignable?: boolean;
  }>;
};

/** Preserve fractional oscillator frequencies, including 32.768 kHz clocks. */
export function formatClockFrequency(frequency: number) {
  if (!Number.isFinite(frequency) || frequency <= 0) return "Unknown frequency";
  if (frequency >= 1_000_000) return `${frequency / 1_000_000} MHz`;
  if (frequency >= 1_000) return `${frequency / 1_000} kHz`;
  return `${frequency} Hz`;
}

/** Reserved pads stay reserved through every alternate connector/signal alias. */
export function getUnavailableBoardPads(
  board: Pick<BoardDefinition, "pins" | "clocks">,
) {
  const pads = new Map<string, string>();
  for (const pin of board.pins)
    if (pin.type === "flash") pads.set(pin.pin, "Configuration flash");
  for (const clock of board.clocks)
    if (clock.role === "reference") {
      for (const pad of [clock.pin, clock.differentialPin])
        if (pad) pads.set(pad, "Dedicated reference clock");
    }
  return pads;
}

/** Shared by project setup, the read-only catalog and workspace pin mapping. */
export function getResourceGroupsForBrowser(
  board: BoardDefinition,
): PinBrowserResourceGroup[] {
  const groups = new Map<string, PinBrowserResourceGroup>();
  const unavailablePads = getUnavailableBoardPads(board);
  function addPin(
    groupTitle: string,
    groupDetail: string,
    pin: PinBrowserResourceGroup["pins"][number],
  ) {
    const group = groups.get(groupTitle) ?? {
      title: groupTitle,
      detail: groupDetail,
      pins: [],
    };
    group.pins.push(pin);
    groups.set(groupTitle, group);
  }
  for (const clock of board.clocks) {
    addPin("Clocks", "Clock sources and pin aliases", {
      key: `clock:${clock.name}`,
      name: clock.name,
      pin:
        clock.pin ??
        (clock.source === "internal-hfosc" ? "Internal" : "Unknown"),
      type: "clock",
      symbol: "CLK",
      assignable: Boolean(
        clock.verified &&
        clock.pin &&
        clock.pin !== "unknown" &&
        clock.role !== "reference" &&
        !unavailablePads.has(clock.pin),
      ),
      detail: [
        formatClockFrequency(clock.frequency),
        clock.role === "reference" ? "Dedicated reference clock" : null,
        clock.differentialPin
          ? `Differential pair ${clock.pin} / ${clock.differentialPin}`
          : null,
        clock.ioStandard,
        clock.verified ? null : "Unverified",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  const pins = new Map<string, BoardPin>();
  for (const pin of [...board.pins, ...board.leds, ...board.buttons]) {
    if (
      pin.type === "clock" &&
      board.clocks.some((clock) => clock.pin === pin.pin)
    )
      continue;
    pins.set(`${pin.name}:${pin.pin}`, pin);
  }
  for (const pin of pins.values()) {
    const title = getResourceGroupTitle(pin);
    addPin(title, pin.group ?? getPinTypeLabel(pin.type), {
      key: `pin:${pin.name}:${pin.pin}`,
      name: pin.name,
      pin: pin.pin,
      type: pin.type,
      symbol: getResourceSymbol(pin),
      assignable: Boolean(
        pin.verified &&
        pin.pin &&
        pin.pin !== "unknown" &&
        !unavailablePads.has(pin.pin),
      ),
      detail:
        [
          pin.signal,
          pin.ioStandard,
          pin.type === "led" || pin.type === "button"
            ? pin.activeLow === true
              ? "Active low"
              : pin.activeLow === false
                ? "Active high"
                : "Polarity not documented"
            : null,
          pin.verified ? null : "Unverified",
        ]
          .filter(Boolean)
          .join(" · ") || pin.name,
    });
  }
  return [...groups.values()].sort(
    (a, b) =>
      getResourceOrder(a.title) - getResourceOrder(b.title) ||
      a.title.localeCompare(b.title),
  );
}

function getResourceGroupTitle(pin: {
  type: string;
  group?: string;
  signal?: string;
}) {
  if (pin.type === "clock") return "Clocks";
  if (pin.type === "led") return "LEDs";
  if (pin.type === "button") return "Buttons / Reset";
  // Preserve named peripherals/connectors rather than collapsing every serial
  // interface on a board into a single misleading peripheral count.
  if (pin.group) return pin.group;
  if (pin.type === "uart") return "UART";
  if (pin.type === "spi" || pin.type === "flash") return "SPI / Flash";
  if (pin.type === "i2c") return "I2C";
  if (pin.signal?.toLowerCase().includes("usb")) return "USB / Special";
  if (pin.type === "gpio") return "GPIO";
  return "Other";
}

function getResourceOrder(title: string) {
  const order = [
    "Clocks",
    "LEDs",
    "Buttons / Reset",
    "UART",
    "SPI / Flash",
    "I2C",
    "GPIO",
    "USB / Special",
  ];
  const index = order.indexOf(title);
  return index === -1 ? 100 : index;
}

function getResourceSymbol(pin: {
  type: string;
  activeLow?: boolean;
  group?: string;
  signal?: string;
}) {
  if (pin.type === "clock") return "CLK";
  if (pin.type === "led") return "LED";
  if (pin.type === "button")
    return /rst|reset/i.test(`${pin.signal ?? ""} ${pin.group ?? ""}`)
      ? "RST"
      : "BTN";
  if (pin.type === "uart") return "URT";
  if (pin.type === "spi" || pin.type === "flash") return "SPI";
  if (pin.type === "i2c") return "I2C";
  if (/usb/i.test(`${pin.group ?? ""} ${pin.signal ?? ""}`)) return "USB";
  if (pin.type === "gpio") return "IO";
  return "PIN";
}

function getPinTypeLabel(type: string) {
  if (type === "led") return "User outputs";
  if (type === "button") return "User inputs";
  if (type === "uart") return "Serial";
  if (type === "spi" || type === "flash") return "Serial bus";
  if (type === "i2c") return "Two-wire bus";
  if (type === "gpio") return "General I/O";
  return "Board resources";
}

export function getPinTypeColor(type: string) {
  if (type === "clock")
    return {
      background: "var(--ui-control-active-bg)",
      color: "var(--ui-accent-text)",
    };
  if (type === "led") return { background: "#fef3c7", color: "#b45309" };
  if (type === "button") return { background: "#fee2e2", color: "#b91c1c" };
  if (["uart", "spi", "flash", "i2c"].includes(type))
    return { background: "#f0fdf4", color: "#15803d" };
  if (type === "unknown") return { background: "#f5f3ff", color: "#6d28d9" };
  return { background: "var(--ui-control-bg)", color: "var(--ui-text-muted)" };
}
