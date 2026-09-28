export type DashboardSection =
  | "editor"
  | "peripheral-workbench"
  | "register-builder"
  | "memory-asset-studio"
  | "virtual-fpga"
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
