type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export type TauriChannel<T> = {
  onmessage: (message: T) => void;
};

type TauriWindow = Window & {
  __TAURI__?: {
    core?: {
      invoke?: TauriInvoke;
      Channel?: new <T>() => TauriChannel<T>;
    };
  };
};

export function hasTauriInvoke() {
  return Boolean((window as TauriWindow).__TAURI__?.core?.invoke);
}

export async function invokeTauri<T>(
  command: string,
  args?: Record<string, unknown>
) {
  const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;

  if (!invoke) {
    throw new Error("Tauri runtime unavailable");
  }

  return invoke<T>(command, args);
}

/**
 * Create an IPC channel for commands that stream data back while running
 * (build logs, serial output). Returns null outside the Tauri runtime.
 */
export function createTauriChannel<T>(
  onMessage: (message: T) => void
): TauriChannel<T> | null {
  const Channel = (window as TauriWindow).__TAURI__?.core?.Channel;
  if (!Channel) return null;

  const channel = new Channel<T>();
  channel.onmessage = onMessage;
  return channel;
}
