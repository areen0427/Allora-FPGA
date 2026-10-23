import { REAL_BOARDS, VIRTUAL_BOARD } from "../data/boards";
import { getBoardCapabilities } from "../data/boardCapabilities";
import type { ChatHdlLanguage } from "../data/settings";
import { createTauriChannel, invokeTauri } from "./tauri";

export type ContextUsage = { last: { totalTokens: number }; modelContextWindow: number | null };
export type RateWindow = { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null };
export type RateLimits = { limitId?: string | null; primary: RateWindow | null; secondary: RateWindow | null };
export type AccountUsage = { rateLimits: RateLimits; rateLimitsByLimitId?: Record<string, RateLimits> | null };

export type AiChatEvent =
  | { type: "activity"; activity: import("../components/ChatTaskPanel").Activity }
  | { type: "context_usage"; usage: ContextUsage }
  | { type: "rate_limits"; limits: RateLimits }
  | { type: "assistant_delta"; delta: string }
  | { type: "project_directory_required"; requestId: string }
  | { type: "tool_started"; id: string; name: string; arguments?: unknown; agentId?: string; projectPath?: string }
  | {
      type: "tool_completed";
      id: string;
      name: string;
      result?: unknown;
      isError?: boolean;
      agentId?: string;
      projectPath?: string;
    }
  | {
      type: "approval_required";
      requestId: string;
      title: string;
      description?: string;
      details?: unknown;
    }
  | { type: "turn_completed"; threadId?: string; sessionClosed?: boolean; interrupted?: boolean }
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

export type ChatMode = "edit" | "discuss";
export type AiChatSession = { sessionId: string; threadId: string; mode?: ChatMode };

function eventChannel(onEvent: (event: AiChatEvent) => void) {
  const channel = createTauriChannel(onEvent);
  if (!channel)
    throw new Error("Open the Allora desktop app to chat with Codex.");
  return channel;
}

export const aiChatApi = {
  usage: () => invokeTauri<AccountUsage>("ai_chat_usage"),
  models: () => invokeTauri<AiChatModel[]>("ai_chat_models"),
  start: (
    workspacePath: string,
    threadId: string | undefined,
    model: string,
    onEvent: (event: AiChatEvent) => void,
    mode: ChatMode = "edit",
  ) =>
    invokeTauri<AiChatSession>("ai_chat_start", {
      request: {
        workspacePath,
        threadId,
        model,
        mode,
        boards: [...REAL_BOARDS, VIRTUAL_BOARD].map((board) => ({
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
    userText?: string,
    mode: ChatMode = "edit",
    language: ChatHdlLanguage = "verilog",
  ) =>
    invokeTauri<void>("ai_chat_send", {
      request: { sessionId, text, model, reasoningEffort, userText, mode, language },
      onEvent: eventChannel(onEvent),
    }),
  cancel: (sessionId: string) =>
    invokeTauri<void>("ai_chat_cancel", { sessionId }),
  approve: (sessionId: string, requestId: string, approved: boolean) =>
    invokeTauri<void>("ai_chat_approve", { sessionId, requestId, approved }),
  projectDirectory: (sessionId: string, requestId: string, path: string | null) =>
    invokeTauri<void>("ai_chat_project_directory", { sessionId, requestId, path }),
  close: (sessionId: string) =>
    invokeTauri<void>("ai_chat_close", { sessionId }),
};
