import { useSyncExternalStore } from "react";
import { chatNotifications } from "../lib/chatNotifications";
import GradientOutline from "./ui/GradientOutline";

export default function ChatUnreadRing() {
  const { unread } = useSyncExternalStore(chatNotifications.subscribe, chatNotifications.snapshot);
  return unread ? <GradientOutline className="chat-unread-ring" radius={14} /> : null;
}
