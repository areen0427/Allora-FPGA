import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Copy, ExternalLink, RefreshCw, X } from "lucide-react";
import { aiIntegrationApi, type AiProvider, type AiProviderStatus } from "../lib/aiIntegration";
import { hasTauriInvoke } from "../lib/tauri";

type ProviderConfig = {
  id: AiProvider;
  name: string;
  account: string;
  description: string;
  icon: string;
  installCommand: string;
  installUrl: string;
};

const providers: ProviderConfig[] = [
  { id: "codex", name: "Codex", account: "OpenAI", description: "Connect Codex.", icon: "https://openai.com/favicon.ico", installCommand: "npm install -g @openai/codex", installUrl: "https://developers.openai.com/codex/cli" },
  { id: "claude", name: "Claude Code", account: "Anthropic", description: "Connect Claude Code.", icon: "https://assets.claude.com/95a868946ac8a31e5ff832e2899f294aa368b836.png?w=32&h=32", installCommand: "curl -fsSL https://claude.ai/install.sh | bash", installUrl: "https://code.claude.com/docs/en/setup" },
];

export function AiIntegrationSettings() {
  return <section className="settings-section">
    <header className="settings-section-header"><h3>AI Integration</h3></header>
    <div className="ai-provider-list">{providers.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}</div>
  </section>;
}

function ProviderCard({ provider }: { provider: ProviderConfig }) {
  const desktopAvailable = hasTauriInvoke();
  const [status, setStatus] = useState<AiProviderStatus | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [loginStarted, setLoginStarted] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastChecked, setLastChecked] = useState("");

  const check = useCallback(async () => {
    if (!desktopAvailable) { setChecking(false); return; }
    setChecking(true);
    setError("");
    try {
      const next = await aiIntegrationApi.status(provider.id);
      setStatus(next);
      setLastChecked(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
      if (next.state === "ready" || next.state === "error") setLoginStarted(false);
    } catch { setStatus(null); setLastChecked(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })); setError("Could not check this provider."); }
    finally { setChecking(false); }
  }, [desktopAvailable, provider.id]);

  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    if (!loginStarted) return;
    const timer = window.setInterval(() => { void check(); }, 4000);
    return () => window.clearInterval(timer);
  }, [loginStarted, check]);

  async function startLogin() {
    setError("");
    try { await aiIntegrationApi.startLogin(provider.id); setLoginStarted(true); }
    catch { setError("Could not open provider login in Terminal. Try the provider CLI directly."); }
  }

  const state = checking && !status ? "checking" : status?.state ?? "error";
  return <article className="ai-provider-card" aria-label={provider.name}>
    <div className="ai-provider-heading"><span className="ai-provider-logo"><img src={provider.icon} alt="" /></span><span><strong>{provider.name}</strong><small>{provider.description}</small></span></div>
    {!desktopAvailable ? <p className="ai-provider-message">Launch the desktop app to check this CLI.</p> : <>
      <div className="ai-provider-facts">
        <div><span>CLI</span><strong>{checking && !status ? "Checking…" : status?.installed ? <><CheckCircle2 size={15} /> Installed</> : state === "error" ? <><AlertCircle size={15} /> Error</> : "Required"}</strong>{status?.version && <small>{status.version}</small>}{status?.executablePath && <small title={status.executablePath}>Found at {status.executablePath}</small>}</div>
        <div><span>Account</span><strong>{checking && !status ? "Checking…" : status?.authenticated ? <><CheckCircle2 size={15} /> Connected</> : status?.state === "error" ? "Error" : loginStarted ? "Connecting…" : status?.installed ? "Not connected" : "Setup required"}</strong>{loginStarted && !status?.authenticated && <small>Complete sign in in Terminal or your browser.</small>}</div>
      </div>
      {(error || status?.error) && <p className="ai-provider-error" role="alert">{error || status?.error}</p>}
      {status?.state === "not_installed" && <p className="ai-provider-message">{provider.name} CLI was not detected.</p>}
      <div className="ai-provider-actions">
        {lastChecked && <span className="ai-last-checked">Checked {lastChecked}</span>}
        {status?.state === "not_installed" && <button type="button" className="ai-primary-action" onClick={() => setShowInstall(true)}>Install {provider.name}</button>}
        {status?.state === "installed_not_authenticated" && <button type="button" className="ai-primary-action" disabled={loginStarted} onClick={() => void startLogin()}>Connect {provider.account} Account</button>}
        {loginStarted && !status?.authenticated && <button type="button" onClick={() => setLoginStarted(false)}>Stop checking</button>}
        <button type="button" disabled={checking} onClick={() => void check()}><RefreshCw size={13} className={checking ? "spinning" : ""} /> Check Again</button>
      </div>
    </>}
    {showInstall && <div className="ai-install-panel"><div className="ai-install-title"><strong>Install {provider.name} CLI</strong><button type="button" aria-label="Close installation guidance" onClick={() => setShowInstall(false)}><X size={15} /></button></div><p>Run the following command in Terminal.</p><div className="ai-install-command"><code>{provider.installCommand}</code><button type="button" aria-label="Copy installation command" onClick={() => { void navigator.clipboard.writeText(provider.installCommand).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div><div className="ai-provider-actions"><a href={provider.installUrl} target="_blank" rel="noopener noreferrer">Open Installation Instructions <ExternalLink size={13} /></a><button type="button" onClick={() => { setShowInstall(false); void check(); }}>Check Again</button></div></div>}
  </article>;
}
