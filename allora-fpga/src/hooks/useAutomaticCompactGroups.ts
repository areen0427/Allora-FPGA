import { useEffect } from "react";
import { findCompactButtonRuns } from "../lib/compactButtonGroups";

const controlSelector = "button, a.ui-button, label.ui-button";
const exclusions = '[data-glass="off"], [role="switch"], [role="combobox"], .ui-dropdown, .sidebarNavButton, .fileClose, .pin-tile, .board-card, .variant-card, .template-card, .execution-path-card, .vfpga-switch, .vfpga-button, .pw-switch, .open-project-button';
const authoredGroups = '.ui-button-group, .ui-compact-button-group, [data-ui-compact="off"], .activity-rail-nav, .project-tree-scroll, .editor-tab-bar, .board-input-bank';

/** Apply the existing shared variant to nearby rows, including dynamic buttons. */
export function useAutomaticCompactGroups() {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    let frame = 0;
    let previous = new Set<HTMLElement>();
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    let observedParents = new Set<HTMLElement>();

    function schedule() {
      if (!frame) frame = requestAnimationFrame(scan);
    }
    function scan() {
      frame = 0;
      // Measure authored geometry so our own borders/sizing cannot cause
      // grouping to oscillate when a row is close to its wrapping threshold.
      for (const control of previous) {
        delete control.dataset.uiCompact;
        delete control.dataset.uiDivider;
      }
      const tokens = getComputedStyle(root!);
      const maxGap = parseFloat(tokens.getPropertyValue("--ui-compact-auto-distance")) || 12;
      const minCount = parseInt(tokens.getPropertyValue("--ui-compact-auto-min-count"), 10) || 3;
      const parents = new Set<HTMLElement>();
      for (const control of root!.querySelectorAll<HTMLElement>(controlSelector)) {
        if (!control.matches(exclusions) && !control.closest(authoredGroups) && control.parentElement) {
          parents.add(control.parentElement);
        }
      }
      const next = new Set<HTMLElement>();
      const dividers = new Map<HTMLElement, number>();
      for (const parent of parents) {
        if (!observedParents.has(parent)) resize.observe(parent);
        const display = getComputedStyle(parent).display;
        if (!["flex", "inline-flex", "grid", "inline-grid"].includes(display)) continue;
        let candidates: { item: HTMLElement; rect: DOMRect }[] = [];
        function flush() {
          for (const run of findCompactButtonRuns(candidates, maxGap, minCount)) {
            run.forEach((control, index) => {
              next.add(control);
              if (index) {
                const gap = control.getBoundingClientRect().left - run[index - 1].getBoundingClientRect().right;
                dividers.set(control, gap / 2 + 1);
              }
            });
          }
          candidates = [];
        }
        for (const child of parent.children) {
          if (!(child instanceof HTMLElement) || !child.matches(controlSelector) || child.matches(exclusions)) {
            flush();
            continue;
          }
          const rect = child.getBoundingClientRect();
          if (rect.width && rect.height) candidates.push({ item: child, rect });
        }
        flush();
      }
      for (const parent of observedParents) if (!parents.has(parent)) resize.unobserve(parent);
      observedParents = parents;
      // Write after geometry reads. Attribute markers avoid class-observer loops.
      for (const control of previous) if (!next.has(control)) {
        delete control.dataset.uiCompact;
        delete control.dataset.uiDivider;
        control.style.removeProperty("--ui-auto-divider-offset");
      }
      for (const control of next) {
        control.dataset.uiCompact = "true";
        const offset = dividers.get(control);
        if (offset === undefined) {
          delete control.dataset.uiDivider;
          control.style.removeProperty("--ui-auto-divider-offset");
        } else {
          control.dataset.uiDivider = "true";
          const value = `${offset}px`;
          if (control.style.getPropertyValue("--ui-auto-divider-offset") !== value) {
            control.style.setProperty("--ui-auto-divider-offset", value);
          }
        }
      }
      previous = next;
    }
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      mutation.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      for (const control of previous) {
        delete control.dataset.uiCompact;
        delete control.dataset.uiDivider;
        control.style.removeProperty("--ui-auto-divider-offset");
      }
    };
  }, []);
}
