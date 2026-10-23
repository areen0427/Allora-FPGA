import type { BoardDefinition } from "../data/boards";
import { getResourceGroupsForBrowser } from "../data/pinResourceGroups";
import {
  getPinMappingElectricalIssues,
  getPinOptions,
  type HdlPort,
} from "../pages/dashboard/pinMappingUtils";

export type PinAssignments = Record<string, string>;
export type PinBus = { name: string; direction: HdlPort["direction"]; ports: HdlPort[] };

/** Keep declaration order: [0:7], [15:8], and [4:4] are all meaningful. */
export function getPinBuses(ports: HdlPort[]): PinBus[] {
  const buses = new Map<string, PinBus>();
  for (const port of ports) {
    if (!port.baseName || !Number.isSafeInteger(port.index) || port.name !== `${port.baseName}[${port.index}]`) continue;
    const bus = buses.get(port.baseName) ?? { name: port.baseName, direction: port.direction, ports: [] };
    bus.ports.push(port);
    buses.set(bus.name, bus);
  }
  return [...buses.values()].filter((bus) => bus.ports.every((port) => port.direction === bus.direction));
}

function supportsDirection(type: string, direction: HdlPort["direction"]) {
  if (type === "gpio") return true;
  if (type === "led") return direction === "output";
  if (type === "button" || type === "clock") return direction === "input";
  // Peripheral aliases do not carry authoritative per-signal direction data.
  return false;
}

export function getBulkPinGroups(board: BoardDefinition, direction: HdlPort["direction"]) {
  const options = new Map(getPinOptions(board).map((pin) => [pin.key, pin]));
  return getResourceGroupsForBrowser(board).map((group) => {
    const seen = new Set<string>();
    const pins = group.pins.flatMap((resource) => {
      const pin = options.get(resource.key);
      if (!resource.assignable || !pin || seen.has(pin.pin) || !supportsDirection(pin.type, direction)) return [];
      seen.add(pin.pin);
      return [pin];
    });
    return { title: group.title, pins };
  }).filter((group) => group.pins.length > 0);
}

export type BulkPinChoice = { busName: string; groupTitle: string; start: number; reverse: boolean };

export function previewBulkPinAssignment(
  board: BoardDefinition,
  ports: HdlPort[],
  current: PinAssignments,
  choice: BulkPinChoice,
) {
  const bus = getPinBuses(ports).find((item) => item.name === choice.busName);
  const group = bus ? getBulkPinGroups(board, bus.direction).find((item) => item.title === choice.groupTitle) : undefined;
  const errors: string[] = [];
  if (!bus) errors.push("Choose a declared HDL bus.");
  if (bus && !group) errors.push("Choose a compatible board resource group.");
  const validStart = Number.isInteger(choice.start) && choice.start >= 0;
  const candidates = group && bus && validStart ? group.pins.slice(choice.start, choice.start + bus.ports.length) : [];
  if (group && bus && (!validStart || candidates.length !== bus.ports.length)) errors.push("This selection does not have enough compatible, verified pads for the whole bus.");
  if (choice.reverse) candidates.reverse();
  const options = new Map(getPinOptions(board).map((pin) => [pin.key, pin]));
  const busNames = new Set(bus?.ports.map((port) => port.name));
  const outsideOwners = new Map<string, string[]>();
  for (const port of ports) {
    if (busNames.has(port.name)) continue;
    const pin = options.get(current[port.name]);
    if (pin) outsideOwners.set(pin.pin, [...(outsideOwners.get(pin.pin) ?? []), port.name]);
  }
  const nextMappings = { ...current };
  const rows = (bus?.ports ?? []).map((port, index) => {
    const pin = candidates[index];
    const previousKey = current[port.name] ?? "";
    const conflicts = pin ? outsideOwners.get(pin.pin) ?? [] : [];
    if (pin) nextMappings[port.name] = pin.key;
    if (conflicts.length) errors.push(`${port.name}: pad ${pin.pin} is already used by ${conflicts.join(", ")}.`);
    return { portName: port.name, previousKey, nextKey: pin?.key ?? "", previousLabel: options.get(previousKey)?.shortLabel ?? (previousKey ? "Unavailable assignment" : "Unmapped"), nextLabel: pin?.shortLabel ?? "No pad", conflicts };
  });
  if (bus && candidates.length === bus.ports.length) errors.push(...getPinMappingElectricalIssues(board, bus.ports, nextMappings));
  const changedCount = rows.filter((row) => row.nextKey && row.previousKey !== row.nextKey).length;
  return { rows, errors, nextMappings, changedCount, canApply: errors.length === 0 && changedCount > 0 };
}

export type PinAssignmentHistory = { past: PinAssignments[]; present: PinAssignments; future: PinAssignments[] };
export type PinAssignmentAction =
  | { type: "commit" | "reset"; mappings: PinAssignments }
  | { type: "undo" | "redo" };
export const PIN_ASSIGNMENT_HISTORY_LIMIT = 50;

export function createPinAssignmentHistory(mappings: PinAssignments): PinAssignmentHistory {
  return { past: [], present: { ...mappings }, future: [] };
}

export function pinAssignmentReducer(state: PinAssignmentHistory, action: PinAssignmentAction): PinAssignmentHistory {
  if (action.type === "reset") return createPinAssignmentHistory(action.mappings);
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return { past: [...state.past, state.present].slice(-PIN_ASSIGNMENT_HISTORY_LIMIT), present: state.future[0], future: state.future.slice(1) };
  }
  if (action.type === "commit") {
    const keys = new Set([...Object.keys(state.present), ...Object.keys(action.mappings)]);
    if ([...keys].every((key) => (state.present[key] ?? "") === (action.mappings[key] ?? ""))) return state;
    return { past: [...state.past, state.present].slice(-PIN_ASSIGNMENT_HISTORY_LIMIT), present: { ...action.mappings }, future: [] };
  }
  return state;
}
