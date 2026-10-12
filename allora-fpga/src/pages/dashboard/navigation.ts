import type { DashboardSection } from "./types";

export function sectionAfterWorkspaceLaunch(
  current: DashboardSection,
  requested?: DashboardSection,
): DashboardSection {
  if (requested) return requested;
  return current;
}

/** Legacy destinations still open the tool in its new owning workspace. */
export function workspaceOwner(section: DashboardSection): DashboardSection {
  if (section === "health") return "bitstream";
  if (section === "serial") return "programming";
  return section;
}
