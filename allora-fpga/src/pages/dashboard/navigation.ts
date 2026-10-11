import type { DashboardSection, ExecutionTarget } from "./types";

export function sectionAfterTargetChange(
  target: ExecutionTarget,
  current: DashboardSection,
  requested?: DashboardSection,
): DashboardSection {
  if (requested) return requested;
  if (current === "chat") return "chat";
  return target === "simulate" ? "peripheral-workbench" : "editor";
}
