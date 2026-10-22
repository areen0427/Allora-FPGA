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
    <button id="test-composer-handoff" onClick={() => void testComposerHandoffs()}>Test composer handoffs</button>
    <output id="composer-focus-result" style={{ fontSize: 11 }} />
    <output id="layout-metrics" style={{ fontSize: 10, overflowWrap: "anywhere" }} />
  </header>
  <section className="dashboard-main" style={{ flex: 1, minHeight: 0, padding: 0 }}>
    <ChatPage initialProjectPath="/fixture/projects" onOpenSettings={() => {}} onOpenProject={async () => {}} />
  </section>
</main>);

function composerSnapshot(phase: string) {
  const composer = document.querySelector<HTMLElement>(".chat-composer");
  return {
    phase,
    time: performance.now(),
    focus: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName,
    composerGlow: composer ? getComputedStyle(composer).boxShadow : null,
    engaged: composer?.dataset.engaged === "true",
    expanded: Boolean(composer?.querySelector('[aria-expanded="true"]')),
  };
}
const focusSamples: ReturnType<typeof composerSnapshot>[] = [];
function sampleComposer(phase: string) {
  focusSamples.push(composerSnapshot(phase));
  if (focusSamples.length > 600) focusSamples.shift();
}
Object.assign(window, { __chatComposerFocus: { samples: focusSamples, clear() { focusSamples.length = 0; } } });
function sampleFrame() {
  sampleComposer("frame");
  requestAnimationFrame(sampleFrame);
}
requestAnimationFrame(sampleFrame);
for (const event of ["pointerdown", "pointerup", "click", "focusin", "focusout", "keydown", "toggle"]) {
  window.addEventListener(event, () => sampleComposer(event), true);
}

async function testComposerHandoffs() {
  const button = document.getElementById("test-composer-handoff") as HTMLButtonElement;
  const result = document.getElementById("composer-focus-result")!;
  const composer = document.querySelector<HTMLElement>(".chat-composer")!;
  const input = composer.querySelector<HTMLTextAreaElement>("textarea")!;
  const triggers = [...composer.querySelectorAll<HTMLButtonElement>('.chat-composer-bottom button[aria-haspopup]')]
    .filter(trigger => !trigger.disabled);
  const pause = () => new Promise<void>(resolve => setTimeout(resolve, 100));
  button.disabled = true;
  result.textContent = "Checking computed shadows during close/open gaps…";
  const idleShadow = getComputedStyle(composer).boxShadow;
  input.focus();
  await pause();
  const activeShadow = getComputedStyle(composer).boxShadow;
  focusSamples.length = 0;
  for (const trigger of triggers) {
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    // Deliberately hold the native popup cleanup gap across several real frames.
    // The old implementation loses the halo here when focus falls to the body.
    (document.activeElement as HTMLElement | null)?.blur();
    await pause();
    trigger.click();
    await pause();
  }
  const frames = focusSamples.filter(sample => sample.phase === "frame");
  const gaps = frames.filter(sample => sample.composerGlow !== activeShadow).length;
  button.disabled = false;
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  button.focus();
  await pause();
  const outsideRestored = getComputedStyle(composer).boxShadow === idleShadow;
  const passed = triggers.length >= 2 && frames.length > 0 && activeShadow !== idleShadow && gaps === 0 && outsideRestored;
  result.textContent = `${passed ? "PASS" : "FAIL"}: ${triggers.length} dropdowns, ${frames.length} computed-shadow frames, ${gaps} highlight gaps; outside dismissal ${outsideRestored ? "passed" : "failed"}.`;
}

function reportLayout() {
  const panel = document.querySelector<HTMLElement>(".chat-sidebar");
  const list = document.querySelector<HTMLElement>(".chat-history-list");
  const metrics = document.getElementById("layout-metrics");
  if (metrics) metrics.textContent = JSON.stringify({
    ...composerSnapshot("layout"),
    history: panel ? { width: Math.round(panel.getBoundingClientRect().width), horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
      listFits: list ? list.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 1 : null } : null,
  });
}
for (const event of ["focusin", "focusout", "pointerup", "toggle", "resize"]) {
  window.addEventListener(event, () => { requestAnimationFrame(() => requestAnimationFrame(reportLayout)); }, true);
}
