import { useEffect, useMemo, useState } from "react";
import type { BoardDefinition } from "../data/boards";
import { getBoardToolRequirements, type DetectedTool } from "../lib/toolchainReadiness";
import { hasTauriInvoke, invokeTauri } from "../lib/tauri";

export function useToolchainReadiness(board: BoardDefinition) {
  const requirements = useMemo(() => getBoardToolRequirements(board), [board]);
  const commandsKey = JSON.stringify(requirements.map((tool) => tool.command));
  const nativeAvailable = hasTauriInvoke();
  const [revision, setRevision] = useState(0);
  const requestKey = `${commandsKey}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    tools: DetectedTool[];
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!nativeAvailable) return;
    let cancelled = false;
    void invokeTauri<DetectedTool[]>("detect_toolchain_tools", {
      request: { commands: JSON.parse(commandsKey) as string[] },
    }).then((tools) => {
      if (!cancelled) setResult({ key: requestKey, tools });
    }).catch((error: unknown) => {
      if (!cancelled) setResult({
        key: requestKey,
        tools: [],
        error: error instanceof Error ? error.message : "Unable to detect local tools. Try checking again.",
      });
    });
    return () => { cancelled = true; };
  }, [commandsKey, requestKey, nativeAvailable]);

  const current = result?.key === requestKey ? result : null;
  return {
    requirements,
    tools: current?.tools ?? [],
    checking: nativeAvailable && !current,
    nativeAvailable,
    error: current?.error,
    recheck: () => setRevision((value) => value + 1),
  };
}
