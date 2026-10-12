import { createBackSwipeMotion } from "../lib/backSwipeMotion";
import { useEffect, useRef } from "react";
import { createBackSwipeTracker } from "../lib/backSwipe";

// Gesture state outlives individual pages so momentum cannot trigger Back again
// when navigation mounts a new dock or enables a different Back handler.
const motion = createBackSwipeMotion();
const track = createBackSwipeTracker(motion.progress);

export function useBackSwipe(onBack?: () => void) {
  const callback = useRef(onBack);
  useEffect(() => { callback.current = onBack; });
  const enabled = Boolean(onBack);
  useEffect(() => {
    if (!enabled || !/Mac/.test(navigator.platform)) return;
    function onWheel(event: WheelEvent) {
      let element = event.target instanceof Element ? event.target : null;
      let eligible = !event.ctrlKey && !event.defaultPrevented && event.deltaMode === 0;
      // Dialogs own their input. Editors and canvases use horizontal gestures themselves.
      if (document.querySelector('[aria-modal="true"]') || element?.closest('.monaco-editor, canvas, [role="dialog"]')) eligible = false;
      while (element && eligible) {
        const style = getComputedStyle(element);
        if (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth && element.scrollLeft > 0) eligible = false;
        element = element.parentElement;
      }
      if (track(event.deltaX, event.deltaY, event.timeStamp, eligible)) {
        event.preventDefault();
        void motion.navigate(() => callback.current?.()).catch(() => {
          // Back handlers own save/error reporting; a failed action stays on its page.
        });
      }
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [enabled]);
}
