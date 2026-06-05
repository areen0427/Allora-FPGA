import type { BoardDefinition } from "./boardTypes";
import { icebreaker } from "./boards/icebreaker";
import { orangecrab } from "./boards/orangecrab";
import { TINYFPGA_BOARDS } from "./boards/tinyfpga";
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
  orangecrab,
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
  {
    id: "tinyfpga",
    name: "TinyFPGA",
    vendor: "TinyFPGA",
    device: "iCE40-LP8K",
    variants: [
      { id: "tinyfpga-b2", name: "TinyFPGA B2", fpga: "iCE40-LP8K" },
      { id: "tinyfpga-bx", name: "TinyFPGA BX", fpga: "iCE40-LP8K" },
    ],
  },
];

export function getBoardById(id: string): BoardDefinition | undefined {
  if (id === icebreaker.id) return icebreaker;
  if (id === orangecrab.id) return orangecrab;

  return [...ULX3S_BOARDS, ...TINYFPGA_BOARDS].find((board) => board.id === id);
}
