export type DashboardSection =
  | "editor"
  | "board"
  | "constraints"
  | "synthesis"
  | "bitstream";

export type ProjectFile = {
  name: string;
  content: string;
};