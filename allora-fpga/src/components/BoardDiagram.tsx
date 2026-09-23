import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { BoardDefinition } from "../data/boards";
import {
  getPinTypeColor,
  getResourceGroupsForBrowser,
  type PinBrowserResourceGroup,
} from "../data/pinResourceGroups";
import VirtualBoard from "./VirtualBoard";

type BoardDiagramProps = {
  board: BoardDefinition;
  /** Condensed board summary used by project setup. */
  compact?: boolean;
};

/**
 * Data-driven board explorer. The physical board is rendered from the board's
 * own layout definition while resource controls live in rails outside the PCB.
 * At narrow widths the rails become horizontally scrollable docks, so controls
 * never overlap the board or force the surrounding page to scroll.
 */
export default function BoardDiagram({ board, compact = false }: BoardDiagramProps) {
  const resourceGroups = useMemo(
    () => getResourceGroupsForBrowser(board),
    [board],
  );
  const [activeTitle, setActiveTitle] = useState<string | null>(
    compact ? null : (resourceGroups[0]?.title ?? null),
  );
  const activeGroup = activeTitle
    ? (resourceGroups.find((group) => group.title === activeTitle) ?? null)
    : null;

  useEffect(() => {
    if (compact) {
      setActiveTitle(null);
      return;
    }
    setActiveTitle((current) =>
      resourceGroups.some((group) => group.title === current)
        ? current
        : (resourceGroups[0]?.title ?? null),
    );
  }, [board.id, compact, resourceGroups]);

  useEffect(() => {
    if (!compact || !activeGroup) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveTitle(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeGroup, compact]);

  const highlightedPinKeys = activeGroup?.pins.map((pin) => pin.key) ?? [];

  return (
    <div className={compact ? "board-diagram board-diagram-compact" : "board-diagram"}>
      <div className="board-diagram-scroll">
        <div className="board-diagram-workbench">
          <div className="board-diagram-stage">
            <div className="board-diagram-canvas">
              <div className="board-diagram-canvas-heading">
                <span>{board.name}</span>
                <small>{board.device}</small>
              </div>
              <div className="board-diagram-board-frame">
                <VirtualBoard
                  board={board}
                  mappedPinKeys={highlightedPinKeys}
                  maxHeight={compact ? 144 : 480}
                  showCaption={false}
                />
              </div>
              <div className="board-diagram-layout-note">
                Physical component layout · resources stay outside the PCB
              </div>
            </div>

            <ResourceRail
              groups={resourceGroups}
              activeTitle={activeTitle}
              onSelect={setActiveTitle}
            />
          </div>

          {!compact ? <ResourceInspector group={activeGroup} /> : null}
        </div>
      </div>

      {compact && activeGroup ? (
        <CompactResourceDialog group={activeGroup} onClose={() => setActiveTitle(null)} />
      ) : null}
    </div>
  );
}

function ResourceRail({
  groups,
  activeTitle,
  onSelect,
}: {
  groups: PinBrowserResourceGroup[];
  activeTitle: string | null;
  onSelect: (title: string) => void;
}) {
  return (
    <div className="board-resource-rail" aria-label="Board resources">
      {groups.map((group) => {
        const appearance = getCategoryAppearance(group);
        const active = group.title === activeTitle;
        return (
          <button
            key={group.title}
            type="button"
            className={active ? "board-rail-item active" : "board-rail-item"}
            onClick={() => onSelect(group.title)}
            aria-pressed={active}
            title={`${group.title} — ${group.pins.length} pins`}
          >
            <span
              className="board-rail-symbol"
              style={{ background: appearance.background, color: appearance.color }}
            >
              {getCategorySymbol(group)}
            </span>
            <span className="board-rail-count">{group.pins.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function ResourceInspector({ group }: { group: PinBrowserResourceGroup | null }) {
  if (!group) {
    return (
      <aside className="board-resource-inspector empty">
        Select a resource group to inspect its pins.
      </aside>
    );
  }

  const appearance = getCategoryAppearance(group);
  return (
    <aside className="board-resource-inspector" aria-live="polite">
      <div className="board-inspector-header">
        <span
          className="board-inspector-symbol"
          style={{ background: appearance.background, color: appearance.color }}
        >
          {getCategorySymbol(group)}
        </span>
        <div>
          <strong>{group.title}</strong>
          <small>{group.detail} · {group.pins.length} pins</small>
        </div>
      </div>
      <PinList group={group} />
    </aside>
  );
}

function CompactResourceDialog({
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
          <button type="button" className="board-diagram-popup-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <PinList group={group} />
      </div>
    </div>
  );
}

function PinList({ group }: { group: PinBrowserResourceGroup }) {
  return (
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
            <span className="board-diagram-pin-name" title={pin.detail ?? pin.name}>
              {pin.detail ?? pin.name}
            </span>
            <span className="board-diagram-pin-pad" title={pin.pin}>{pin.pin}</span>
          </div>
        );
      })}
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

  let hash = 0;
  for (const char of group.title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

function getCategorySymbol(group: PinBrowserResourceGroup) {
  return group.pins[0]?.symbol ?? "IO";
}
