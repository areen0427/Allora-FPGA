export type DashboardSection =
  | "editor"
  | "board"
  | "synthesis"
  | "testbench"
  | "pin-mapping"
  | "health"
  | "bitstream";

export type ProjectFile = {
  name: string;
  content: string;
  path?: string;
  isBinary?: boolean;
};
