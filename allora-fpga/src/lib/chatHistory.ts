type ChatHistoryEntry = {
  workspacePath: string;
  messages: { projectPath?: string }[];
  updatedAt?: string;
};
type ProjectSummary = { projectPath?: string; boardId: string };

export function chatHistoryDetails(chat: ChatHistoryEntry, projects: ProjectSummary[]) {
  const projectPath = [...chat.messages].reverse().find(message => message.projectPath)?.projectPath;
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");
  const latestPath = projectPath ?? chat.workspacePath;
  const project = latestPath ? projects.find(item => item.projectPath && normalize(item.projectPath) === normalize(latestPath)) : undefined;
  const updated = chat.updatedAt ? new Date(chat.updatedAt) : null;
  const validDate = updated && Number.isFinite(updated.getTime()) ? updated : null;
  return {
    boardId: project?.boardId,
    hasProject: Boolean(projectPath || project),
    updatedLabel: validDate?.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) ?? "Date unavailable",
    updatedDateTime: validDate?.toISOString(),
  };
}


export const CHAT_HISTORY_KEY = "allora-codex-conversations-v1";
export const CHAT_HISTORY_INDEX_KEY = "allora-codex-conversations-index-v2";

type SavedMessage = { id: string; role: "user" | "assistant"; text: string; projectPath?: string };
export type SavedConversation = {
  id: string;
  title: string;
  workspacePath: string;
  messages: SavedMessage[];
  updatedAt?: string;
};
type HistorySnapshot = { version: 2; savedAt: number; conversations: SavedConversation[] };
const HISTORY_DATABASE = "allora-chat-history";
const HISTORY_STORE = "history";
let databasePromise: Promise<IDBDatabase> | undefined;
let memoryHistory: SavedConversation[] | undefined;
let lastSavedAt = 0;

export function validChatHistory(value: unknown): SavedConversation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((chat): chat is SavedConversation => chat
    && typeof chat.id === "string" && typeof chat.title === "string"
    && typeof chat.workspacePath === "string" && Array.isArray(chat.messages)
    && chat.messages.every((message: Partial<SavedMessage>) => message
      && typeof message.id === "string" && (message.role === "user" || message.role === "assistant")
      && typeof message.text === "string"))
    .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0)).slice(0, 40);
}

function snapshot(value: unknown): HistorySnapshot | undefined {
  if (Array.isArray(value)) return { version: 2, savedAt: 0, conversations: validChatHistory(value) };
  if (!value || typeof value !== "object" || !("conversations" in value) || !Array.isArray(value.conversations)) return undefined;
  return { version: 2, savedAt: "savedAt" in value && typeof value.savedAt === "number" ? value.savedAt : 0,
    conversations: validChatHistory(value.conversations) };
}

function localSnapshot() {
  try { return snapshot(JSON.parse(window.localStorage.getItem(CHAT_HISTORY_KEY) ?? "null")); }
  catch { return undefined; }
}

/** Synchronous seed while the larger device database opens. */
export function readChatHistory(): SavedConversation[] {
  return memoryHistory ?? localSnapshot()?.conversations ?? [];
}

function database(): Promise<IDBDatabase> {
  if (!databasePromise) databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(HISTORY_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HISTORY_STORE);
    request.onerror = () => reject(request.error ?? new Error("Chat storage is unavailable."));
    request.onblocked = () => reject(new Error("Another Allora window is updating chat storage. Close that window and retry."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = undefined; };
      resolve(db);
    };
  }).catch(error => { databasePromise = undefined; throw error; });
  return databasePromise;
}

