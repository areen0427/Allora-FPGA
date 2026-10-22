import { chatNotifications } from "../lib/chatNotifications";
import { WorkspaceTitle } from "../components/ui/WorkspaceTitle";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  FolderOpen,
  History,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { chatHistoryDetails, latestProjectChat, loadChatHistory, readChatHistory, saveChatHistory, validChatHistory } from "../lib/chatHistory";
import ChatHistoryPopup from "../components/ChatHistoryPopup";
import { getSavedProjects } from "../data/projects";
import { getBoardById } from "../data/boards";
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
import ChatTaskPanel, { type Activity } from "../components/ChatTaskPanel";
import ChatTurnDetails, { type ChatArtifact } from "../components/ChatTurnDetails";
import { activityLabel } from "../lib/chatActivity";
import { buildContextPrompt, MAX_CONTEXT_PIN_CHARS, type ContextPin } from "../lib/chatContext";
import { subscribeChatPins, takeChatPins } from "../lib/chatPinsBridge";
import { chatCheckpoints, type ChatChangeReview } from "../lib/chatCheckpoints";
import { extractChatArtifacts } from "../lib/chatResults";
import { projectDiagnostics } from "../lib/projectDiagnostics";
import { syncProjectDiagnosticMemory } from "../lib/projectDiagnosticMemory";
import ChatErrorSuggestions from "../components/ChatErrorSuggestions";
import "./ChatPage.css";

