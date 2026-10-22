import { createRoot } from "react-dom/client";
import ChatPage from "../src/pages/ChatPage";
import type { AiChatEvent } from "../src/lib/aiChat";
import "../src/index.css";
import "../src/App.css";

// Open this fixture in an isolated ADE browser profile: it uses real browser
// storage and a fake native transport, with no model or filesystem requests.
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "ice";
document.documentElement.dataset.reduceMotion = String(query.has("reduce-motion"));
const seededKey = "allora-chat-history-fixture-seeded";
if (!localStorage.getItem(seededKey)) {
  localStorage.setItem("allora-codex-conversations-v1", JSON.stringify(Array.from({ length: 12 }, (_, index) => ({
    id: `fixture-chat-${index}`,
    title: index === 0 ? "Small Project" : `Saved board design ${index + 1} with a long descriptive conversation title`,
    workspacePath: "/fixture/projects",
    updatedAt: new Date(Date.now() - index * 60000).toISOString(),
    messages: [{ id: `fixture-user-${index}`, role: "user", text: `Explain saved design ${index + 1}.` },
      { id: `fixture-assistant-${index}`, role: "assistant", text: "Saved fixture reply. No model was contacted." }],
  }))));
  localStorage.setItem(seededKey, "true");
}
let blockedStorage = query.has("blocked-storage");
if (blockedStorage) {
  const deviceDatabase = window.indexedDB;
  Object.defineProperty(window, "indexedDB", { get() {
    if (blockedStorage) throw new DOMException("Fixture storage is unavailable.", "SecurityError");
    return deviceDatabase;
  } });
  const write = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (blockedStorage && key.startsWith("allora-codex-conversations")) throw new DOMException("Fixture storage is full.", "QuotaExceededError");
    write.call(this, key, value);
  };
}

type EventChannel = { onmessage: (event: AiChatEvent) => void };
let channel: EventChannel | undefined;
let finish: (() => void) | undefined;
Object.assign(window, { __TAURI__: { core: {
  Channel: class { onmessage: (event: AiChatEvent) => void = () => {}; },
  async invoke(command: string, args?: Record<string, unknown>) {
    switch (command) {
      case "ai_provider_status": return { provider: "codex", installed: true, authenticated: true, state: "ready" };
      case "ai_chat_models": return [{ model: "fixture-model", displayName: "Fixture model", isDefault: true,
        supportedReasoningEfforts: [{ reasoningEffort: "high", description: "High" }], defaultReasoningEffort: "high", contextWindow: 200000 }];
      case "ai_chat_usage": return { rateLimits: { primary: null, secondary: null } };
      case "ai_chat_checkpoint_create": return { id: "fixture-checkpoint", projectPath: "/fixture/projects" };
      case "ai_chat_start": return { sessionId: "fixture-session", threadId: "fixture-resumable-thread", mode: (args?.request as { mode?: string })?.mode };
      case "ai_chat_send": {
        channel = args?.onEvent as EventChannel;
        channel.onmessage({ type: "assistant_delta", delta: "This partial response is already saved. Reload this fixture to simulate interruption, then open Recent chats to recover this turn." });
        return new Promise<void>(resolve => { finish = resolve; });
      }
      case "ai_chat_cancel": channel?.onmessage({ type: "turn_completed", interrupted: true }); finish?.(); return;
      case "ai_chat_close": return;
      default: return null;
    }
  },
} } });

createRoot(document.getElementById("root")!).render(<main style={{ height: "100dvh", display: "flex", flexDirection: "column", color: "var(--ui-text)", background: "var(--ui-page-bg)" }}>
  <header style={{ padding: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <strong>Chat history recovery fixture</strong>
    <span>Fake native transport; real browser storage. Reload during a turn to test recovery.</span>
    {query.has("blocked-storage") && <button onClick={() => { blockedStorage = false; }}>Restore fixture storage</button>}
    <output id="layout-metrics" style={{ fontSize: 10, overflowWrap: "anywhere" }} />
  </header>
  <section className="dashboard-main" style={{ flex: 1, minHeight: 0, padding: 0 }}>
    <ChatPage initialProjectPath="/fixture/projects" onOpenSettings={() => {}} onOpenProject={async () => {}} />
  </section>
</main>);

function reportLayout() {
  const composer = document.querySelector<HTMLElement>(".chat-composer");
  const panel = document.querySelector<HTMLElement>(".chat-sidebar");
  const list = document.querySelector<HTMLElement>(".chat-history-list");
  const metrics = document.getElementById("layout-metrics");
  if (metrics) metrics.textContent = JSON.stringify({
    focus: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName,
    composerGlow: composer ? getComputedStyle(composer).boxShadow : null,
    expanded: Boolean(composer?.querySelector('[aria-expanded="true"]')),
    history: panel ? { width: Math.round(panel.getBoundingClientRect().width), horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
      listFits: list ? list.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 1 : null } : null,
  });
}
for (const event of ["focusin", "focusout", "pointerup", "toggle", "resize"]) {
  window.addEventListener(event, () => { requestAnimationFrame(() => requestAnimationFrame(reportLayout)); }, true);
}
