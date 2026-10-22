import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

/** Recent and complete history share one nonmodal, trigger-anchored surface. */
export default function ChatHistoryPopup({ id, anchorRef, expanded, onDismiss, children }: {
  id: string;
  anchorRef: RefObject<HTMLButtonElement | null>;
  expanded: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const popupRef = useRef<HTMLElement>(null);
  const dismissRef = useRef(onDismiss);
  useLayoutEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  useLayoutEffect(() => {
    const popup = popupRef.current;
    const trigger = anchorRef.current;
    if (!popup || !trigger) return;
    const place = () => {
      const anchor = trigger.getBoundingClientRect();
      const edge = 12;
      const gap = 8;
      const width = Math.min(expanded ? 560 : 320, window.innerWidth - edge * 2);
      const below = window.innerHeight - anchor.bottom - gap - edge;
      const above = anchor.top - gap - edge;
      const isAbove = below < 240 && above > below;
      popup.style.width = `${Math.max(0, width)}px`;
      popup.style.left = `${Math.max(edge, Math.min(anchor.right - width, window.innerWidth - width - edge))}px`;
      popup.style.top = isAbove ? "auto" : `${anchor.bottom + gap}px`;
      popup.style.bottom = isAbove ? `${window.innerHeight - anchor.top + gap}px` : "auto";
      popup.style.maxHeight = `${Math.max(0, Math.min(expanded ? 640 : 520, isAbove ? above : below))}px`;
      popup.dataset.placement = isAbove ? "above" : "below";
    };
    popup.showPopover();
    place();
    popup.focus({ preventScroll: true });
    const observer = new ResizeObserver(place);
    observer.observe(trigger);
    const outside = (event: PointerEvent) => {
      if (!popup.contains(event.target as Node) && !trigger.contains(event.target as Node)) dismissRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      dismissRef.current();
      trigger.focus({ preventScroll: true });
    };
    const scroll = (event: Event) => { if (!popup.contains(event.target as Node)) place(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
      if (popup.matches(":popover-open")) popup.hidePopover();
    };
  }, [anchorRef, expanded]);

  return <aside ref={popupRef} id={id} popover="manual" tabIndex={-1} role="dialog"
    className={`welcome-product-info chat-sidebar chat-history-popup${expanded ? " is-expanded" : ""}`}
    aria-label={expanded ? "All chats" : "Recent chats"}>
    {children}
  </aside>;
}
