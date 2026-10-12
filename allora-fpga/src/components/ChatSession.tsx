import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ChatPage from "../pages/ChatPage";

type Options = {
  initialProjectPath?: string;
  resumeLatest?: boolean;
  onOpenSettings: () => void;
  onOpenProject: (path: string) => Promise<void>;
  onWorkspaceChanged?: (path: string) => Promise<void>;
  onProjectCreated?: (path: string) => Promise<void>;
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
  const [session, setSession] = useState<{ key: number; options: Options } | null>(null);
  const [api] = useState<Session>(() => ({
    attach(host, options) {
      optionsRef.current = options;
      host.appendChild(container);
      if (initialized.current && scope.current === options.initialProjectPath) return;
      scope.current = options.initialProjectPath;
      initialized.current = true;
      setSession(current => ({ key: (current?.key ?? 0) + 1, options }));
    },
    detach(host) { if (container.parentNode === host) container.remove(); },
    update(options) { optionsRef.current = options; },
    reset() { initialized.current = false; scope.current = undefined; setSession(null); },
  }));
  return <Context.Provider value={api}>
    {children}
    {session && createPortal(<ChatPage key={session.key}
      initialProjectPath={session.options.initialProjectPath}
      resumeLatest={session.options.resumeLatest}
      onOpenSettings={() => optionsRef.current?.onOpenSettings()}
      onOpenProject={path => optionsRef.current!.onOpenProject(path)}
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
  }, [api, options.initialProjectPath]);
  return <div ref={host} style={{ display: options.hidden ? "none" : "contents" }} />;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useResetChatSession() { return useContext(Context)!.reset; }
