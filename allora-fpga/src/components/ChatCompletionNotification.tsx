import { useEffect, useState, useSyncExternalStore } from "react";
import { chatNotifications } from "../lib/chatNotifications";
import AiDesignStudioIcon from "./AiDesignStudioIcon";
import "./ChatCompletionNotification.css";

export default function ChatCompletionNotification() {
  const { toast } = useSyncExternalStore(chatNotifications.subscribe, chatNotifications.snapshot);
  const [closingId, setClosingId] = useState<number | null>(null);
  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setClosingId(toast), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (toast === null || closingId !== toast) return;
    const timer = window.setTimeout(() => chatNotifications.dismiss(toast), 420);
    return () => window.clearTimeout(timer);
  }, [closingId, toast]);
  if (toast === null) return null;
  return <aside key={toast} className={`chat-completion-popup${closingId === toast ? " is-leaving" : ""}`} aria-label="AI Design Studio notification"
    onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === "completion-leave") chatNotifications.dismiss(toast); }}>
    <span className="chat-completion-smoke" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</span>
    <AiDesignStudioIcon size={22} unreadIndicator={false} />
    <div role="status"><strong>AI Design Studio</strong><p>Your response is ready.</p></div>
  </aside>;
}
