export type DashboardSection =
  | "editor"
  | "virtual-fpga"
  | "board"
  | "synthesis"
  | "testbench"
  | "pin-mapping"
  | "health"
  | "bitstream"
  | "programming"
  | "serial";

export type ExecutionTarget = "simulate" | "build";

export type ProjectFile = {
  name: string;
  content: string;
  path?: string;
  isBinary?: boolean;
};
