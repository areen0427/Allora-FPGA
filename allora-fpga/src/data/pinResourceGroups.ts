import type { BoardDefinition } from "./boards";

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
  }>;
};

export function getResourceGroupsForBrowser(
  board: BoardDefinition,
): PinBrowserResourceGroup[] {
  const groups = new Map<string, PinBrowserResourceGroup>();

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

  board.clocks
    .filter((clock) => clock.pin)
    .forEach((clock) =>
      addPin("Clocks", "Clock sources", {
        key: `clock:${clock.name}`,
        name: clock.name,
        pin: clock.pin ?? "",
        type: "clock",
        symbol: "CLK",
        detail: `${Math.round(clock.frequency / 1_000_000)} MHz`,
      }),
    );

  board.pins.forEach((pin) => {
    const title = getResourceGroupTitle(pin);
    addPin(title, pin.group ?? getPinTypeLabel(pin.type), {
      key: `pin:${pin.name}:${pin.pin}`,
      name: pin.name,
      pin: pin.pin,
      type: pin.type,
      symbol: getResourceSymbol(pin),
      detail: pin.signal ?? pin.group ?? pin.name,
    });
  });

  return Array.from(groups.values()).sort(
    (a, b) => getResourceOrder(a.title) - getResourceOrder(b.title),
  );
}

function getResourceGroupTitle(pin: {
  type: string;
  group?: string;
  signal?: string;
}) {
  if (pin.type === "led") return "LEDs";
  if (pin.type === "button") return "Buttons / Reset";
  if (pin.type === "uart") return "UART";
  if (pin.type === "spi" || pin.type === "flash") return "SPI / Flash";
  if (pin.type === "i2c") return "I2C";
  if (
    pin.group?.toLowerCase().includes("usb") ||
    pin.signal?.toLowerCase().includes("usb")
  )
    return "USB / Special";
  if (pin.type === "gpio") return pin.group ?? "GPIO";
  return pin.group ?? "Other";
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
  if (pin.type === "button") return pin.activeLow ? "RST" : "BTN";
  if (pin.type === "uart") return "URT";
  if (pin.type === "spi" || pin.type === "flash") return "SPI";
  if (pin.type === "i2c") return "I2C";
  if (
    pin.group?.toLowerCase().includes("usb") ||
    pin.signal?.toLowerCase().includes("usb")
  )
    return "USB";
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
  if (type === "clock") return { background: "#eff6ff", color: "#2563eb" };
  if (type === "led") return { background: "#fef3c7", color: "#b45309" };
  if (type === "button") return { background: "#fee2e2", color: "#b91c1c" };
  if (type === "uart" || type === "spi" || type === "flash" || type === "i2c")
    return { background: "#f0fdf4", color: "#15803d" };
  if (type === "unknown") return { background: "#f5f3ff", color: "#6d28d9" };
  return { background: "#f8fafc", color: "#475569" };
}
