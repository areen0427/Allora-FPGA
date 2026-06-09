import { BOARDS } from "../data/boards";
import {
  Antenna,
  Badge,
  Binary,
  Blocks,
  Boxes,
  Braces,
  BrainCircuit,
  Cable,
  Cast,
  ChartNetwork,
  CircuitBoard,
  Cpu,
  Database,
  Focus,
  Gamepad2,
  Gauge,
  HardDrive,
  Landmark,
  Layers,
  MemoryStick,
  Milestone,
  Monitor,
  Network,
  Orbit,
  PanelTop,
  Radar,
  RadioTower,
  Rocket,
  Router,
  Satellite,
  ScanLine,
  Server,
  Shield,
  Signal,
  Sparkles,
  SquareStack,
  Tablet,
  Terminal,
  ToyBrick,
  Usb,
  Waypoints,
  Webhook,
  Wifi,
  Workflow,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type BoardCardItem = (typeof BOARDS)[number];

const boardIcons: LucideIcon[] = [
  CircuitBoard,
  Usb,
  Cable,
  Wifi,
  Blocks,
  Zap,
  Sparkles,
  Layers,
  PanelTop,
  Server,
  Network,
  ChartNetwork,
  MemoryStick,
  HardDrive,
  RadioTower,
  Monitor,
  Antenna,
  Radar,
  Satellite,
  Router,
  Signal,
  Cast,
  Tablet,
  Gamepad2,
  ToyBrick,
  BrainCircuit,
  Binary,
  Braces,
  Terminal,
  Workflow,
  Webhook,
  Waypoints,
  SquareStack,
  Boxes,
  Database,
  Gauge,
  Focus,
  ScanLine,
  Orbit,
  Milestone,
  Badge,
  Landmark,
  Shield,
  Rocket,
  Cpu,
];

export function getBoardIcon(board: BoardCardItem): LucideIcon {
  const boardIndex = BOARDS.findIndex((candidate) => candidate.id === board.id);
  const iconIndex = boardIndex >= 0 ? boardIndex : 0;
  return boardIcons[iconIndex % boardIcons.length];
}

export function getBoardIconForBoardId(boardId: string): LucideIcon {
  const board = BOARDS.find((candidate) => {
    if (candidate.id === boardId) return true;
    return "variants" in candidate
      ? candidate.variants.some((variant) => variant.id === boardId)
      : false;
  });

  return board ? getBoardIcon(board) : Cpu;
}
