import type { ContextPin } from "./chatContext";
// Keep explicit editor attachments until the chat is mounted, without storing file contents globally on disk.
const pending: ContextPin[] = [];
const listeners = new Set<() => void>();
export function queueChatPin(pin: ContextPin) {
  pending.push(pin);
  if (pending.length > 8) pending.shift();
  for (const listener of listeners) listener();
}
export function takeChatPins() { return pending.splice(0); }
export function subscribeChatPins(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
