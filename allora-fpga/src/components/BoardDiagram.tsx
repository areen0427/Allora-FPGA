import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { BoardDefinition } from "../data/boards";
import {
  getPinTypeColor,
  getResourceGroupsForBrowser,
  type PinBrowserResourceGroup,
} from "../data/pinResourceGroups";

type BoardDiagramProps = {
  board: BoardDefinition;
  /** Smaller circles, no hint/edge-connector — for tight preview slots. */
  compact?: boolean;
};

/**
 * Category-based board diagram: every pin category is a clickable circle laid
 * out on a stylized PCB. Clicking a circle opens a popup listing each pin in
 * that category with its physical pad, while the board stays visible behind it.
 * Driven entirely by the board's pins, so every pin is represented (unlike the
 * fixed physical layout in VirtualBoard).
 */
export default function BoardDiagram({
  board,
  compact = false,
}: BoardDiagramProps) {
  const resourceGroups = useMemo(
    () => getResourceGroupsForBrowser(board),
    [board],
  );
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const activeGroup = activeTitle
    ? (resourceGroups.find((group) => group.title === activeTitle) ?? null)
    : null;

  useEffect(() => {
    if (!activeGroup) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveTitle(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeGroup]);

  const rootClass = compact
    ? "board-diagram board-diagram-compact"
    : "board-diagram";

  return (
    <div className={rootClass}>
      <div className="board-diagram-board">
        <div className="board-diagram-grid">
          {resourceGroups.map((group) => {
            const appearance = getCategoryAppearance(group);

            return (
              <button
                key={group.title}
                type="button"
                className="board-diagram-node"
                onClick={() => setActiveTitle(group.title)}
                title={`${group.title} — ${group.pins.length} pins`}
              >
                <span
                  className="board-diagram-circle"
                  style={{
                    background: appearance.background,
                    color: appearance.color,
                    borderColor: appearance.color,
                  }}
                >
                  <span className="board-diagram-circle-symbol">
                    {getCategorySymbol(group)}
                  </span>
                  <span className="board-diagram-circle-count">
                    {group.pins.length}
                  </span>
                </span>
                <span className="board-diagram-node-label">{group.title}</span>
              </button>
            );
          })}
        </div>

        {compact ? null : (
          <div className="board-diagram-fingers" aria-hidden="true" />
        )}
        <span className="board-diagram-silk">{board.name}</span>
      </div>

      {compact ? null : (
        <div className="board-diagram-hint">
          Select a category to view its pins.
        </div>
      )}

      {activeGroup ? (
        <CategoryPopup
          group={activeGroup}
          onClose={() => setActiveTitle(null)}
        />
      ) : null}
    </div>
  );
}

function CategoryPopup({
  group,
  onClose,
}: {
  group: PinBrowserResourceGroup;
  onClose: () => void;
}) {
  const appearance = getCategoryAppearance(group);

  return (
    <div className="board-diagram-popup-backdrop" onClick={onClose}>
      <div
        className="board-diagram-popup"
        role="dialog"
        aria-modal="true"
        aria-label={`${group.title} pins`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="board-diagram-popup-header">
          <span
            className="board-diagram-breakdown-symbol"
            style={{ background: appearance.background, color: appearance.color }}
          >
            {getCategorySymbol(group)}
          </span>
          <div className="board-diagram-popup-heading">
            <div className="board-diagram-breakdown-title">{group.title}</div>
            <div className="board-diagram-breakdown-detail">
              {group.detail} · {group.pins.length} pins
            </div>
          </div>
          <button
            type="button"
            className="board-diagram-popup-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="board-diagram-pin-list">
          {group.pins.map((pin) => {
            const color = getPinTypeColor(pin.type);

            return (
              <div key={pin.key} className="board-diagram-pin-row">
                <span
                  className="board-diagram-pin-symbol"
                  style={{ background: color.background, color: color.color }}
                >
                  {pin.symbol}
                </span>
                <span
                  className="board-diagram-pin-name"
                  title={pin.detail ?? pin.name}
                >
                  {pin.detail ?? pin.name}
                </span>
                <span className="board-diagram-pin-pad" title={pin.pin}>
                  {pin.pin}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const CATEGORY_PALETTE = [
  { background: "#eff6ff", color: "#2563eb" },
  { background: "#fef3c7", color: "#b45309" },
  { background: "#fee2e2", color: "#b91c1c" },
  { background: "#f0fdf4", color: "#15803d" },
  { background: "#f5f3ff", color: "#6d28d9" },
  { background: "#ecfeff", color: "#0e7490" },
  { background: "#fff7ed", color: "#c2410c" },
  { background: "#fdf2f8", color: "#be185d" },
];

function getCategoryAppearance(group: PinBrowserResourceGroup) {
  const type = group.pins[0]?.type ?? "";
  const known: Record<string, { background: string; color: string }> = {
    clock: CATEGORY_PALETTE[0],
    led: CATEGORY_PALETTE[1],
    button: CATEGORY_PALETTE[2],
    uart: CATEGORY_PALETTE[3],
    spi: CATEGORY_PALETTE[3],
    flash: CATEGORY_PALETTE[3],
    i2c: CATEGORY_PALETTE[3],
  };
  if (known[type]) return known[type];

  // Stable hue per category title so groups like Ethernet / LPDDR4 stay
  // distinct from each other across renders.
  let hash = 0;
  for (const char of group.title) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

function getCategorySymbol(group: PinBrowserResourceGroup) {
  return group.pins[0]?.symbol ?? "IO";
}
