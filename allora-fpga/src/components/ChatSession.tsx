import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ChatCompletionNotification from "./ChatCompletionNotification";
import { chatNotifications } from "../lib/chatNotifications";
import ChatPage from "../pages/ChatPage";
import type { ChatArtifact } from "./ChatTurnDetails";
import { queueChatArtifact } from "../lib/chatArtifactsBridge";

type Options = {
  hidden?: boolean;
  initialProjectPath?: string;
  diagnosticsProjectKey?: string;
  resumeLatest?: boolean;
  onOpenSettings: () => void;
  onOpenProject: (path: string) => Promise<void>;
  onWorkspaceChanged?: (path: string) => Promise<void>;
  onProjectCreated?: (path: string) => Promise<void>;
  onOpenArtifact?: (artifact: ChatArtifact) => void | Promise<void>;
};
type Session = { attach: (host: HTMLElement, options: Options) => void; detach: (host: HTMLElement) => void; update: (options: Options) => void; reset: () => void };
const Context = createContext<Session | null>(null);

/** A stable portal container preserves streaming, drafts and thread state across app stages. */
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const [container] = useState(() => {
    const element = document.createElement("div");
    element.style.display = "contents";
    return element;
  });
  const optionsRef = useRef<Options | null>(null);
  const scope = useRef<string | undefined>(undefined);
  const initialized = useRef(false);
  const hasOpenedChat = useRef(false);
  const [session, setSession] = useState<{ key: number; options: Options } | null>(null);
  const [api] = useState<Session>(() => ({
    attach(host, options) {
      optionsRef.current = options;
      host.appendChild(container);
      chatNotifications.setVisible(!options.hidden);
      const nextScope = options.initialProjectPath ?? options.diagnosticsProjectKey;
      if (initialized.current && scope.current === nextScope) return;
      scope.current = nextScope;
      initialized.current = true;
      // Project entry resumes saved history even on the first chat of this launch.
      // A projectless welcome chat still starts fresh.
      const sessionOptions = { ...options, resumeLatest: options.resumeLatest === true && (Boolean(options.initialProjectPath) || hasOpenedChat.current) };
      hasOpenedChat.current = true;
      setSession(current => ({ key: (current?.key ?? 0) + 1, options: sessionOptions }));
    },
    detach(host) { if (container.parentNode === host) { container.remove(); chatNotifications.setVisible(false); } },
    update(options) { optionsRef.current = options; chatNotifications.setVisible(container.isConnected && !options.hidden); },
    reset() { chatNotifications.reset(); initialized.current = false; scope.current = undefined; setSession(null); },
  }));
  return <Context.Provider value={api}>
    {children}
    <ChatCompletionNotification />
    {session && createPortal(<ChatPage key={session.key}
      initialProjectPath={session.options.initialProjectPath}
      diagnosticsProjectKey={session.options.diagnosticsProjectKey}
      resumeLatest={session.options.resumeLatest}
      onActivateProject={async path => {
        if (optionsRef.current?.initialProjectPath === path) return;
        const previousScope = scope.current;
        scope.current = path;
        try { await optionsRef.current?.onOpenProject(path); }
        catch (error) { scope.current = previousScope; throw error; }
      }}
      onOpenSettings={() => optionsRef.current?.onOpenSettings()}
      onOpenProject={path => optionsRef.current!.onOpenProject(path)}
      onOpenArtifact={async artifact => {
        if (optionsRef.current?.onOpenArtifact) await optionsRef.current.onOpenArtifact(artifact);
        else if (artifact.projectPath) {
          queueChatArtifact(artifact);
          await optionsRef.current?.onOpenProject(artifact.projectPath);
        }
      }}
      onWorkspaceChanged={async path => { await optionsRef.current?.onWorkspaceChanged?.(path); }}
      onProjectCreated={async path => {
        scope.current = path;
        await optionsRef.current?.onProjectCreated?.(path);
      }}
    />, container)}
  </Context.Provider>;
}

export function ChatSessionHost(options: Options & { hidden?: boolean }) {
  const api = useContext(Context)!;
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; api.update(options); });
  useLayoutEffect(() => {
    const element = host.current!;
    api.attach(element, latest.current);
    return () => api.detach(element);
  }, [api, options.initialProjectPath, options.diagnosticsProjectKey]);
  return <div ref={host} style={{ display: options.hidden ? "none" : "contents" }} />;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useResetChatSession() { return useContext(Context)!.reset; }
