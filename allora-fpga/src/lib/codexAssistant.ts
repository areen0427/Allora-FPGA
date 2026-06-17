import { hasTauriInvoke, invokeTauri } from "./tauri";

export type AssistantAuthStatus =
  | "signed-out"
  | "signing-in"
  | "signed-in"
  | "auth-failed"
  | "unavailable";

export type AssistantAuthState = {
  status: AssistantAuthStatus;
  accountLabel?: string;
  error?: string;
};

export type AssistantMessageRole = "user" | "assistant" | "system";

export type AssistantMessageStatus = "ready" | "sending" | "failed";

export type AssistantMessage = {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: string;
  status: AssistantMessageStatus;
};

export type AssistantSendResult = {
  message: AssistantMessage;
  workspaceChanged: boolean;
};

export type AssistantMode = "ask" | "agent";

export type CodexChatContext = {
  projectPath?: string;
  activeFileName?: string | null;
  mode: AssistantMode;
};

type CodexAuthStatusResponse = {
  available: boolean;
  signedIn: boolean;
  accountLabel?: string;
  details: string;
  codexPath?: string;
};

type CodexPromptResponse = {
  response: string;
  workspaceChanged: boolean;
};

const TAURI_UNAVAILABLE_MESSAGE =
  "Allora Codex requires the desktop app runtime so it can use the user's local Codex session.";

export async function getCodexAuthState(): Promise<AssistantAuthState> {
  if (!hasTauriInvoke()) {
    return {
      status: "unavailable",
      error: TAURI_UNAVAILABLE_MESSAGE,
    };
  }

  const status = await invokeTauri<CodexAuthStatusResponse>(
    "codex_auth_status",
  );
  return mapCodexAuthStatus(status);
}

export async function signInToCodex(): Promise<AssistantAuthState> {
  if (!hasTauriInvoke()) {
    return {
      status: "unavailable",
      error: TAURI_UNAVAILABLE_MESSAGE,
    };
  }

  const status = await invokeTauri<CodexAuthStatusResponse>(
    "start_codex_login",
  );
  return mapCodexAuthStatus(status);
}

export async function signOutOfCodex(): Promise<AssistantAuthState> {
  if (!hasTauriInvoke()) return { status: "signed-out" };

  const status = await invokeTauri<CodexAuthStatusResponse>("codex_logout");
  return mapCodexAuthStatus(status);
}

export async function sendCodexMessage(
  messages: AssistantMessage[],
  prompt: string,
  context: CodexChatContext,
): Promise<AssistantSendResult> {
  if (!hasTauriInvoke()) {
    throw new Error(TAURI_UNAVAILABLE_MESSAGE);
  }

  const framedPrompt = buildCodexPrompt(messages, prompt, context);
  const result = await invokeTauri<CodexPromptResponse>("send_codex_prompt", {
    request: {
      prompt: framedPrompt,
      projectPath: context.projectPath,
      mode: context.mode,
    },
  });

  return {
    message: createAssistantMessage("assistant", result.response),
    workspaceChanged: result.workspaceChanged,
  };
}

export function createAssistantMessage(
  role: AssistantMessageRole,
  content: string,
  status: AssistantMessageStatus = "ready",
): AssistantMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    status,
  };
}

function mapCodexAuthStatus(
  response: CodexAuthStatusResponse,
): AssistantAuthState {
  if (!response.available) {
    return {
      status: "unavailable",
      error: response.details,
    };
  }

  if (response.signedIn) {
    return {
      status: "signed-in",
      accountLabel: response.accountLabel ?? "Signed in with OpenAI",
    };
  }

  return {
    status: "signed-out",
    error: response.details,
  };
}

function buildCodexPrompt(
  messages: AssistantMessage[],
  prompt: string,
  context: CodexChatContext,
) {
  const recentMessages = messages
    .filter((message) => message.status !== "failed")
    .slice(-8)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");

  return [
    "You are Allora Codex, an optional assistant inside the Allora FPGA IDE.",
    "Help with Verilog/SystemVerilog/VHDL, testbenches, Yosys and nextpnr logs, pin constraints, bitstreams, serial debugging, and project cleanup.",
    context.mode === "agent"
      ? "Agent mode is enabled. You may edit files in the project workspace and run local checks when needed. Keep changes scoped to the user's request and summarize changed files."
      : "Ask mode is enabled. Do not modify files; answer in concise, practical guidance for the IDE chat panel.",
    context.activeFileName ? `Active file: ${context.activeFileName}` : null,
    context.projectPath ? `Project path: ${context.projectPath}` : null,
    recentMessages ? `Recent chat:\n${recentMessages}` : null,
    `User prompt:\n${prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
