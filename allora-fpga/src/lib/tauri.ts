type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type TauriWindow = Window & {
  __TAURI__?: {
    core?: {
      invoke?: TauriInvoke;
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
