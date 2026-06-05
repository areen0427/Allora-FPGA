export type DashboardSection =
  | "editor"
  | "board"
  | "synthesis"
  | "pin-mapping"
  | "constraints"
  | "bitstream";

export type ProjectFile = {
  name: string;
  content: string;
};
