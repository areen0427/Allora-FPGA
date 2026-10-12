/** Shared across route mounts, just like the swipe tracker. */
export function createBackSwipeMotion() {
  let surface: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;
  let animation: Animation | undefined;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  let frame: number | undefined;
  let lastFrame = 0;
  let position = 0;
  let target = 0;
  let settling = false;
  let generation = 0;
  const waiters: Array<() => void> = [];
  const reduced = () => document.documentElement.dataset.reduceMotion === "true"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clear() {
    clearTimeout(resetTimer);
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    animation?.cancel();
    animation = undefined;
    if (surface) {
      surface.style.removeProperty("translate");
      surface.classList.remove("back-swipe-motion");
    }
    indicator?.remove();
    indicator = null;
    surface = null;
    position = target = lastFrame = 0;
    waiters.splice(0).forEach(resolve => resolve());
  }

  function tick(time: number) {
    frame = undefined;
    if (reduced()) { clear(); return; }
    const elapsed = lastFrame ? Math.min(64, time - lastFrame) : 16;
    lastFrame = time;
    // One frame loop follows the changing target, including sparse slow input.
    // Never cancel/restart a nudge animation for individual wheel events.
    position += (target - position) * (1 - Math.exp(-elapsed / 85));
    if (Math.abs(target - position) < 0.5) position = target;
    if (surface) surface.style.translate = `${position}px`;
    if (indicator) {
      indicator.style.opacity = String(Math.min(1, position / 14));
      indicator.setAttribute("data-ready", String(position >= 36));
      indicator.style.setProperty("--back-swipe-progress", String(position / 40));
    }
    if (position !== target) frame = requestAnimationFrame(tick);
    else {
      lastFrame = 0;
      waiters.splice(0).forEach(resolve => resolve());
      if (settling) clear();
    }
  }

  function progress(value: number) {
    clearTimeout(resetTimer);
    if (reduced()) { clear(); return; }
    if (value <= 0 && !surface) return;
    surface ??= document.getElementById("root");
    if (!surface) return;
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "back-swipe-indicator";
      indicator.setAttribute("aria-hidden", "true");
      indicator.style.opacity = "0";
      const chevron = document.createElement("span");
      indicator.appendChild(chevron);
      document.body.appendChild(indicator);
    }
    surface.classList.add("back-swipe-motion");
    settling = value <= 0;
    target = Math.max(0, Math.min(1, value)) * 40;
    if (frame === undefined) frame = requestAnimationFrame(tick);
    if (!settling) resetTimer = setTimeout(() => progress(0), 450);
  }

  async function navigate(back: () => void | Promise<void>) {
    const current = ++generation;
    clearTimeout(resetTimer);
    try {
      if (!reduced() && frame !== undefined) await new Promise<void>(resolve => waiters.push(resolve));
      if (current !== generation) return;
      await back();
    } finally {
      if (current === generation) clear();
    }
    if (current !== generation || reduced()) return;
    requestAnimationFrame(() => {
      if (current !== generation || reduced()) return;
      surface = document.getElementById("root");
      if (!surface) return;
      surface.classList.add("back-swipe-motion");
      animation = surface.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 300, easing: "ease-out" });
      animation.onfinish = clear;
    });
  }
  return { progress, navigate };
}
