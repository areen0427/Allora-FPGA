import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  CircuitBoard,
  Copy,
  FolderOpen,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { createChatTitle } from "../lib/chatTitles";
import { aiChatApi } from "../lib/aiChat";
import type { AiChatEvent, AiChatSession, AiChatModel } from "../lib/aiChat";
import { prepareCodexReadiness, readCodexReadiness } from "../lib/codexReadiness";
import type { AiProvider, AiProviderStatus } from "../lib/aiIntegration";
import { hasTauriInvoke } from "../lib/tauri";
import { pickProjectParentDirectory } from "../lib/projectWorkspace";
import {
  getLastProjectParentDirectory,
  saveLastProjectParentDirectory,
} from "../data/settings";
import ChatUsageControls from "../components/ChatUsageControls";
import type { ContextUsage, RateLimits } from "../lib/aiChat";
import ChatProviderSelect from "../components/ChatProviderSelect";
import ChatModelControls from "../components/ChatModelControls";
import { reasoningFor } from "../lib/chatModels";
import "./ChatPage.css";

const HISTORY_KEY = "allora-codex-conversations-v1";
type ToolActivity = {
  id: string;
  name: string;
  status: "running" | "complete" | "error";
  input?: string;
  output?: string;
};
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: ToolActivity[];
  projectPath?: string;
  projectName?: string;
  error?: string;
  interrupted?: boolean;
  pending?: boolean;
};
type Conversation = {
  contextUsage?: ContextUsage;
  id: string;
  title: string;
  titleManuallyEdited?: boolean;
  workspacePath: string;
  threadId?: string;
  messages: Message[];
  updatedAt: string;
};
type Approval = Extract<AiChatEvent, { type: "approval_required" }>;
type ChatPageProps = {
  resumeLatest?: boolean;
  initialProjectPath?: string;
  onOpenSettings: () => void;
  onOpenProject: (path: string) => Promise<void>;
};

function uid() {
  return window.crypto.randomUUID();
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function preview(value: unknown) {
  if (value === undefined) return undefined;
  return (
    typeof value === "string" ? value : JSON.stringify(value, null, 2)
  ).slice(0, 8000);
}
function folderName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function readHistory(): Conversation[] {
  try {
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(HISTORY_KEY) ?? "[]",
    );
    if (!Array.isArray(saved)) return [];
    return saved
      .filter(
        (item): item is Conversation =>
          item &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.workspacePath === "string" &&
          Array.isArray(item.messages) &&
          item.messages.every(
            (message: Message) =>
              message &&
              typeof message.id === "string" &&
              ["user", "assistant"].includes(message.role) &&
              typeof message.text === "string",
          ),
      )
      .slice(0, 40)
      .map((conversation) => ({
        ...conversation,
        title: !conversation.titleManuallyEdited && conversation.title === conversation.messages.find((message) => message.role === "user")?.text.slice(0, 65)
          ? createChatTitle(conversation.messages.find((message) => message.role === "user")!.text)
          : conversation.title,
        messages: conversation.messages.map((message) => ({
          ...message,
          pending: false,
          interrupted: message.pending || message.interrupted,
          tools: message.tools?.map((tool) =>
            tool.status === "running"
              ? {
                  ...tool,
                  status: "error" as const,
                  output: "Session ended before this operation completed.",
                }
              : tool,
          ),
        })),
      }));
  } catch {
    return [];
  }
}