type ToolActivity = {
  id: string;
  name: string;
  status: "running" | "complete" | "error";
  input?: string;
  output?: string;
  agentId?: string;
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
  pins?: ContextPin[];
  activities?: Activity[];
  elapsedMs?: number;
  checkpointId?: string;
  changedFiles?: string[];
  checkpointError?: string;
  projectScope?: string;
  artifacts?: ChatArtifact[];
  creationReviewIds?: string[];
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
  onActivateProject?: (path: string) => Promise<void>;
  onOpenArtifact?: (artifact: ChatArtifact) => void | Promise<void>;
  onWorkspaceChanged?: (path: string) => Promise<void>;
  onProjectCreated?: (path: string) => Promise<void>;
  resumeLatest?: boolean;
  initialProjectPath?: string;
  diagnosticsProjectKey?: string;
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

function conversationActivityTime(conversation: Conversation) {
  const timestamp = Date.parse(conversation.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortRecentConversations(items: Conversation[]) {
  return [...items].sort((a, b) => conversationActivityTime(b) - conversationActivityTime(a));
}

function readHistory(value: unknown = readChatHistory()): Conversation[] {
  try {
    return sortRecentConversations((validChatHistory(value) as Conversation[])
      .map((conversation) => ({
        ...conversation,
        title: !conversation.titleManuallyEdited && conversation.title === conversation.messages.find((message) => message.role === "user")?.text.slice(0, 65)
          ? createChatTitle(conversation.messages.find((message) => message.role === "user")!.text)
          : conversation.title,
        messages: conversation.messages.map((message) => ({
          ...message,
          pending: false,
          interrupted: message.pending || message.interrupted,
          activities: message.activities?.map(item => item.status === "running" || item.status === "pending"
            ? { ...item, status: "error" as const, detail: "Session ended before completion was reported." }
            : item),
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
      }))).slice(0, 40);
  } catch {
    return [];
  }
}

export default function ChatPage({
  onActivateProject,
  onOpenArtifact,
  onWorkspaceChanged,
  onProjectCreated,
  resumeLatest = false,
  initialProjectPath,
  diagnosticsProjectKey,
  onOpenSettings,
  onOpenProject,
}: ChatPageProps) {
  const desktopAvailable = hasTauriInvoke();
  const [conversations, setConversationsState] =
    useState<Conversation[]>(readHistory);
  const conversationsRef = useRef(conversations);
  const historyReady = useRef(false);
  const historyLoaded = useRef<Promise<void>>(Promise.resolve());
  const removedConversationIds = useRef(new Set<string>());
  const editedConversationIds = useRef(new Set<string>());
  const historySaveVersion = useRef(0);
  const [historyError, setHistoryError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(() =>
    resumeLatest ? (initialProjectPath
      ? latestProjectChat(conversations, initialProjectPath)
      : [...conversations].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))[0])?.id ?? null : null,
  );
  const historyResume = useRef({ pending: resumeLatest && !activeId, projectPath: initialProjectPath });
  const historyLoadVersion = useRef(0);
  const [workspacePath, setWorkspacePath] = useState(
    () => initialProjectPath ?? conversations.find((item) => item.id === activeId)?.workspacePath ?? getLastProjectParentDirectory() ?? "",
  );
  const [saveDirectory, setSaveDirectory] = useState<string | undefined>();
  const [contextProjectPath, setContextProjectPath] = useState(() => initialProjectPath
    ?? [...(conversations.find(item => item.id === activeId)?.messages ?? [])].reverse().find(message => message.projectPath)?.projectPath
    ?? getSavedProjects().find(project => project.projectPath === workspacePath)?.projectPath);
  const [historyMenuId, setHistoryMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [pins, setPins] = useState<ContextPin[]>([]);
  const creationReviews = useRef(new Map<string, ChatChangeReview>());
  const [activityTick, setActivityTick] = useState(0);
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newChatChoiceOpen, setNewChatChoiceOpen] = useState(false);
  const newChatPopupRef = useRef<HTMLElement>(null);
  const newChatTriggerRef = useRef<HTMLButtonElement>(null);
  const newChatDialogTitleId = useId();
  const newChatDialogDescriptionId = useId();
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const historyPanelId = useId();
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!newChatChoiceOpen) return;
    const popup = newChatPopupRef.current;
    const trigger = newChatTriggerRef.current;
    if (!popup || !trigger) return;
    popup.showPopover();
    function place() {
      if (!popup || !trigger) return;
      const anchor = trigger.getBoundingClientRect();
      const edge = 16;
      const gap = 8;
      popup.style.width = `${Math.min(360, window.innerWidth - edge * 2)}px`;
      const below = window.innerHeight - anchor.bottom - gap - edge;
      const above = anchor.top - gap - edge;
      const opensAbove = below < popup.scrollHeight && above > below;
      popup.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`;
      popup.style.left = `${Math.max(edge, Math.min(anchor.right - popup.offsetWidth, window.innerWidth - popup.offsetWidth - edge))}px`;
      popup.style.top = `${opensAbove ? Math.max(edge, anchor.top - gap - popup.offsetHeight) : anchor.bottom + gap}px`;
      popup.dataset.placement = opensAbove ? "above" : "below";
    }
    place();
    popup.classList.add("glass-unfold");
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      if (popup.matches(":popover-open")) popup.hidePopover();
    };
  }, [newChatChoiceOpen]);
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
  const diagnosticScope = contextProjectPath ?? (initialProjectPath ? undefined : diagnosticsProjectKey) ?? workspacePath;
  useSyncExternalStore(projectDiagnostics.subscribe, projectDiagnostics.revision, projectDiagnostics.revision);
  const currentDiagnostics = diagnosticScope ? projectDiagnostics.recent(diagnosticScope) : [];
  const latestResponse = messages.findLast(message => message.role === "assistant");
  const displayActivity = activity === "Thinking…" || activity === "Working…" || activity === "Responding…" || !activity
    ? activityLabel(undefined, activityTick) : activity;

  useEffect(() => {
    const receive = () => {
      const incoming = takeChatPins();
      if (incoming.length) setPins(current => [...current, ...incoming].map(pin => pin.text.length > MAX_CONTEXT_PIN_CHARS
        ? { ...pin, text: `${pin.text.slice(0, MAX_CONTEXT_PIN_CHARS - 30)}\n[Context truncated]`, label: `${pin.label} (excerpt)` } : pin));
    };
    receive();
    return subscribeChatPins(receive);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setActivityTick(value => value + 1), 3000);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!diagnosticScope || busy || changingConversation) return;
    const prepare = () => {
      const intent = projectDiagnostics.takeIntent(diagnosticScope);
      if (!intent) return;
      setDraft(current => current.trim() ? `${current}\n\n${intent.prompt}` : intent.prompt);
      setNotice("");
      inputRef.current?.focus();
    };
    prepare();
    return projectDiagnostics.subscribeIntent(prepare);
  }, [diagnosticScope, busy, changingConversation]);

  async function openResult(artifact: ChatArtifact) {
    if (busyRef.current || changingConversationRef.current) return;
    try {
      if (onOpenArtifact) await onOpenArtifact(artifact);
      else if (artifact.projectPath) await openProject(artifact.projectPath);
    } catch (error) { setNotice(errorText(error)); }
  }

  const loadTurnReview = useCallback(async (id: string) =>
    creationReviews.current.get(id) ?? await chatCheckpoints.review(id), []);

  const restoreTurnReview = useCallback(async (id: string, projectPath: string) => {
    if (busyRef.current) throw new Error("Wait for the current response before restoring changes.");
    const result = await chatCheckpoints.restore(id);
    const message = `Restored ${result.restored} file${result.restored === 1 ? "" : "s"} to the checkpoint.`;
    try {
      await onWorkspaceChanged?.(projectPath);
      setNotice(message);
    } catch (error) { setNotice(`${message} Could not refresh the editor: ${errorText(error)}`); }
  }, [onWorkspaceChanged]);

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

  const persistConversations = useCallback(async (items = conversationsRef.current) => {
    if (!historyReady.current) return;
    const version = ++historySaveVersion.current;
    try {
      await saveChatHistory(items);
      if (alive.current && version === historySaveVersion.current) setHistoryError("");
    } catch {
      if (alive.current && version === historySaveVersion.current)
        setHistoryError("Chat history is not saved yet. Keep Allora open and retry after freeing device storage.");
    }
  }, []);

  const hydrateHistory = useCallback(async () => {
    const version = ++historyLoadVersion.current;
    try {
      await loadChatHistory();
      if (version !== historyLoadVersion.current) return;
      // Another scoped chat can finish saving while this database read is in
      // flight. Read its authoritative memory snapshot, including deletions.
      const merged = new Map(readHistory(readChatHistory()).filter(chat => !removedConversationIds.current.has(chat.id)).map(chat => [chat.id, chat]));
      // A submit or rename can happen while IndexedDB opens. Prefer the live
      // version, and retain any newly submitted turn instead of overwriting it.
      conversationsRef.current.forEach(chat => {
        const stored = merged.get(chat.id);
        if (!stored || editedConversationIds.current.has(chat.id) || conversationActivityTime(chat) > conversationActivityTime(stored)) merged.set(chat.id, chat);
      });
      const next = sortRecentConversations([...merged.values()]).slice(0, 40);
      conversationsRef.current = next;
      if (alive.current) setConversationsState(next);
      if (alive.current && historyResume.current.pending) {
        historyResume.current.pending = false;
        const selected = historyResume.current.projectPath ? latestProjectChat(next, historyResume.current.projectPath) : next[0];
        if (selected) {
          setActiveId(selected.id);
          setWorkspacePath(selected.workspacePath);
          setContextProjectPath(historyResume.current.projectPath
            ?? [...selected.messages].reverse().find(message => message.projectPath)?.projectPath
            ?? getSavedProjects().find(project => project.projectPath === selected.workspacePath)?.projectPath);
        }
      }
      historyReady.current = true;
      await persistConversations(next);
    } catch {
      if (alive.current && version === historyLoadVersion.current)
        setHistoryError("Saved chats could not be opened. Your current chat is still here. Retry to reconnect device storage.");
    }
  }, [persistConversations]);

  useEffect(() => {
    historyLoaded.current = hydrateHistory();
    const flush = () => { void historyLoaded.current.then(() => persistConversations()); };
    const visibilityChanged = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [hydrateHistory, persistConversations]);

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

  function setConversations(update: (current: Conversation[]) => Conversation[]) {
    const next = update(conversationsRef.current);
    next.forEach(chat => {
      if (conversationsRef.current.find(previous => previous.id === chat.id) !== chat) editedConversationIds.current.add(chat.id);
    });
    conversationsRef.current = next;
    setConversationsState(next);
    if (historyReady.current) void persistConversations(next);
  }

  function updateConversation(
    id: string,
    update: (current: Conversation) => Conversation,
  ) {
    if (!alive.current) return;
    const updatedAt = new Date().toISOString();
    setConversations((current) => {
      const conversation = current.find((item) => item.id === id);
      if (!conversation) return current;
      return [
        { ...update(conversation), updatedAt },
        ...current.filter((item) => item.id !== id),
      ].slice(0, 40);
    });
  }

  async function closeSession() {
    const previous = session.current;
    session.current = null;
    if (previous) await aiChatApi.close(previous.sessionId);
  }

  async function chooseWorkspace() {
    if (interactionLocked) return;
    historyResume.current.pending = false;
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

  function requestNewChat() {
    if (busyRef.current || changingConversationRef.current) return;
    setSidebarOpen(false);
    if (contextProjectPath) setNewChatChoiceOpen(current => !current);
    else void newChat();
  }

  async function newChat(project: "current" | "new" = "current") {
    if (busyRef.current || changingConversationRef.current) return false;
    changingConversationRef.current = true;
    historyResume.current.pending = false;
    setChangingConversation(true);
    try {
      await closeSession();
      if (!alive.current) return false;
      if (project === "new") {
        setContextProjectPath(undefined);
        setWorkspacePath("");
        setSaveDirectory(undefined);
      }
      setActiveId(null);
      setDraft("");
      setPins([]);
      setNotice("");
      setActivity("");
      setApprovals([]);
      newChatPopupRef.current?.hidePopover();
      setNewChatChoiceOpen(false);
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
      changingConversationRef.current
    )
      return;
    changingConversationRef.current = true;
    historyResume.current.pending = false;
    setChangingConversation(true);
    try {
      await closeSession();
      if (!alive.current) return;
      setActiveId(conversation.id);
      setPins([]);
      setWorkspacePath(conversation.workspacePath);
      setSaveDirectory(undefined);
      const projectPath = [...conversation.messages].reverse().find((message) => message.projectPath)?.projectPath
        ?? getSavedProjects().find(project => project.projectPath === conversation.workspacePath)?.projectPath;
      setContextProjectPath(projectPath);
      setDraft("");
      setNotice("");
      setActivity("");
      setApprovals([]);
      if (window.innerWidth <= 760) setSidebarOpen(false);
      followScroll.current = true;
      if (projectPath) await onActivateProject?.(projectPath);
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
    removedConversationIds.current.add(id);
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
      !ready
    )
      return;
    busyRef.current = true;
    historyResume.current.pending = false;
    stopRequested.current = false;
    setBusy(true);
    setDraft("");
    setNotice("");
    setActivity("Connecting to Codex…");
    setApprovals([]);
    followScroll.current = true;
    const conversationId = activeId ?? uid();
    const assistantId = uid();
    const startedAt = Date.now();
    const turnPins = pins;
    const turnSaveDirectory = saveDirectory;
    setSaveDirectory(undefined);
    setPins([]);
    const additions: Message[] = [
      { id: uid(), role: "user", text: prompt, pins: turnPins },
      {
        id: assistantId,
        role: "assistant",
        text: "",
        tools: [],
        activities: [],
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
    let requestDispatched = false;
    let turnProjectPath = contextProjectPath;
    let checkpointId: string | undefined;
    const createdProjects = new Set<string>();
    const onEvent = (event: AiChatEvent) => {
      if (!alive.current) return;
      switch (event.type) {
        case "activity":
          updateMessage(current => ({
            ...current,
            activities: [...(current.activities ?? []).filter(item => item.id !== event.activity.id), event.activity],
          }));
          break;
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
                agentId: event.agentId,
              },
            ],
          }));
          setActivity(activityLabel(event.name));
          break;
        case "tool_completed":
          setStreaming(false);
          setActivity("Thinking…");
          updateMessage((current) => ({
            ...current,
            artifacts: [...new Map([...(current.artifacts ?? []), ...extractChatArtifacts([{ id: event.id, name: event.name, status: event.isError ? "error" : "complete", result: event.result }], event.projectPath ?? turnProjectPath)].map(artifact => [`${artifact.kind}:${artifact.projectPath}:${artifact.path ?? "inline"}`, artifact])).values()],
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
        case "project_directory_required": {
          const activeSession = session.current;
          if (!activeSession || stopRequested.current) break;
          setActivity("Choose where to save your project…");
          void (async () => {
            let path: string | null = null;
            try {
              path = await pickProjectParentDirectory();
            } catch (error) {
              setNotice(errorText(error));
            }
            if (stopRequested.current || session.current !== activeSession) return;
            try {
              await aiChatApi.projectDirectory(activeSession.sessionId, event.requestId, path);
              if (path) saveLastProjectParentDirectory(path);
            } catch (error) {
              setNotice(errorText(error));
            }
          })();
          break;
        }
        case "project_created":
          turnProjectPath = event.projectPath;
          createdProjects.add(event.projectPath);
          updateMessage((current) => ({
            ...current,
            projectPath: event.projectPath,
            projectName: event.projectName,
          }));
          setWorkspacePath(event.projectPath);
          setContextProjectPath(event.projectPath);
          updateConversation(conversationId, (current) => ({ ...current, workspacePath: event.projectPath }));
          void onProjectCreated?.(event.projectPath).catch(error => {
            updateMessage(current => ({ ...current, error: errorText(error) }));
          });
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
          if (event.sessionClosed) session.current = null;
          if (turnProjectPath) void onWorkspaceChanged?.(turnProjectPath).catch(error => setNotice(errorText(error)));
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
      // Save the user request and pending reply before starting native work, so
      // an interrupted connection still leaves an accessible recent chat.
      await historyLoaded.current;
      await persistConversations();
      if (!alive.current || stopRequested.current) return;
      if (!effectiveModel) throw new Error("Load an available Codex model before sending a message.");
      const existingProject = contextProjectPath ?? getSavedProjects().find(project => project.projectPath === workspacePath)?.projectPath;
      if (existingProject) {
        try {
          const checkpoint = await chatCheckpoints.create(existingProject);
          checkpointId = checkpoint.id;
          updateMessage(current => ({ ...current, checkpointId, projectScope: existingProject }));
        } catch (error) {
          updateMessage(current => ({ ...current, checkpointError: `Checkpoint unavailable: ${errorText(error)}` }));
        }
      }
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
      // Refresh the read-only project memory; diagnostic text never becomes a user-message attachment.
      await syncProjectDiagnosticMemory(projectDiagnostics.snapshot());
      if (stopRequested.current) return;
      setActivity("Thinking…");
      requestDispatched = true;
      await aiChatApi.send(session.current.sessionId, `${contextProjectPath ? `Current project: ${JSON.stringify(contextProjectPath)}. Inspect it with get_project_context before making changes.\n` : ""}${turnSaveDirectory ? `The user selected this save parent directory for this request: ${JSON.stringify(turnSaveDirectory)}.\n` : ""}${buildContextPrompt(prompt, turnPins)}`, effectiveModel?.model, reasoningEffort, onEvent, prompt);
    } catch (error) {
      if (!stopRequested.current)
        updateMessage((current) => ({ ...current, error: errorText(error) }));
      const failedSession = session.current;
      session.current = null;
      if (failedSession)
        void aiChatApi.close(failedSession.sessionId).catch(() => {});
    } finally {
      for (const path of createdProjects) {
        try {
          const createdReview = await chatCheckpoints.createdReview(path);
          creationReviews.current.set(createdReview.id, createdReview);
          updateMessage(current => ({ ...current,
            creationReviewIds: [...(current.creationReviewIds ?? []), createdReview.id],
            changedFiles: [...(current.changedFiles ?? []), ...createdReview.files.map(file => `${folderName(path)}/${file.path}`)],
          }));
        } catch (error) {
          updateMessage(current => ({ ...current, checkpointError: `New project review unavailable: ${errorText(error)}` }));
        }
      }
      if (checkpointId) {
        try {
          const changes = await chatCheckpoints.review(checkpointId);
          updateMessage(current => ({ ...current, changedFiles: [...(current.changedFiles ?? []), ...changes.files.map(file => file.path)] }));
        } catch (error) {
          updateMessage(current => ({ ...current, checkpointError: `Change review unavailable: ${errorText(error)}` }));
        }
      }
      if (streamingTimer.current) clearTimeout(streamingTimer.current);
      if (alive.current) setStreaming(false);
      updateMessage((current) => ({
        ...current,
        pending: false,
        elapsedMs: Date.now() - startedAt,
        activities: current.activities?.map(item => item.status === "running" || item.status === "pending"
          ? { ...item, status: "error", detail: `${item.detail ? `${item.detail}\n` : ""}Turn ended before completion was reported.` }
          : item),
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
        if (requestDispatched && !stopRequested.current) chatNotifications.complete();
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
      if (onOpenArtifact) await onOpenArtifact({ id: `project:${path}`, kind: "file", label: "View Project", projectPath: path });
      else await onOpenProject(path);
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

  const historyProjects = sidebarOpen ? getSavedProjects() : [];
  const orderedHistory = [...conversations].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  const visibleHistory = historyExpanded ? orderedHistory : orderedHistory.slice(0, 10);

  return (
    <section
      className="allora-chat"
      aria-label="AI Integration"
    >
      {sidebarOpen && (
        <ChatHistoryPopup id={historyPanelId} anchorRef={historyToggleRef} expanded={historyExpanded}
          onDismiss={() => { setSidebarOpen(false); setHistoryExpanded(false); }}>
          <div className="chat-sidebar-top">
            <strong>
              <History size={16} /> {historyExpanded ? "All chats" : "Recent chats"}
            </strong>
          </div>
          <div className="chat-history-list">
            {conversations.length ? (
              visibleHistory.map((conversation) => {
                const details = chatHistoryDetails(conversation, historyProjects);
                const boardLabel = details.boardId
                  ? getBoardById(details.boardId)?.name ?? details.boardId
                  : details.hasProject ? "Board unavailable" : "No project yet";
                return (
                <div
                  key={conversation.id}
                  ref={historyMenuId === conversation.id ? historyMenuRef : undefined}
                  className={`chat-history-item${activeId === conversation.id ? " active" : ""}`}
                >
                  <button
                    type="button"
                    disabled={interactionLocked}
                    title={conversation.title}
                    onClick={() => { setHistoryMenuId(null); setSidebarOpen(false); setHistoryExpanded(false); void selectConversation(conversation); }}
                  >
                    <MessageSquare size={14} />
                    <span className="chat-history-copy">
                      <span className="chat-history-title">{conversation.title}</span>
                      <span className="chat-history-board">{boardLabel}</span>
                      <time className="chat-history-updated" dateTime={details.updatedDateTime}>Updated {details.updatedLabel}</time>
                    </span>
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
                    <div className="chat-history-options ui-compact-button-group" id={`chat-options-${conversation.id}`} role="group" aria-label="Chat options">
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
                    <form className="chat-history-rename ui-compact-button-group" onSubmit={(event) => {
                      event.preventDefault();
                      const title = renameDraft.trim();
                      if (!title || interactionLocked) return;
                      updateConversation(conversation.id, (current) => ({ ...current, title, titleManuallyEdited: true }));
                      setRenamingId(null);
                    }}>
                      <input autoFocus aria-label="Chat name" value={renameDraft} maxLength={80}
                        disabled={interactionLocked} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRenamingId(null); } }} />
                      <button type="submit" aria-label="Save chat name" disabled={interactionLocked || !renameDraft.trim()}><Check size={14} /></button>
                      <button type="button" aria-label="Cancel rename" onClick={() => setRenamingId(null)}>Cancel</button>
                    </form>
                  )}
                </div>
              );
              })
            ) : (
              <p className="chat-history-empty">
                Your conversations will appear here.
              </p>
            )}
          </div>
          {!historyExpanded && <button type="button" data-glass="off" className="chat-history-more" aria-label="View all chats" onClick={() => { setHistoryMenuId(null); setHistoryExpanded(true); }}><MoreHorizontal size={20} /></button>}
        </ChatHistoryPopup>
      )}

      {newChatChoiceOpen && (
        <section
          ref={newChatPopupRef}
          id={`${newChatDialogTitleId}-popup`}
          popover="auto"
          role="dialog"
          className="welcome-product-info chat-new-project-popup"
          aria-labelledby={newChatDialogTitleId}
          aria-describedby={newChatDialogDescriptionId}
          onToggle={event => { if (event.newState === "closed") setNewChatChoiceOpen(false); }}
        >
          <h2 id={newChatDialogTitleId}>Start a new chat</h2>
          <p id={newChatDialogDescriptionId}>Keep working in <strong title={contextProjectPath}>{folderName(contextProjectPath ?? "")}</strong> or start a new project?</p>
          <div className="chat-new-project-options">
            <button type="button" autoFocus className="ui-button ui-button-secondary" disabled={interactionLocked} onClick={() => void newChat("current")}>
              <FolderOpen size={16} /> Stay in this project
            </button>
            <button type="button" className="ui-button ui-button-primary" disabled={interactionLocked} onClick={() => void newChat("new")}>
              <Plus size={16} /> Start a new project
            </button>
          </div>
        </section>
      )}

      <div className="chat-main">
        <header className="chat-header">
          <div className="chat-header-title">
            <WorkspaceTitle section="chat" />
            <span className="ui-text-muted">{contextProjectPath ? folderName(contextProjectPath) : "No project selected"}</span>
          </div>
          <div className="chat-header-actions">
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
            <div className="chat-conversation-actions ui-compact-button-group">
              <button
                ref={newChatTriggerRef}
                className="ui-button ui-button-secondary"
                type="button"
                onClick={requestNewChat}
                aria-haspopup="dialog"
                aria-expanded={newChatChoiceOpen}
                aria-controls={newChatChoiceOpen ? `${newChatDialogTitleId}-popup` : undefined}
                disabled={interactionLocked}
              >
                <Plus size={15} /> New chat
              </button>
              <button
                ref={historyToggleRef}
                type="button"
                className="ui-button ui-button-secondary"
                aria-expanded={sidebarOpen}
                aria-controls={historyPanelId}
                onClick={() => { setHistoryExpanded(false); setSidebarOpen((current) => !current); }}
              >
                <History size={15} /> Recent chats
              </button>
            </div>
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
                              <span>{toolLabel(tool.name)}{tool.agentId ? " · subagent" : ""}</span>
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
                    {!!message.pins?.length && <div className="chat-pin-list" aria-label="Attached context">
                      {message.pins.map(pin => <span className="chat-pin" key={pin.id} title={pin.text}>{pin.label}</span>)}
                    </div>}
                    {message.role === "assistant" && !message.pending && (
                      <>
                        <ChatTurnDetails tools={message.tools ?? []} artifacts={message.artifacts} elapsedMs={message.elapsedMs}
                          files={message.changedFiles} projectPath={message.projectScope ?? message.projectPath}
                          interrupted={message.interrupted} error={message.error}
                          disabled={interactionLocked} onOpenArtifact={artifact => void openResult(artifact)}
                          reviewIds={[...(message.checkpointId ? [message.checkpointId] : []), ...(message.creationReviewIds ?? [])]}
                          loadReview={loadTurnReview} onRestore={restoreTurnReview} reviewError={message.checkpointError} />
                      </>
                    )}
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
                          <small>View Project</small>
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
                          <span>{approval ? "Waiting for your approval" : displayActivity}</span>
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
          {historyError && (
            <div className="chat-notice" role="alert">
              <AlertCircle size={14} />
              <span>{historyError}</span>
              <button type="button" onClick={() => {
                if (historyReady.current) void persistConversations();
                else historyLoaded.current = hydrateHistory();
              }}>Retry save</button>
            </div>
          )}
          {changingConversation && (
            <div className="chat-active-status" role="status">
              <LoaderCircle size={12} className="spinning" />
              Switching conversations…
            </div>
          )}
          <ChatErrorSuggestions entries={currentDiagnostics} disabled={interactionLocked} onChoose={(_entry, prompt) => {
            setDraft(current => current.trim() ? `${current}\n\n${prompt}` : prompt);
            setNotice("");
            inputRef.current?.focus();
          }} />
          <form
            className={`chat-composer${busy ? " is-busy" : ""}`}
            onPointerDownCapture={event => {
              const control = (event.target as Element).closest<HTMLButtonElement>(".chat-composer-bottom button");
              if (control && !control.disabled) control.focus({ preventScroll: true });
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {!!pins.length && <div className="chat-pin-list" aria-label="Pinned context">
              {pins.map(pin => <span className="chat-pin" key={pin.id}>
                <span title={pin.text}>{pin.label}</span><button type="button" disabled={interactionLocked}
                  onClick={() => setPins(current => current.filter(item => item.id !== pin.id))} aria-label={`Remove ${pin.label}`}><X size={12} /></button>
              </span>)}
            </div>}
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
                    !ready
                  }
                >
                  <ArrowUp size={20} />
                </button>
              )}
            </div>
          </form>

        </div>
      </div>
      <ChatTaskPanel activities={latestResponse?.activities ?? []} tools={latestResponse?.tools ?? []} busy={busy} ultra={provider === "codex" && reasoningEffort === "ultra"} />
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
