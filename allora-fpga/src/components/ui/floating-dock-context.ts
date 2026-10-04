import { createContext, useContext } from "react";

export const DockContext = createContext<(label: string) => number>(() => 1);

export function useDockScale(label: string) {
  return useContext(DockContext)(label);
}
