export type DashboardSection =
  | "editor"
  | "board"
  | "synthesis"
  | "testbench"
  | "pin-mapping"
  | "health"
  | "bitstream"
  | "programming"
  | "serial";

export type ProjectFile = {
  name: string;
  content: string;
  path?: string;
  isBinary?: boolean;
};
