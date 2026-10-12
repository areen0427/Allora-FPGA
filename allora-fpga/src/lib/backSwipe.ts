/** Accumulate a macOS two-finger back swipe, with one action per gesture. */
export function createBackSwipeTracker(onProgress?: (progress: number) => void) {
  let distance = 0;
  let lastTime = -Infinity;
  let fired = false;
  let blocked = false;
  return (deltaX: number, deltaY: number, time: number, eligible: boolean): boolean => {
    if (time - lastTime > 450) { distance = 0; fired = false; blocked = false; }
    lastTime = time;
    if (!eligible) blocked = true;
    if (fired) return false;
    if (blocked) { onProgress?.(0); return false; }
    if (deltaX === 0 && deltaY === 0) return false;
    if (Math.abs(deltaX) <= Math.abs(deltaY) * 2) {
      // Diagonal noise during a slow horizontal gesture must not jerk it back.
      if (distance > 0) return false;
      distance = 0;
      onProgress?.(0);
      return false;
    }
    distance = Math.max(0, distance - deltaX);
    onProgress?.(Math.min(1, distance / 100));
    if (distance < 100) return false;
    fired = true;
    return true;
  };
}
