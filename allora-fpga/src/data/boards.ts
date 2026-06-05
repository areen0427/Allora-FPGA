import type { BoardDefinition } from "./boardTypes";
import { icebreaker } from "./boards/icebreaker";
import { ULX3S_BOARDS } from "./boards/ulx3s";

export type {
  ConstraintFile,
  SynthesisFlow,
  PinType,
  BoardPin,
  BoardClock,
  BoardToolchain,
  BoardDefinition,
} from "./boardTypes";

export const BOARDS = [
  icebreaker,
  {
    id: "ulx3s",
    name: "ULX3S",
    vendor: "Lattice",
    device: "ECP5",
    variants: [
      { id: "ulx3s-12f", name: "ULX3S 12F", fpga: "LFE5U-12F" },
      { id: "ulx3s-25f", name: "ULX3S 25F", fpga: "LFE5U-25F" },
      { id: "ulx3s-45f", name: "ULX3S 45F", fpga: "LFE5U-45F" },
      { id: "ulx3s-85f", name: "ULX3S 85F", fpga: "LFE5U-85F" },
    ],
  },
];

export function getBoardById(id: string): BoardDefinition | undefined {
  if (id === icebreaker.id) return icebreaker;

  return ULX3S_BOARDS.find((board) => board.id === id);
}