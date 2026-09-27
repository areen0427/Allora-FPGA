import { useEffect, useState } from "react";
import type { BoardDefinition } from "../data/boards";
import { getBuildPreflight } from "../lib/buildPreflight";
import { hasTauriInvoke } from "../lib/tauri";
import { virtualFpgaApi } from "../lib/virtualFpga";
import type { ProjectFile } from "../pages/dashboard/types";

export function useBuildPreflight(
  board: BoardDefinition,
  files: ProjectFile[],
  topLevelFileName: string | null,
  dirtyFileNames: string[] = [],
) {
  const nativeAvailable = hasTauriInvoke();
  const [yosysAvailable, setYosysAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!nativeAvailable) return;
    let cancelled = false;
    void virtualFpgaApi
      .detectTools()
      .then((tools) => {
        if (!cancelled) setYosysAvailable(tools.yosys.available);
      })
      .catch(() => {
        if (!cancelled) setYosysAvailable(null);
      });
    return () => {
      cancelled = true;
    };
  }, [nativeAvailable]);

  return getBuildPreflight({
    board,
    files,
    topLevelFileName,
    dirtyFileNames,
    nativeAvailable,
    yosysAvailable,
  });
}
