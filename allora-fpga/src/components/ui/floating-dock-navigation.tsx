import { useRef, useState } from "react";
import type { ComponentProps } from "react";
import { createPortal } from "react-dom";

import { DockContext } from "./floating-dock-context";

/** Vertical adaptation of the floating dock; preserves the caller's icons/actions. */
export function FloatingDockNav({ children, ...props }: ComponentProps<"nav">) {
  const navRef = useRef<HTMLElement>(null);
  const [hover, setHover] = useState<{
    label: string;
    labels: string[];
    x: number;
    y: number;
    description: string;
  } | null>(null);

  function highlight(target: EventTarget | null) {
    const nav = navRef.current;
    const button =
      target instanceof Element
        ? target.closest<HTMLButtonElement>("button[data-dock-label]")
        : null;
    if (!nav || !button || !nav.contains(button)) {
      setHover(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    setHover({
      label: button.dataset.dockLabel!,
      labels: Array.from(
        nav.querySelectorAll<HTMLButtonElement>("button[data-dock-label]"),
        (item) => item.dataset.dockLabel!,
      ),
      x: rect.right + 12,
      y: Math.max(
        24,
        Math.min(window.innerHeight - 24, rect.top + rect.height / 2),
      ),
      description:
        button.getAttribute("aria-label") ?? button.dataset.dockLabel!,
    });
  }

  function getScale(label: string) {
    if (!hover) return 1;
    const distance = Math.abs(
      hover.labels.indexOf(label) - hover.labels.indexOf(hover.label),
    );
    return distance === 0
      ? 1.4
      : distance === 1
        ? 1.2
        : distance === 2
          ? 1.1
          : 1;
  }

  return (
    <DockContext.Provider value={getScale}>
      <nav
        {...props}
        ref={navRef}
        onPointerOver={(event) => {
          if (event.pointerType !== "touch") highlight(event.target);
        }}
        onPointerLeave={() =>
          highlight(
            navRef.current?.contains(document.activeElement) &&
              document.activeElement?.matches(":focus-visible")
              ? document.activeElement
              : null,
          )
        }
        onFocusCapture={(event) => highlight(event.target)}
        onBlurCapture={(event) => highlight(event.relatedTarget)}
        onScroll={() => setHover(null)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setHover(null);
        }}
      >
        {children}
      </nav>
      {hover &&
        createPortal(
          <div
            role="tooltip"
            className="floating-dock-tooltip"
            style={{ left: hover.x, top: hover.y }}
          >
            {hover.description}
          </div>,
          document.body,
        )}
    </DockContext.Provider>
  );
}
