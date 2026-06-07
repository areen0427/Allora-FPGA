import type { BoardDefinition } from "./boardTypes";
import { ac701 } from "./boards/ac701";
import { ARTY_A7_BOARDS } from "./boards/artya7";
import { fomuPvt } from "./boards/fomu";
import { icebreaker } from "./boards/icebreaker";
import { icesugarV15 } from "./boards/icesugar";
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
  BoardCapability,
  BoardCapabilities,
  BoardDefinition,
} from "./boardTypes";

export const BOARDS = [
  ac701,
  fomuPvt,
  icebreaker,
  icesugarV15,
  orangecrab,
  {
    id: "arty-a7",
    name: "Arty A7",
    vendor: "Digilent",
    device: "Artix-7",
    variants: [
      { id: "arty-a7-35t", name: "Arty A7-35T", fpga: "XC7A35T" },
      { id: "arty-a7-100t", name: "Arty A7-100T", fpga: "XC7A100T" },
    ],
  },
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
  if (id === ac701.id) return ac701;
  if (id === fomuPvt.id) return fomuPvt;
  if (id === icebreaker.id) return icebreaker;
  if (id === icesugarV15.id) return icesugarV15;
  if (id === orangecrab.id) return orangecrab;

  return [...ARTY_A7_BOARDS, ...ULX3S_BOARDS, ...TINYFPGA_BOARDS].find((board) => board.id === id);
}
