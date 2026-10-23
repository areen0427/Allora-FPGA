import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUp } from "lucide-react";
import ChatPreferenceControls from "../src/components/ChatPreferenceControls";
import ChatModelControls from "../src/components/ChatModelControls";
import ChatProviderSelect from "../src/components/ChatProviderSelect";
import ChatUsageControls from "../src/components/ChatUsageControls";
import ChatMarkdown from "../src/components/ChatMarkdown";
import { SettingsModal } from "../src/components/SettingsModal";
import { DEFAULT_SETTINGS, type AppSettings } from "../src/data/settings";
import type { AiChatModel, ChatMode } from "../src/lib/aiChat";
import type { AiProvider } from "../src/lib/aiIntegration";
import "../src/index.css";
import "../src/App.css";
import "../src/pages/ChatPage.css";

const query = new URLSearchParams(location.search);
const models: AiChatModel[] = [{
  model: "gpt-6.1-sol", displayName: "GPT-6.1-Sol", isDefault: true,
  description: "Fixture model; no requests are sent.", contextWindow: 200000,
  defaultReasoningEffort: "high",
  supportedReasoningEfforts: [
    { reasoningEffort: "medium", description: "Medium" },
    { reasoningEffort: "high", description: "High" },
    { reasoningEffort: "ultra", description: "Ultra" },
  ],
}];
const response = `The receive state advances in \`src/uart_rx.sv:86\`. Review the [reset branch](src/uart_rx.sv:92:3) before changing the counter. An absolute reference also opens the same project: \`/fixture/uart/src/uart_rx.sv:107\`.

| Signal | Meaning |
| --- | --- |
| \`rx_valid\` | Pulses for one cycle |
| \`reset_n\` | Active-low reset |

\`\`\`verilog
always @(posedge clk)
  if (!reset_n) valid <= 1'b0;
\`\`\`

\`\`\`systemverilog
always_ff @(posedge clk) begin
  if (!reset_n) rx_valid <= 1'b0;
end
\`\`\`

\`\`\`vhdl
process (clk)
begin
  if rising_edge(clk) then
    rx_valid <= '0';
  end if;
end process;
\`\`\`

See the [Verilog documentation](https://www.verilog.com/) for language background.`;

export function Fixture() {
  const [settings, setSettings] = useState<AppSettings>({
    ...DEFAULT_SETTINGS,
    theme: query.get("theme") === "ice" ? "ice" : "black-ice",
    reduceMotion: query.has("reduce-motion"),
  });
  const [showSettings, setShowSettings] = useState(query.get("view") === "settings");
  const [mode, setMode] = useState<ChatMode>("edit");
  const [provider, setProvider] = useState<AiProvider>("codex");
  const [model, setModel] = useState(models[0].model);
  const [effort, setEffort] = useState("high");
  const [draft, setDraft] = useState("Explain the UART receive state machine before making changes.");
  const [busy, setBusy] = useState(false);
  const [navigation, setNavigation] = useState("No source opened");
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
  }, [settings.theme, settings.reduceMotion]);
  return <main style={{ height: "100dvh", display: "flex", flexDirection: "column", color: "var(--ui-text)", background: "var(--ui-page-bg)" }}>
    <header style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, padding: 12 }}>
      <strong>Chat UI fixture</strong>
      <button type="button" onClick={() => setShowSettings(true)}>Open Chat Settings</button>
      <button type="button" onClick={() => setBusy(value => !value)}>{busy ? "Unlock controls" : "Lock controls"}</button>
      <output role="status" id="source-navigation">{navigation}</output>
      <output id="preference-state">{mode} · {settings.chatDefaultLanguage}</output>
    </header>
    <section className="dashboard-main" style={{ flex: 1, minHeight: 0, padding: 0 }}>
      <div className="allora-chat">
        <div className="chat-main">
          <header className="chat-header"><strong>AI Design Studio</strong><span>In-memory fixture</span></header>
          <div className="chat-scroll">
            <div className="chat-messages">
              <article className="chat-message assistant">
                <div className="chat-message-content">
                  <ChatMarkdown text={response} projectPath="/fixture/uart" disabled={busy}
                    onOpenSource={reference => setNavigation(JSON.stringify(reference))} />
                </div>
              </article>
            </div>
          </div>
          <div className="chat-composer-area">
            <form className="chat-composer"
              onPointerDownCapture={event => {
                const control = (event.target as Element).closest<HTMLButtonElement>(".chat-composer-bottom button");
                if (control && !control.disabled) control.focus({ preventScroll: true });
              }}
              onSubmit={event => { event.preventDefault(); setNavigation("Fixture only: no request sent"); }}>
              <textarea aria-label="Message Allora" value={draft} rows={2} disabled={busy} onChange={event => setDraft(event.target.value)} />
              <div className="chat-composer-bottom">
                <div className="chat-composer-controls">
                  <div className="chat-composer-control-group">
                    <ChatPreferenceControls mode={mode} language={settings.chatDefaultLanguage} disabled={busy}
                      onModeChange={setMode} onLanguageChange={language => setSettings(current => ({ ...current, chatDefaultLanguage: language }))} />
                  </div>
                  <div className="chat-composer-control-group">
                    <ChatProviderSelect selected={provider} onChange={setProvider} disabled={busy} desktopAvailable={false} codexStatus={null} />
                    <ChatModelControls models={models} selectedModel={model} reasoningEffort={effort} onModelChange={setModel}
                      onReasoningChange={setEffort} disabled={busy} loading={false} error="" />
                  </div>
                  {provider === "codex" && <div className="chat-composer-control-group">
                    <ChatUsageControls slot="usage" available={false} hasMessages usage={{ last: { totalTokens: 7000 }, modelContextWindow: 200000 }} limits={null} />
                  </div>}
                </div>
                <div className="chat-composer-end-controls">
                  {provider === "codex" && <ChatUsageControls slot="context" available={false} hasMessages usage={{ last: { totalTokens: 7000 }, modelContextWindow: 200000 }} limits={null} />}
                  <button type="submit" className="chat-send-button" aria-label="Send message" disabled={busy || !draft.trim()}><ArrowUp size={20} /></button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
    {showSettings && <SettingsModal settings={settings} onChange={setSettings} initialCategory="chat" onClose={() => setShowSettings(false)} />}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
