import { aiChatApi, type AiChatModel } from "./aiChat";
import { aiIntegrationApi, type AiProviderStatus } from "./aiIntegration";

type CodexReadiness = {
  status: AiProviderStatus;
  models: AiChatModel[];
  modelError: string;
};

let prepared: CodexReadiness | undefined;
let pending: Promise<CodexReadiness> | undefined;

export function readCodexReadiness() {
  return prepared;
}

// Startup, chat, and Settings share one in-flight check and model catalog.
// Explicit Check Again/login polling refreshes account state and model access.
export function prepareCodexReadiness(refresh = false): Promise<CodexReadiness> {
  if (pending) return pending;
  if (prepared && !refresh) return Promise.resolve(prepared);
  pending = (async () => {
    const status = await aiIntegrationApi.status("codex");
    const next: CodexReadiness = { status, models: [], modelError: "" };
    if (status.state === "ready") {
      try { next.models = await aiChatApi.models(); }
      catch (error) { next.modelError = error instanceof Error ? error.message : String(error); }
    }
    prepared = next;
    return next;
  })().finally(() => { pending = undefined; });
  return pending;
}
