import type { BoardDefinition, BoardPin } from "../data/boardTypes";
import { getUnavailableBoardPads } from "../data/pinResourceGroups";
import type { VirtualPeripheral } from "./virtualFpga";

export type VirtualBoardResource = { label: string; count: number; detail?: string };

const SWITCH = /(?:^|[^a-z])(?:sw(?:itch(?:es)?)?|dip)(?:\d|[^a-z]|$)/i;
const RESET = /(?:^|[^a-z])(?:reset|rst)(?:\d|[^a-z]|$)/i;

/** The catalog describes resources, not physical PCB coordinates. Deduplicate
 * pad aliases so alternate connector names never create extra components. */
export function getVirtualBoardResources(board: BoardDefinition) {
  const unavailable = getUnavailableBoardPads(board);
  const pins = new Map<string, BoardPin>();
  for (const pin of [...board.leds, ...board.buttons, ...board.pins]) {
    if (!pin.verified || !pin.pin || pin.pin === "unknown" || (unavailable.has(pin.pin) && pin.type !== "flash")) continue;
    if (!pins.has(pin.pin)) pins.set(pin.pin, pin);
  }
  const peripherals: VirtualPeripheral[] = [];
  const clock = board.clocks.find(item => item.verified && item.role !== "reference");
  if (clock) peripherals.push({
    id: `board:${board.id}:clock:${clock.name}`, type: "clock", label: clock.name,
    signal: null, pad: clock.pin, group: "Clock", frequencyHz: clock.frequency,
  });
  const groups = new Map<string, Set<string>>();
  const groupDetails = new Map<string, Set<string>>();
  for (const pin of pins.values()) {
    const description = `${pin.name} ${pin.signal ?? ""} ${pin.group ?? ""}`;
    const reset = RESET.test(`${pin.name} ${pin.signal ?? ""}`)
      || /^(?:cpu\s+)?reset(?:\s+button)?$/i.test(pin.group ?? "");
    const type = pin.type === "led" ? "led"
      : pin.type === "button" ? (reset ? "reset" : "button")
        : pin.type === "gpio" && SWITCH.test(description) ? "switch" : null;
    if (type) {
      const label = pin.signal && [...pins.values()].filter(item => item.signal === pin.signal).length === 1
        ? pin.signal : pin.name;
      peripherals.push({
        id: `board:${board.id}:${type}:${pin.pin}`, type, label,
        signal: null, activeHigh: pin.activeLow !== true, pad: pin.pin, group: pin.group,
        ...(type === "led" ? { color: ledColor(description) } : {}),
      });
    } else if (pin.type !== "clock") {
      const label = resourceLabel(pin);
      const pads = groups.get(label) ?? new Set<string>();
      pads.add(pin.pin);
      groups.set(label, pads);
      if (pin.group && pin.group !== label) {
        const details = groupDetails.get(label) ?? new Set<string>();
        details.add(pin.group);
        groupDetails.set(label, details);
      }
    }
  }
  const resources: VirtualBoardResource[] = [...groups].map(([label, pads]) => ({ label, count: pads.size,
    ...(groupDetails.has(label) ? { detail: [...groupDetails.get(label)!].join("\n") } : {}),
  }));
  const additionalClocks = board.clocks.filter(item => item.verified && item !== clock);
  resources.push(...additionalClocks.map(item => ({ label: item.name, count: 1 })));
  return { peripherals, resources, clock };
}

function resourceLabel(pin: BoardPin) {
  const group = pin.group?.trim();
  if (!group) return pin.type.toUpperCase();
  if (/^(?:note|warning|caution):/i.test(group) || group.length > 80) {
    if (/inner analog/i.test(group)) return "Inner analog header";
    if (/xadc|analog inputs/i.test(group)) return "Analog header";
    if (/digital I\/O/i.test(group)) return "Digital header";
    return pin.type === "gpio" ? "GPIO header" : pin.type.toUpperCase();
  }
  return group;
}

function ledColor(description: string) {
  if (/(?:^|[_\s])(?:r|red)(?:\d|[_\s]|$)/i.test(description)) return "red";
  if (/(?:^|[_\s])(?:b|blue)(?:\d|[_\s]|$)/i.test(description)) return "blue";
  if (/amber|orange|yellow/i.test(description)) return "amber";
  if (/white/i.test(description)) return "white";
  return "green";
}
