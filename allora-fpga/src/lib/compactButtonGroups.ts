export type CompactControl<T> = {
  item: T;
  rect: { left: number; right: number; top: number; bottom: number };
};

/** Keep DOM order and split at wrapping, vertical layouts, or larger gaps. */
export function findCompactButtonRuns<T>(
  controls: CompactControl<T>[],
  maxGap = 12,
  minCount = 3,
): T[][] {
  const groups: T[][] = [];
  let run: CompactControl<T>[] = [];
  function flush() {
    if (run.length >= minCount) groups.push(run.map(({ item }) => item));
    run = [];
  }
  for (const control of controls) {
    const previous = run.at(-1);
    if (previous) {
      const gap = control.rect.left - previous.rect.right;
      const overlap = Math.min(control.rect.bottom, previous.rect.bottom) -
        Math.max(control.rect.top, previous.rect.top);
      const height = Math.min(control.rect.bottom - control.rect.top,
        previous.rect.bottom - previous.rect.top);
      if (gap < -1 || gap > maxGap || overlap < height / 2) flush();
    }
    run.push(control);
  }
  flush();
  return groups;
}
