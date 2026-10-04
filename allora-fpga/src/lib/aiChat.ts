import { REAL_BOARDS } from "../data/boards";
import { getBoardCapabilities } from "../data/boardCapabilities";
import { createTauriChannel, invokeTauri } from "./tauri";

export type AiChatEvent =
  | { type: "assistant_delta"; delta: string }
  | { type: "tool_started"; id: string; name: string; arguments?: unknown }
  | {
      type: "tool_completed";
      id: string;
      name: string;
      result?: unknown;
      isError?: boolean;
    }
  | {
      type: "approval_required";
      requestId: string;
      title: string;
      description?: string;
      details?: unknown;
    }
  | { type: "turn_completed"; threadId?: string }
  | { type: "error"; message: string }
  | { type: "project_created"; projectPath: string; projectName?: string }
  | { type: "status"; message: string };

export type AiChatModel = {
  model: string;
  displayName: string;
  isDefault: boolean;
  description: string;
  contextWindow: number | null;
  defaultReasoningEffort: string | null;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[];
};

export type AiChatSession = { sessionId: string; threadId: string };

function eventChannel(onEvent: (event: AiChatEvent) => void) {
  const channel = createTauriChannel(onEvent);
  if (!channel)
    throw new Error("Open the Allora desktop app to chat with Codex.");
  return channel;
}

export const aiChatApi = {
  models: () => invokeTauri<AiChatModel[]>("ai_chat_models"),
  start: (
    workspacePath: string,
    threadId: string | undefined,
    model: string,
    onEvent: (event: AiChatEvent) => void,
  ) =>
    invokeTauri<AiChatSession>("ai_chat_start", {
      request: {
        workspacePath,
        threadId,
        model,
        boards: REAL_BOARDS.map((board) => ({
          ...board,
          capabilities: getBoardCapabilities(board),
        })),
      },
      onEvent: eventChannel(onEvent),
    }),
  send: (
    sessionId: string,
    text: string,
    model: string | undefined,
    reasoningEffort: string | undefined,
    onEvent: (event: AiChatEvent) => void,
  ) =>
    invokeTauri<void>("ai_chat_send", {
      request: { sessionId, text, model, reasoningEffort },
      onEvent: eventChannel(onEvent),
    }),
  cancel: (sessionId: string) =>
    invokeTauri<void>("ai_chat_cancel", { sessionId }),
  approve: (sessionId: string, requestId: string, approved: boolean) =>
    invokeTauri<void>("ai_chat_approve", { sessionId, requestId, approved }),
  close: (sessionId: string) =>
    invokeTauri<void>("ai_chat_close", { sessionId }),
};