/** Migrate the old localStorage transcript only after a successful database write. */
export async function loadChatHistory(): Promise<SavedConversation[]> {
  const local = localSnapshot();
  try {
    const db = await database();
    const stored = await new Promise<HistorySnapshot | undefined>((resolve, reject) => {
      const transaction = db.transaction(HISTORY_STORE, "readonly");
      const request = transaction.objectStore(HISTORY_STORE).get("conversations");
      request.onsuccess = () => resolve(snapshot(request.result));
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
    lastSavedAt = Math.max(lastSavedAt, local?.savedAt ?? 0, stored?.savedAt ?? 0);
    const latest = local && (!stored || local.savedAt >= stored.savedAt) ? local : stored;
    memoryHistory ??= latest?.conversations ?? [];
    return memoryHistory;
  } catch (error) {
    // A browser without IndexedDB can safely use its local fallback. A failed
    // read of an existing database must never be mistaken for empty history.
    if (typeof window.indexedDB === "undefined") {
      memoryHistory ??= local?.conversations ?? [];
      return memoryHistory;
    }
    throw error;
  }
}

function saveProjectIndex(history: SavedConversation[], savedAt: number) {
  const projects = [...new Set(history.filter(chat => chat.messages.length).flatMap(chat => [chat.workspacePath,
    ...chat.messages.map(message => message.projectPath ?? "")]).filter(Boolean))];
  try { window.localStorage.setItem(CHAT_HISTORY_INDEX_KEY, JSON.stringify({ savedAt, projects })); }
  catch {
    // Do not leave a stale navigation hint for a conversation just deleted.
    try { window.localStorage.removeItem(CHAT_HISTORY_INDEX_KEY); } catch { /* Optional hint. */ }
  }
}

function compactFallback(history: SavedConversation[]) {
  // Keep every message and result card. Raw tool payloads and attachment excerpts
  // duplicate transcript/project data and need not exhaust the browser fallback.
  return history.map(chat => ({ ...chat, messages: chat.messages.map(message => {
    const details = message as SavedMessage & { tools?: Record<string, unknown>[]; pins?: Record<string, unknown>[]; activities?: Record<string, unknown>[] };
    return { ...message,
      tools: details.tools?.map(tool => {
        const summary = { ...tool };
        delete summary.input;
        delete summary.output;
        return summary;
      }),
      pins: details.pins?.map(pin => ({ ...pin, text: typeof pin.text === "string" ? pin.text.slice(0, 1000) : pin.text })),
      activities: details.activities?.map(activity => ({ ...activity, detail: typeof activity.detail === "string" ? activity.detail.slice(0, 1000) : activity.detail })),
    };
  }) }));
}

async function writeHistory(history: SavedConversation[]) {
  const savedAt = Math.max(Date.now(), lastSavedAt + 1);
  lastSavedAt = savedAt;
  const value: HistorySnapshot = { version: 2, savedAt, conversations: history };
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(HISTORY_STORE, "readwrite");
      transaction.objectStore(HISTORY_STORE).put(value, "conversations");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Chat storage is full."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Chat storage was interrupted."));
    });
    // Free the old multi-megabyte quota consumer, then write the tiny sync index.
    try { window.localStorage.removeItem(CHAT_HISTORY_KEY); } catch { /* Optional legacy cleanup. */ }
    saveProjectIndex(history, savedAt);
  } catch (databaseError) {
    try {
      window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify({ ...value, conversations: compactFallback(history) }));
      saveProjectIndex(history, savedAt);
    } catch {
      throw databaseError instanceof Error ? databaseError : new Error("Device chat storage is unavailable.");
    }
  }
}

let pendingSave: { history: SavedConversation[]; waiters: { resolve: () => void; reject: (error: unknown) => void }[] } | undefined;
let saving = false;

/** Serialize writes and coalesce waiting snapshots so old streams cannot replace newer turns. */
export function saveChatHistory(history: SavedConversation[]): Promise<void> {
  memoryHistory = validChatHistory(history);
  return new Promise<void>((resolve, reject) => {
    if (pendingSave) {
      pendingSave.history = memoryHistory!;
      pendingSave.waiters.push({ resolve, reject });
    } else pendingSave = { history: memoryHistory!, waiters: [{ resolve, reject }] };
    if (!saving) void drainSaves();
  });
}

async function drainSaves() {
  saving = true;
  while (pendingSave) {
    const batch = pendingSave;
    pendingSave = undefined;
    try { await writeHistory(batch.history); batch.waiters.forEach(waiter => waiter.resolve()); }
    catch (error) { batch.waiters.forEach(waiter => waiter.reject(error)); }
  }
  saving = false;
}

const normalizeProjectPath = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");

/** Resume only a conversation belonging to this project, never another workspace. */
export function latestProjectChat<T extends ChatHistoryEntry>(chats: T[], projectPath?: string): T | undefined {
  if (!projectPath) return undefined;
  const target = normalizeProjectPath(projectPath);
  return chats.filter(chat => normalizeProjectPath(chat.workspacePath) === target
    || chat.messages.some(message => typeof message.projectPath === "string" && normalizeProjectPath(message.projectPath) === target))
    .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0))[0];
}

export function hasSavedProjectChat(projectPath?: string): boolean {
  if (!projectPath) return false;
  const available = memoryHistory ?? localSnapshot()?.conversations;
  if (available) return Boolean(latestProjectChat(available.filter(chat => chat.messages.length > 0), projectPath));
  try {
    const index = JSON.parse(window.localStorage.getItem(CHAT_HISTORY_INDEX_KEY) ?? "null");
    return Array.isArray(index?.projects) && index.projects.some((path: unknown) => typeof path === "string"
      && normalizeProjectPath(path) === normalizeProjectPath(projectPath));
  } catch {
    return false;
  }
}
