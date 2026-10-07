import type { ContextUsage } from "./aiChat";

export function contextPercent(usage?: ContextUsage): number | null {
  if (!usage?.modelContextWindow || !Number.isFinite(usage.last?.totalTokens)) return null;
  return Math.max(0, Math.min(100, usage.last.totalTokens / usage.modelContextWindow * 100));
}
export function contextColor(percent: number): string {
  if (percent <= 50) return "#34b77a";
  if (percent < 55) return `color-mix(in srgb, #34b77a ${(55 - percent) * 20}%, #e4b340)`;
  if (percent <= 75) return "#e4b340";
  if (percent < 80) return `color-mix(in srgb, #e4b340 ${(80 - percent) * 20}%, #e26666)`;
  return "#e26666";
}