export default function ChatPage({
  resumeLatest = false,
  initialProjectPath,
  onOpenSettings,
  onOpenProject,
}: ChatPageProps) {
  const desktopAvailable = hasTauriInvoke();
  const [conversations, setConversations] =
    useState<Conversation[]>(readHistory);
  const [activeId, setActiveId] = useState<string | null>(() =>
    resumeLatest ? [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .find((conversation) => !initialProjectPath || conversation.workspacePath === initialProjectPath || conversation.messages.some((message) => message.projectPath === initialProjectPath))?.id ?? null : null,
  );
  const [workspacePath, setWorkspacePath] = useState(
    () => initialProjectPath ?? conversations.find((item) => item.id === activeId)?.workspacePath ?? getLastProjectParentDirectory() ?? "",
  );
  const [saveDirectory, setSaveDirectory] = useState<string | undefined>();
  const [contextProjectPath, setContextProjectPath] = useState(initialProjectPath);
  const [historyMenuId, setHistoryMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [provider, setProvider] = useState<AiProvider>("codex");
  const [models, setModels] = useState<AiChatModel[]>(() => readCodexReadiness()?.models ?? []);
  const [loadingModels, setLoadingModels] = useState(() => desktopAvailable && !readCodexReadiness());
  const [modelError, setModelError] = useState(() => readCodexReadiness()?.modelError ?? "");
  const [selectedModel, setSelectedModel] = useState(() => {
    try { return localStorage.getItem("allora-codex-model") ?? "gpt-6.1-sol"; } catch { return "gpt-6.1-sol"; }
  });

  const [preferredReasoning, setPreferredReasoning] = useState(() => {
    try { return localStorage.getItem("allora-codex-reasoning") ?? "medium"; } catch { return "medium"; }
  });
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [changingConversation, setChangingConversation] = useState(false);
  const [status, setStatus] = useState<AiProviderStatus | null>(() => readCodexReadiness()?.status ?? null);
  const [checking, setChecking] = useState(() => desktopAvailable && !readCodexReadiness());
  const [notice, setNotice] = useState("");
  const [rateLimits, setRateLimits] = useState<RateLimits | null>(null);
  const [activity, setActivity] = useState("");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [approving, setApproving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [openingProject, setOpeningProject] = useState(false);
  const session = useRef<(AiChatSession & { conversationId: string; workspacePath: string }) | null>(
    null,
  );
  const alive = useRef(true);
  const busyRef = useRef(false);
  const changingConversationRef = useRef(false);
  const stopRequested = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followScroll = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeId,
  );
  const messages = activeConversation?.messages ?? [];
  const approval = approvals[0];
  const ready = provider === "codex" && desktopAvailable && status?.state === "ready";
  const interactionLocked = busy || changingConversation;
  const effectiveModel = models.find((item) => item.model === selectedModel)
    ?? models.find((item) => item.isDefault) ?? models[0];
  const reasoningEffort = reasoningFor(effectiveModel, preferredReasoning);


  const loadReadiness = useCallback(async (refresh = false) => {
    if (!desktopAvailable) return;
    if (refresh || !readCodexReadiness()) {
      setChecking(true);
      setLoadingModels(true);
    }
    try {
      const next = await prepareCodexReadiness(refresh);
      if (alive.current) {
        setStatus(next.status);
        setModels(next.models);
        setModelError(next.modelError);
        setSelectedModel((previous) => next.models.some((item) => item.model === previous) ? previous : (next.models.find((item) => item.isDefault) ?? next.models[0])?.model ?? "");
      }
    } catch (error) {
      if (alive.current)
        setStatus({
          provider: "codex",
          installed: false,
          authenticated: false,
          state: "error",
          error: errorText(error),
        });
    } finally {
      if (alive.current) {
        setChecking(false);
        setLoadingModels(false);
      }
    }
  }, [desktopAvailable]);

  const checkStatus = useCallback(() => loadReadiness(true), [loadReadiness]);

  useEffect(() => {
    alive.current = true;
    const applyPreparedState = () => { void loadReadiness(); };
    applyPreparedState();
    window.addEventListener("focus", applyPreparedState);
    return () => {
      alive.current = false;
      if (streamingTimer.current) clearTimeout(streamingTimer.current);
      window.removeEventListener("focus", applyPreparedState);
      if (session.current)
        void aiChatApi.close(session.current.sessionId).catch(() => {});
    };
  }, [loadReadiness]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations));
    } catch {
      setNotice(
        "Conversation history could not be saved on this device. The current chat is still available.",
      );
    }
  }, [conversations]);

  useEffect(() => {
    if (followScroll.current)
      bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [conversations, activeId, approval, activity]);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.style.height = "auto";
      input.style.height = `${Math.max(64, Math.min(input.scrollHeight, 180))}px`;
    }
  }, [draft]);

  useEffect(() => {
    if (!historyMenuId) return;
    function dismiss(event: PointerEvent) {
      if (!historyMenuRef.current?.contains(event.target as Node)) setHistoryMenuId(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setHistoryMenuId(null);
    }
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [historyMenuId]);

  function updateConversation(
    id: string,
    update: (current: Conversation) => Conversation,
  ) {
    if (!alive.current) return;
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? { ...update(conversation), updatedAt: new Date().toISOString() }
          : conversation,
      ),
    );
  }

  async function closeSession() {
    const previous = session.current;
    session.current = null;
    if (previous) await aiChatApi.close(previous.sessionId);
  }

  async function chooseWorkspace() {
    if (interactionLocked) return;
    setNotice("");
    try {
      const path = await pickProjectParentDirectory();
      if (path) {
        await closeSession();
        setContextProjectPath(undefined);
        setSaveDirectory(path);
        if (activeId) updateConversation(activeId, (current) => ({ ...current, workspacePath: path, threadId: undefined }));
        setWorkspacePath(path);
        saveLastProjectParentDirectory(path);
      }
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  async function newChat() {
    if (busyRef.current || changingConversationRef.current) return false;
    changingConversationRef.current = true;
    setChangingConversation(true);
    try {
      await closeSession();
      if (!alive.current) return false;
      setActiveId(null);
      setDraft("");
      setNotice("");
      setActivity("");
      setApprovals([]);
      if (window.innerWidth <= 760) setSidebarOpen(false);
      followScroll.current = true;
      inputRef.current?.focus();
      return true;
    } catch (error) {
      if (alive.current) setNotice(errorText(error));
      return false;
    } finally {
      changingConversationRef.current = false;
      if (alive.current) setChangingConversation(false);
    }
  }

  async function selectConversation(conversation: Conversation) {
    if (
      busyRef.current ||
      changingConversationRef.current ||
      conversation.id === activeId
    )
      return;
    changingConversationRef.current = true;
    setChangingConversation(true);
    try {
      await closeSession();
      if (!alive.current) return;
      setActiveId(conversation.id);
      setWorkspacePath(conversation.workspacePath);
      setSaveDirectory(undefined);
      setContextProjectPath([...conversation.messages].reverse().find((message) => message.projectPath)?.projectPath);
      setDraft("");
      setNotice("");
      setActivity("");
      setApprovals([]);
      if (window.innerWidth <= 760) setSidebarOpen(false);
      followScroll.current = true;
    } catch (error) {
      if (alive.current) setNotice(errorText(error));
    } finally {
      changingConversationRef.current = false;
      if (alive.current) setChangingConversation(false);
    }
  }

  async function removeConversation(id: string) {
    if (busyRef.current || changingConversationRef.current) return;
    if (id === activeId && !(await newChat())) return;
    setConversations((current) =>
      current.filter((conversation) => conversation.id !== id),
    );
  }

  async function send(text = draft) {
    const prompt = text.trim();
    if (
      !prompt ||
      busyRef.current ||
      changingConversationRef.current ||
      !ready ||
      !workspacePath
    )
      return;
    busyRef.current = true;
    stopRequested.current = false;
    setBusy(true);
    setDraft("");
    setNotice("");
    setActivity("Connecting to Codex…");
    setApprovals([]);
    followScroll.current = true;
    const conversationId = activeId ?? uid();
    const assistantId = uid();
    const additions: Message[] = [
      { id: uid(), role: "user", text: prompt },
      {
        id: assistantId,
        role: "assistant",
        text: "",
        tools: [],
        pending: true,
      },
    ];
    if (!activeConversation) {
      setActiveId(conversationId);
      setConversations((current) =>
        [
          {
            id: conversationId,
            title: createChatTitle(prompt),
            workspacePath,
            messages: additions,
            updatedAt: new Date().toISOString(),
          },
          ...current,
        ].slice(0, 40),
      );
    } else
      updateConversation(conversationId, (current) => ({
        ...current,
        messages: [...current.messages, ...additions],
      }));

    function updateMessage(update: (current: Message) => Message) {
      updateConversation(conversationId, (current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.id === assistantId ? update(message) : message,
        ),
      }));
    }
    const onEvent = (event: AiChatEvent) => {
      if (!alive.current) return;
      switch (event.type) {
        case "context_usage":
          updateConversation(conversationId, (current) => ({ ...current, contextUsage: event.usage }));
          break;
        case "rate_limits":
          setRateLimits(event.limits);
          break;
        case "assistant_delta":
          setStreaming(true);
          if (streamingTimer.current) clearTimeout(streamingTimer.current);
          streamingTimer.current = setTimeout(() => {
            if (alive.current) setStreaming(false);
          }, 1400);
          updateMessage((current) => ({
            ...current,
            text: current.text + event.delta,
          }));
          setActivity("Responding…");
          break;
        case "tool_started":
          setStreaming(false);
          updateMessage((current) => ({
            ...current,
            tools: [
              ...(current.tools ?? []),
              {
                id: event.id,
                name: event.name,
                status: "running",
                input: preview(event.arguments),
              },
            ],
          }));
          setActivity(toolLabel(event.name));
          break;
        case "tool_completed":
          setStreaming(false);
          setActivity("Thinking…");
          updateMessage((current) => ({
            ...current,
            tools: (current.tools ?? []).map((tool) =>
              tool.id === event.id
                ? {
                    ...tool,
                    status: event.isError ? "error" : "complete",
                    output: preview(event.result),
                  }
                : tool,
            ),
          }));
          break;
        case "approval_required":
          setApprovals((current) =>
            current.some((item) => item.requestId === event.requestId)
              ? current
              : [...current, event],
          );
          setActivity("Waiting for your approval");
          break;
        case "project_created":
          updateMessage((current) => ({
            ...current,
            projectPath: event.projectPath,
            projectName: event.projectName,
          }));
          setWorkspacePath(event.projectPath);
          setContextProjectPath(event.projectPath);
          updateConversation(conversationId, (current) => ({ ...current, workspacePath: event.projectPath }));
          break;
        case "error":
          if (!stopRequested.current)
            updateMessage((current) => ({ ...current, error: event.message }));
          break;
        case "status":
          setStreaming(false);
          setActivity(event.message);
          break;
        case "turn_completed":
          if (event.threadId)
            updateConversation(conversationId, (current) => ({
              ...current,
              threadId: event.threadId,
            }));
          setApprovals([]);
          break;
      }
    };
    try {
      if (!effectiveModel) throw new Error("Load an available Codex model before sending a message.");
      if (
        !session.current ||
        session.current.conversationId !== conversationId || session.current.workspacePath !== workspacePath
      ) {
        await closeSession();
        const started = await aiChatApi.start(
          workspacePath,
          activeConversation?.workspacePath === workspacePath ? activeConversation?.threadId : undefined,
          effectiveModel.model,
          onEvent,
        );
        if (!alive.current) {
          await aiChatApi.close(started.sessionId);
          return;
        }
        session.current = { ...started, conversationId, workspacePath };
        updateConversation(conversationId, (current) => ({
          ...current,
          threadId: started.threadId,
        }));
      }
      if (stopRequested.current) return;
      setActivity("Thinking…");
      await aiChatApi.send(session.current.sessionId, `${contextProjectPath ? `Current project: ${JSON.stringify(contextProjectPath)}. Inspect it with get_project_context before making changes.\n` : ""}${saveDirectory ? `The user selected this save parent directory: ${JSON.stringify(saveDirectory)}.\n` : ""}${prompt}`, effectiveModel?.model, reasoningEffort, onEvent);
    } catch (error) {
      if (!stopRequested.current)
        updateMessage((current) => ({ ...current, error: errorText(error) }));
      const failedSession = session.current;
      session.current = null;
      if (failedSession)
        void aiChatApi.close(failedSession.sessionId).catch(() => {});
    } finally {
      if (streamingTimer.current) clearTimeout(streamingTimer.current);
      if (alive.current) setStreaming(false);
      updateMessage((current) => ({
        ...current,
        pending: false,
        interrupted: stopRequested.current || current.interrupted,
        tools: current.tools?.map((tool) =>
          tool.status === "running"
            ? {
                ...tool,
                status: "error",
                output: "Operation ended before a result was received.",
              }
            : tool,
        ),
      }));
      busyRef.current = false;
      if (alive.current) {
        setBusy(false);
        setActivity("");
        setApprovals([]);
        inputRef.current?.focus();
      }
    }
  }

  async function stop() {
    stopRequested.current = true;
    setActivity("Stopping…");
    if (session.current) {
      const stoppingSession = session.current;
      session.current = null;
      try {
        await aiChatApi.cancel(stoppingSession.sessionId);
      } catch (error) {
        setNotice(`Could not stop Codex: ${errorText(error)}`);
      }
    }
  }

  async function answerApproval(approved: boolean) {
    if (!approval || !session.current || approving) return;
    setApproving(true);
    setNotice("");
    try {
      await aiChatApi.approve(
        session.current.sessionId,
        approval.requestId,
        approved,
      );
      setApprovals((current) =>
        current.filter((item) => item.requestId !== approval.requestId),
      );
      setActivity(approved ? "Continuing…" : "Approval declined");
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setApproving(false);
    }
  }

  async function openProject(path: string) {
    setOpeningProject(true);
    setNotice("");
    try {
      await onOpenProject(path);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setOpeningProject(false);
    }
  }

  const connectionLabel = provider === "claude" ? "Claude Code chat coming soon" : !desktopAvailable
    ? "Desktop required"
    : checking && !status
      ? "Checking Codex"
      : ready
        ? "Codex connected"
        : status?.state === "not_installed"
          ? "Install Codex"
          : status?.state === "installed_not_authenticated"
            ? "Connect your account"
            : "Connection unavailable";
  const connectionDescription = provider === "claude" ? "You can connect your Claude Code account in AI settings. Chat support will be available in a future integration." : !desktopAvailable
    ? "Chat runs in the Allora desktop app using your local Codex connection."
    : status?.state === "not_installed"
      ? "Install the Codex CLI and connect your account in AI Integration settings."
      : status?.state === "installed_not_authenticated"
        ? "Sign in to Codex in AI Integration settings to start chatting."
        : (status?.error ?? "Checking your local Codex connection…");

  return (
    <section
      className={`allora-chat${sidebarOpen ? "" : " sidebar-collapsed"}`}
      aria-label="AI Integration"
    >
      {sidebarOpen && (
        <aside className="chat-sidebar" aria-label="Conversations">
          <div className="chat-sidebar-top">
            <strong>
              <MessageSquare size={17} /> Your chats
            </strong>
            <button
              className="chat-icon-button"
              type="button"
              title="Hide conversations"
              aria-label="Hide conversations"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
          <button
            className="chat-new-button"
            type="button"
            onClick={() => void newChat()}
            disabled={interactionLocked}
          >
            <Plus size={17} /> New chat
          </button>
          <div className="chat-history-list">
            {conversations.length ? (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  ref={historyMenuId === conversation.id ? historyMenuRef : undefined}
                  className={`chat-history-item${activeId === conversation.id ? " active" : ""}`}
                >
                  <button
                    type="button"
                    disabled={interactionLocked}
                    title={conversation.title}
                    onClick={() => { setHistoryMenuId(null); void selectConversation(conversation); }}
                  >
                    <MessageSquare size={14} />
                    <span>{conversation.title}</span>
                  </button>
                  <button
                    type="button"
                    className="chat-history-menu-button"
                    aria-label={`Chat options: ${conversation.title}`}
                    aria-expanded={historyMenuId === conversation.id}
                    aria-controls={`chat-options-${conversation.id}`}
                    disabled={interactionLocked}
                    onClick={() => setHistoryMenuId((current) => current === conversation.id ? null : conversation.id)}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {historyMenuId === conversation.id && (
                    <div className="chat-history-options" id={`chat-options-${conversation.id}`} role="group" aria-label="Chat options">
                      <button type="button" disabled={interactionLocked} onClick={() => {
                        setRenameDraft(conversation.title);
                        setRenamingId(conversation.id);
                        setHistoryMenuId(null);
                      }}><Pencil size={13} /> Rename</button>
                      <button type="button" disabled={interactionLocked} onClick={() => {
                        setHistoryMenuId(null);
                        if (renamingId === conversation.id) setRenamingId(null);
                        void removeConversation(conversation.id);
                      }}><Trash2 size={13} /> Delete</button>
                    </div>
                  )}
                  {renamingId === conversation.id && (
                    <form className="chat-history-rename" onSubmit={(event) => {
                      event.preventDefault();
                      const title = renameDraft.trim();
                      if (!title || interactionLocked) return;
                      updateConversation(conversation.id, (current) => ({ ...current, title, titleManuallyEdited: true }));
                      setRenamingId(null);
                    }}>
                      <input autoFocus aria-label="Chat name" value={renameDraft} maxLength={80}
                        disabled={interactionLocked} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Escape") setRenamingId(null); }} />
                      <button type="submit" aria-label="Save chat name" disabled={interactionLocked || !renameDraft.trim()}><Check size={14} /></button>
                      <button type="button" aria-label="Cancel rename" onClick={() => setRenamingId(null)}><X size={14} /></button>
                    </form>
                  )}
                </div>
              ))
            ) : (
              <p className="chat-history-empty">
                Your conversations will appear here.
              </p>
            )}
          </div>
          <div className="chat-sidebar-footer">
            <CircuitBoard size={17} />
            <span>
              <strong>From idea to hardware</strong>
              <small>Powered by your Codex account</small>
            </span>
          </div>
        </aside>
      )}

      <div className="chat-main">
        <header className="chat-header">
          <div className="chat-header-title">
            <button
              type="button"
              className={`chat-icon-button chat-sidebar-toggle${sidebarOpen ? " is-open" : ""}`}
              aria-label={
                sidebarOpen ? "Hide conversations" : "Show conversations"
              }
              onClick={() => setSidebarOpen((current) => !current)}
            >
              {sidebarOpen ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </button>
            <strong>
              AI Integration
            </strong>
          </div>
          <div className={`chat-connection${ready ? " ready" : ""}`}>
            <i />
            <span>{connectionLabel}</span>
            <button
              type="button"
              className="chat-icon-button"
              disabled={checking}
              aria-label="Check Codex connection"
              onClick={() => void checkStatus()}
            >
              <RefreshCw size={13} className={checking ? "spinning" : ""} />
            </button>
          </div>
        </header>
        <div className="chat-workspace-row">
          <FolderOpen size={14} />
          <span>Workspace</span>
          <button
            type="button"
            title={workspacePath || "Choose a folder for Codex to work in"}
            disabled={
              !desktopAvailable || interactionLocked
            }
            onClick={() => void chooseWorkspace()}
          >
            {workspacePath ? folderName(workspacePath) : "Choose folder"}
            <ChevronRight size={13} />
          </button>
          <small>
            Choose a folder to change workspace
          </small>
        </div>

        <div
          className={`chat-scroll${messages.length === 0 ? " is-empty" : ""}`}
          ref={scrollRef}
          onScroll={() => {
            const element = scrollRef.current;
            if (element)
              followScroll.current =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                100;
          }}
        >
          {messages.length === 0 ? (
            <div className="chat-vibecode">
              <pre className="chat-vibecode-code"><code><span className="chat-vibecode-line"><span className="chat-vibecode-keyword">always</span> @(posedge clock) <span className="chat-vibecode-keyword">begin</span></span>{"\n"}<span className="chat-vibecode-statement">{"     "}<strong><em>VIBECODE;</em></strong></span>{"\n"}<span className="chat-vibecode-line chat-vibecode-keyword">end</span></code></pre>
            </div>
          ) : (
            <div className="chat-messages">
              {messages.map((message, index) => (
                <article
                  key={message.id}
                  className={`chat-message ${message.role}`}
                  aria-label={
                    message.role === "user" ? "Your message" : "Codex response"
                  }
                >
                  <div className="chat-message-content">
                    {!!message.tools?.length && (
                      <details className="chat-tool-group">
                        <summary>
                          <ChevronRight size={14} />
                          <span>Tool activity</span>
                          <small>{message.tools.length} {message.tools.length === 1 ? "operation" : "operations"}</small>
                        </summary>
                        <div className="chat-tool-list">
                        {message.tools.map((tool) => (
                          <details
                            className={`chat-tool ${tool.status}`}
                            key={tool.id}
                          >
                            <summary>
                              {tool.status === "running" ? (
                                <LoaderCircle size={14} className="spinning" />
                              ) : tool.status === "error" ? (
                                <AlertCircle size={14} />
                              ) : (
                                <CheckCircle2 size={14} />
                              )}
                              <span>{toolLabel(tool.name)}</span>
                              <small>
                                {tool.status === "running"
                                  ? "Running"
                                  : tool.status === "error"
                                    ? "Failed"
                                    : "Done"}
                              </small>
                              <ChevronRight size={13} />
                            </summary>
                            <div className="chat-tool-details">
                              {tool.input && (
                                <>
                                  <strong>Input</strong>
                                  <pre>{tool.input}</pre>
                                </>
                              )}
                              {tool.output && (
                                <>
                                  <strong>Result</strong>
                                  <pre>{tool.output}</pre>
                                </>
                              )}
                            </div>
                          </details>
                        ))}
                        </div>
                      </details>
                    )}
                    {message.text &&
                      (message.role === "user" ? (
                        <p className="chat-user-text">{message.text}</p>
                      ) : (
                        <ChatMarkdown text={message.text} />
                      ))}
                    {message.projectPath && (
                      <button
                        className="chat-project-result"
                        type="button"
                        disabled={interactionLocked || openingProject}
                        onClick={() => void openProject(message.projectPath!)}
                      >
                        <FolderOpen size={20} />
                        <span>
                          <strong>
                            {message.projectName ||
                              folderName(message.projectPath)}
                          </strong>
                          <small>Open project in Allora</small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    )}
                    {message.error && (
                      <div className="chat-message-error" role="alert">
                        <AlertCircle size={15} />
                        <span>{message.error}</span>
                        {!busy && index === messages.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setDraft(
                                messages.findLast(
                                  (item) => item.role === "user",
                                )?.text ?? "",
                              );
                              inputRef.current?.focus();
                            }}
                          >
                            <RefreshCw size={13} /> Retry
                          </button>
                        )}
                      </div>
                    )}
                    {message.interrupted && (
                      <small className="chat-interrupted">
                        Response stopped
                      </small>
                    )}
                    {message.role === "assistant" &&
                      message.pending && busy && !streaming &&
                      !message.error && !message.interrupted && (
                        <div className="chat-thinking" role="status" aria-live="polite">
                          <span>{approval ? "Waiting for your approval" : activity && activity !== "Responding…" ? activity : "Thinking…"}</span>
                          <i /><i /><i />
                        </div>
                      )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {approval && (
            <section className="chat-approval" aria-label="Action approval">
              <header>
                <ShieldCheck size={20} />
                <strong>{approval.title}</strong>
              </header>
              {approval.description && <p>{approval.description}</p>}
              {approval.details !== undefined && (
                <pre>{preview(approval.details)}</pre>
              )}
              <div>
                <button
                  type="button"
                  disabled={approving}
                  onClick={() => void answerApproval(false)}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="chat-approve-button"
                  disabled={approving}
                  onClick={() => void answerApproval(true)}
                >
                  {approving ? "Responding…" : "Approve action"}
                </button>
              </div>
            </section>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-composer-area">
          {!ready && (
            <div className="chat-setup-notice">
              <AlertCircle size={17} />
              <span>
                <strong>{connectionLabel}</strong>
                <small>{connectionDescription}</small>
              </span>
              {desktopAvailable && (
                <button type="button" onClick={onOpenSettings}>
                  AI settings <ChevronRight size={13} />
                </button>
              )}
            </div>
          )}
          {notice && (
            <div className="chat-notice" role="alert">
              <AlertCircle size={14} />
              <span>{notice}</span>
              <button
                type="button"
                className="chat-icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={13} />
              </button>
            </div>
          )}
          {ready && !workspacePath && (
            <button
              className="chat-folder-prompt"
              type="button"
              onClick={() => void chooseWorkspace()}
            >
              <FolderOpen size={15} /> Choose a workspace folder to get started{" "}
              <ChevronRight size={14} />
            </button>
          )}
          {(busy || changingConversation) && (
            <div className="chat-active-status" role="status">
              <LoaderCircle size={12} className="spinning" />
              {changingConversation
                ? "Switching conversations…"
                : activity || "Working…"}
            </div>
          )}
          <form
            className={`chat-composer${busy ? " is-busy" : ""}`}
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              aria-label="Message Allora"
              placeholder="Build Anything you Dream..."
              value={draft}
              disabled={interactionLocked}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="chat-composer-bottom">
              <div className="chat-composer-controls">
                <ChatProviderSelect selected={provider} disabled={interactionLocked} desktopAvailable={desktopAvailable}
                  codexStatus={status} onChange={setProvider} />
                {provider === "codex" && <ChatModelControls models={models} selectedModel={selectedModel} reasoningEffort={reasoningEffort}
                  loading={loadingModels} error={modelError} disabled={interactionLocked || loadingModels || !ready || !models.length}
                  onModelChange={(model) => {
                    setSelectedModel(model);
                    const effort = reasoningFor(models.find((item) => item.model === model), preferredReasoning) ?? "medium";
                    setPreferredReasoning(effort);
                    try { localStorage.setItem("allora-codex-model", model); localStorage.setItem("allora-codex-reasoning", effort); } catch { /* Selection remains usable. */ }
                  }}
                  onReasoningChange={(effort) => {
                    setPreferredReasoning(effort);
                    try { localStorage.setItem("allora-codex-reasoning", effort); } catch { /* Selection remains usable. */ }
                  }} />}
              </div>
              {provider === "codex" && <ChatUsageControls usage={activeConversation?.contextUsage} limits={rateLimits}
                available={ready} hasMessages={messages.length > 0} />}
              {busy ? (
                <button
                  type="button"
                  className="chat-send-button stop"
                  aria-label="Stop response"
                  title="Stop response"
                  onClick={() => void stop()}
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="chat-send-button"
                  aria-label="Send message"
                  title="Send message"
                  disabled={
                    interactionLocked ||
                    !draft.trim() ||
                    !ready ||
                    !workspacePath
                  }
                >
                  <ArrowUp size={20} />
                </button>
              )}
            </div>
          </form>
          <p className="chat-composer-caption">
            Allora shows tool activity and asks before programming hardware.{" "}
            <span>Enter to send · Shift + Enter for a new line</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function toolLabel(name: string) {
  return name
    .replace(/^mcp__allora__|^allora[._]/, "")
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function inlineText(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : part.startsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}

function ChatMarkdown({ text }: { text: string }) {
  const blocks = text.split(/```/);
  return (
    <div className="chat-markdown">
      {blocks.map((block, index) => {
        if (index % 2 === 1) {
          const newline = block.indexOf("\n");
          const language = newline >= 0 ? block.slice(0, newline).trim() : "";
          const code =
            newline >= 0 ? block.slice(newline + 1).replace(/\n$/, "") : block;
          return <CodeBlock key={index} language={language} code={code} />;
        }
        return block
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map((paragraph, paragraphIndex) => {
            if (/^#{1,4} /.test(paragraph))
              return (
                <h3 key={`${index}-${paragraphIndex}`}>
                  {inlineText(paragraph.replace(/^#{1,4} /, ""))}
                </h3>
              );
            const lines = paragraph.split("\n");
            if (lines.every((line) => /^\s*[-*] /.test(line)))
              return (
                <ul key={`${index}-${paragraphIndex}`}>
                  {lines.map((line, lineIndex) => (
                    <li key={lineIndex}>
                      {inlineText(line.replace(/^\s*[-*] /, ""))}
                    </li>
                  ))}
                </ul>
              );
            if (lines.every((line) => /^\s*\d+[.)] /.test(line)))
              return (
                <ol key={`${index}-${paragraphIndex}`}>
                  {lines.map((line, lineIndex) => (
                    <li key={lineIndex}>
                      {inlineText(line.replace(/^\s*\d+[.)] /, ""))}
                    </li>
                  ))}
                </ol>
              );
            return (
              <p key={`${index}-${paragraphIndex}`}>{inlineText(paragraph)}</p>
            );
          });
      })}
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="chat-code-block">
      <header>
        <span>{language || "Code"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(code)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </header>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
