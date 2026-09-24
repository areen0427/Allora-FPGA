import { invokeTauri } from "./tauri";

export type AiProvider = "codex" | "claude";
export type AiProviderState = "checking" | "not_installed" | "installed_not_authenticated" | "ready" | "error";
export type AiProviderStatus = {
  provider: AiProvider;
  installed: boolean;
  version?: string;
  executablePath?: string;
  authenticated: boolean;
  state: AiProviderState;
  error?: string;
};

export const aiIntegrationApi = {
  status: (provider: AiProvider) => invokeTauri<AiProviderStatus>("ai_provider_status", { provider }),
  startLogin: (provider: AiProvider) => invokeTauri<void>("ai_provider_start_login", { provider }),
};
