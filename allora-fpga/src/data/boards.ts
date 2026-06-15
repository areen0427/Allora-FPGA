import type { BoardCatalogItem, BoardDefinition } from "./boardTypes";
import { ac701 } from "./boards/ac701";
import { ARTY_A7_BOARDS } from "./boards/artya7";
import { COLORLIGHT_I5_BOARDS, colorlightI9Plus } from "./boards/colorlight";
import { fomuPvt } from "./boards/fomu";
import { icebreaker } from "./boards/icebreaker";
import { icesugarV15 } from "./boards/icesugar";
import {
  litexCatalogBoardGroups,
  litexCatalogBoards,
} from "./boards/litexCatalog";
import {
  butterstickBoards,
  ecpix5Boards,
  icesugarPro,
  tangNanoBoards,
} from "./boards/litexDerived";
import {
  iceVWireless,
  icebreakerBitsyBoards,
  icepiZeroBoards,
  kosagiNetV2Boards,
  latticeEcp5Evn,
  latticeIce40Up5kEvn,
  latticeVersaEcp5,
  sqrlAcornBoards,
  sqrlFk33,
  trellisBoard,
} from "./boards/litexAdditional";
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
  BoardCatalogItem,
  BoardDefinition,
  BoardGroupDefinition,
  BoardProgrammer,
  BoardVariant,
  ProgrammerBackend,
} from "./boardTypes";

export const REAL_BOARDS: BoardDefinition[] = [
  ac701,
  fomuPvt,
  icebreaker,
  iceVWireless,
  latticeIce40Up5kEvn,
  icesugarPro,
  icesugarV15,
  latticeEcp5Evn,
  latticeVersaEcp5,
  orangecrab,
  sqrlFk33,
  trellisBoard,
  colorlightI9Plus,
  ...butterstickBoards,
  ...COLORLIGHT_I5_BOARDS,
  ...ecpix5Boards,
  ...icebreakerBitsyBoards,
  ...icepiZeroBoards,
  ...kosagiNetV2Boards,
  ...litexCatalogBoards,
  ...sqrlAcornBoards,
  ...tangNanoBoards,
  ...ARTY_A7_BOARDS,
  ...ULX3S_BOARDS,
  ...TINYFPGA_BOARDS,
];

export const BOARDS: BoardCatalogItem[] = [
  ac701,
  fomuPvt,
  icebreaker,
  iceVWireless,
  latticeIce40Up5kEvn,
  icesugarPro,
  icesugarV15,
  latticeEcp5Evn,
  latticeVersaEcp5,
  orangecrab,
  sqrlFk33,
  trellisBoard,
  ...litexCatalogBoardGroups,
  {
    id: "icebreaker-bitsy",
    name: "iCEBreaker Bitsy",
    vendor: "1BitSquared",
    device: "iCE40UP5K",
    variants: [
      {
        id: "icebreaker-bitsy-v0",
        name: "iCEBreaker Bitsy V0",
        fpga: "ICE40-UP5K",
      },
      {
        id: "icebreaker-bitsy-v1",
        name: "iCEBreaker Bitsy V1",
        fpga: "ICE40-UP5K",
      },
    ],
  },
  {
    id: "icepi-zero",
    name: "iCEpi Zero",
    vendor: "iCEpi",
    device: "ECP5",
    variants: [
      { id: "icepi-zero-25f", name: "iCEpi Zero 25F", fpga: "LFE5U-25F" },
      { id: "icepi-zero-45f", name: "iCEpi Zero 45F", fpga: "LFE5U-45F" },
    ],
  },
  {
    id: "kosagi-netv2",
    name: "Kosagi NetV2",
    vendor: "Kosagi",
    device: "Artix-7",
    variants: [
      { id: "kosagi-netv2-a7-35", name: "Kosagi NetV2 A7-35", fpga: "XC7A35T" },
      {
        id: "kosagi-netv2-a7-100",
        name: "Kosagi NetV2 A7-100",
        fpga: "XC7A100T",
      },
    ],
  },
  {
    id: "sqrl-acorn",
    name: "SQRL Acorn",
    vendor: "SQRL",
    device: "Artix-7",
    variants: [
      {
        id: "sqrl-acorn-cle-101",
        name: "SQRL Acorn CLE-101",
        fpga: "XC7A100T",
      },
      {
        id: "sqrl-acorn-cle-215",
        name: "SQRL Acorn CLE-215",
        fpga: "XC7A200T",
      },
      {
        id: "sqrl-acorn-cle-215plus",
        name: "SQRL Acorn CLE-215+",
        fpga: "XC7A200T",
      },
    ],
  },
  colorlightI9Plus,
  {
    id: "butterstick",
    name: "ButterStick",
    vendor: "GSD",
    device: "ECP5",
    variants: [
      { id: "butterstick-25f", name: "ButterStick 25F", fpga: "LFE5UM5G-25F" },
      { id: "butterstick-45f", name: "ButterStick 45F", fpga: "LFE5UM5G-45F" },
      { id: "butterstick-85f", name: "ButterStick 85F", fpga: "LFE5UM5G-85F" },
    ],
  },
  {
    id: "colorlight-i5-family",
    name: "Colorlight i5",
    vendor: "Colorlight",
    device: "ECP5",
    variants: [
      { id: "colorlight-i5", name: "Colorlight i5", fpga: "LFE5U-25F" },
      {
        id: "colorlight-i5a-907",
        name: "Colorlight i5A-907",
        fpga: "LFE5U-25F",
      },
    ],
  },
  {
    id: "ecpix-5",
    name: "ECPIX-5",
    vendor: "LambdaConcept",
    device: "ECP5",
    variants: [
      { id: "ecpix-5-45f", name: "ECPIX-5 45F", fpga: "LFE5UM5G-45F" },
      { id: "ecpix-5-85f", name: "ECPIX-5 85F", fpga: "LFE5UM5G-85F" },
    ],
  },
  {
    id: "tang-nano",
    name: "Tang Nano",
    vendor: "Sipeed",
    device: "Gowin",
    variants: [
      { id: "tang-nano-9k", name: "Tang Nano 9K", fpga: "GW1NR-9C" },
      { id: "tang-nano-20k", name: "Tang Nano 20K", fpga: "GW2AR-18C" },
    ],
  },
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

const BOARD_BY_ID = new Map(REAL_BOARDS.map((board) => [board.id, board]));

export function getBoardById(id: string): BoardDefinition | undefined {
  return BOARD_BY_ID.get(id);
}
