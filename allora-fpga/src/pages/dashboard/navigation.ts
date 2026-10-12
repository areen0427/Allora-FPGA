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

/** Projectless dock navigation opens a landing page without selecting a recent project. */
export function welcomeDestination(section: DashboardSection): "pin-mapping" | "build" | "peripheral-workbench" | "memory-asset-studio" | "register-builder" {
  if (section === "pin-mapping" || section === "peripheral-workbench" || section === "memory-asset-studio" || section === "register-builder") return section;
  return "build";
}

export type WorkspaceNavigation = { current: DashboardSection; history: DashboardSection[] };
export type WorkspaceNavigationAction = { type: "visit"; section: DashboardSection } | { type: "back" };

export function workspaceNavigationReducer(state: WorkspaceNavigation, action: WorkspaceNavigationAction): WorkspaceNavigation {
  if (action.type === "back") {
    const previous = state.history.at(-1);
    return previous ? { current: previous, history: state.history.slice(0, -1) } : state;
  }
  if (action.section === state.current) return state;
  return {
    current: action.section,
    history: workspaceOwner(action.section) === workspaceOwner(state.current) ? state.history : [...state.history, state.current],
  };
}
