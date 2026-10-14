import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { DashboardSection } from "../pages/dashboard/types";
import { projectDiagnostics, diagnosticSourceLabel, type ProjectDiagnostic } from "../lib/projectDiagnostics";
import "./ProjectDiagnostics.css";

type Scope = { projectKey: string; projectPath?: string; boardId?: string; onTroubleshoot: (entry: ProjectDiagnostic) => void };
const Context = createContext<Scope | null>(null);
export function ProjectDiagnosticsProvider({ children, ...scope }: Scope & { children: ReactNode }) {
  return <Context.Provider value={scope}>{children}</Context.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useProjectDiagnostic(source: DashboardSection, message: string | null | undefined, details?: string) {
  const scope = useContext(Context);
  const previous = useRef<{ projectKey: string; id: string } | null>(null);
  const projectKey = scope?.projectKey, projectPath = scope?.projectPath, boardId = scope?.boardId;
  useEffect(() => {
    if (!projectKey) return;
    if (message?.trim()) {
      const entry = projectDiagnostics.report({ projectKey, projectPath, boardId, source, message, details });
      if (entry) previous.current = { projectKey, id: entry.id };
    } else if (previous.current?.projectKey === projectKey) {
      projectDiagnostics.clear(projectKey, previous.current.id);
      previous.current = null;
    }
    // Navigation does not clear an observation; only the source clearing its error does.
  }, [projectKey, projectPath, boardId, source, message, details]);
}
export function ProjectDiagnostic({ source, message, details }: { source: DashboardSection; message?: string | null; details?: string }) {
  useProjectDiagnostic(source, message, details);
  return null;
}
export function TroubleshootButton({ source }: { source: DashboardSection }) {
  const scope = useContext(Context);
  if (!scope) return null;
  return <button type="button" className="project-troubleshoot-button" onClick={() => {
    const entry = projectDiagnostics.recent(scope.projectKey).find(item => item.source === source);
    if (entry) scope.onTroubleshoot(entry);
  }} title={`Troubleshoot this ${diagnosticSourceLabel(source)} error with its diagnostic context`}>
    Troubleshoot in AI Design Studio
  </button>;
}
