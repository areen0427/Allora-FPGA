import { useMemo } from "react";
import type { BoardDefinition, BoardPin } from "../data/boards";
import {
  getBoardLayout,
  type LayoutComponent,
  type LedColor,
} from "../data/boardLayouts";

/** Keyed by board pin name (e.g. "led0", "rgb_red", "btn1"); true = driven high/active. */
export type BoardSignalStates = Record<string, boolean | undefined>;

type VirtualBoardProps = {
  board: BoardDefinition;
  signalStates?: BoardSignalStates;
  selectable?: boolean;
  selectedPinKey?: string | null;
  mappedPinKeys?: string[];
  onSelectPin?: (pinKey: string) => void;
  maxHeight?: number;
  showCaption?: boolean;
};

const LED_PALETTE: Record<LedColor, { on: string; off: string; glow: string }> =
  {
    green: { on: "#4ade80", off: "#14532d", glow: "rgba(74,222,128,0.55)" },
    red: { on: "#f87171", off: "#7f1d1d", glow: "rgba(248,113,113,0.55)" },
    blue: { on: "#60a5fa", off: "#1e3a8a", glow: "rgba(96,165,250,0.55)" },
    amber: { on: "#fbbf24", off: "#78350f", glow: "rgba(251,191,36,0.55)" },
    white: { on: "#f8fafc", off: "#475569", glow: "rgba(248,250,252,0.55)" },
  };

export default function VirtualBoard({
  board,
  signalStates,
  selectable = false,
  selectedPinKey,
  mappedPinKeys,
  onSelectPin,
  maxHeight = 340,
  showCaption = true,
}: VirtualBoardProps) {
  const layout = useMemo(() => getBoardLayout(board), [board]);
  const pinsByName = useMemo(() => {
    const map = new Map<string, BoardPin>();
    for (const pin of [...board.pins, ...board.leds, ...board.buttons]) {
      if (!map.has(pin.name)) map.set(pin.name, pin);
    }
    return map;
  }, [board]);
  const mappedKeys = useMemo(
    () => new Set(mappedPinKeys ?? []),
    [mappedPinKeys],
  );

  const fontSize = Math.min(2.6, Math.max(1.7, layout.width / 36));

  function pinKeyFor(component: LayoutComponent): string | null {
    if (component.kind === "led" || component.kind === "button") {
      const pin = pinsByName.get(component.pinName);
      return pin ? `pin:${pin.name}:${pin.pin}` : null;
    }
    if (component.kind === "clock") {
      const clock = board.clocks.find(
        (entry) => entry.name === component.clockName,
      );
      return clock?.pin ? `clock:${clock.name}` : null;
    }
    return null;
  }

  function renderSelectionRing(
    x: number,
    y: number,
    radius: number,
    key: string | null,
  ) {
    if (!key) return null;
    const isSelected = selectedPinKey === key;
    const isMapped = mappedKeys.has(key);
    if (!isSelected && !isMapped) return null;

    return (
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill="none"
        className={isSelected ? "vboard-ring-selected" : "vboard-ring-mapped"}
        strokeWidth={isSelected ? 0.6 : 0.4}
        strokeDasharray={isSelected ? undefined : "0.8 0.6"}
      />
    );
  }

  function interactiveProps(component: LayoutComponent, label: string) {
    const key = pinKeyFor(component);
    if (!selectable || !key || !onSelectPin) return { className: "" };

    return {
      className: "vboard-clickable",
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `Assign ${label}`,
      onClick: () => onSelectPin(key),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectPin(key);
        }
      },
    };
  }

  return (
    <div className="vboard-shell">
      <svg
        className="vboard-svg"
        viewBox={`-2 -2 ${layout.width + 4} ${layout.height + 4}`}
        style={{ width: "100%", maxHeight: `${maxHeight}px`, display: "block" }}
        aria-label={`${board.name} virtual board`}
      >
        {/* PCB */}
        <rect
          className="vboard-pcb"
          x={0}
          y={0}
          width={layout.width}
          height={layout.height}
          rx={2.2}
        />
        <rect
          className="vboard-pcb-inner"
          x={0.8}
          y={0.8}
          width={layout.width - 1.6}
          height={layout.height - 1.6}
          rx={1.7}
          fill="none"
        />
        <text
          className="vboard-board-name"
          x={layout.width - 1.6}
          y={layout.height - 1.8}
          textAnchor="end"
          fontSize={fontSize * 0.92}
        >
          {board.name}
        </text>

        {layout.components.map((component, index) => {
          if (component.kind === "header") {
            return (
              <g key={index}>
                <rect
                  className="vboard-connector"
                  x={component.x}
                  y={component.y}
                  width={component.w}
                  height={component.h}
                  rx={0.6}
                />
                {component.label ? (
                  <text
                    className="vboard-silk"
                    x={component.x + component.w / 2}
                    y={component.y + component.h / 2 + fontSize * 0.32}
                    textAnchor="middle"
                    fontSize={fontSize * 0.7}
                  >
                    {component.label}
                  </text>
                ) : null}
              </g>
            );
          }

          if (component.kind === "usb") {
            return (
              <g key={index}>
                <rect
                  className="vboard-usb"
                  x={component.x}
                  y={component.y}
                  width={component.w}
                  height={component.h}
                  rx={0.8}
                />
                <text
                  className="vboard-silk"
                  x={component.x + component.w / 2}
                  y={component.y + component.h + fontSize}
                  textAnchor="middle"
                  fontSize={fontSize * 0.7}
                >
                  {component.label ?? "USB"}
                </text>
              </g>
            );
          }

          if (component.kind === "chip") {
            return (
              <g key={index}>
                <rect
                  className="vboard-chip"
                  x={component.x}
                  y={component.y}
                  width={component.w}
                  height={component.h}
                  rx={0.9}
                />
                <text
                  className="vboard-chip-label"
                  x={component.x + component.w / 2}
                  y={
                    component.y +
                    component.h / 2 -
                    (component.sublabel ? fontSize * 0.25 : -fontSize * 0.35)
                  }
                  textAnchor="middle"
                  fontSize={fontSize * 0.95}
                >
                  {component.label}
                </text>
                {component.sublabel ? (
                  <text
                    className="vboard-chip-sublabel"
                    x={component.x + component.w / 2}
                    y={component.y + component.h / 2 + fontSize}
                    textAnchor="middle"
                    fontSize={fontSize * 0.62}
                  >
                    {component.sublabel}
                  </text>
                ) : null}
              </g>
            );
          }

          if (component.kind === "clock") {
            const key = pinKeyFor(component);
            const label = component.label ?? component.clockName;
            return (
              <g
                key={index}
                {...interactiveProps(component, `clock ${component.clockName}`)}
              >
                <title>{`${component.clockName} (clock)`}</title>
                {renderSelectionRing(
                  component.x + 2.1,
                  component.y + 1.3,
                  3.2,
                  key,
                )}
                <rect
                  className="vboard-clock"
                  x={component.x}
                  y={component.y}
                  width={4.2}
                  height={2.6}
                  rx={1.2}
                />
                <text
                  className="vboard-silk"
                  x={component.x + 2.1}
                  y={component.y + 2.6 + fontSize}
                  textAnchor="middle"
                  fontSize={fontSize * 0.7}
                >
                  {label}
                </text>
              </g>
            );
          }

          if (component.kind === "led") {
            const pin = pinsByName.get(component.pinName);
            if (!pin) return null;
            const key = pinKeyFor(component);
            const palette = LED_PALETTE[component.color ?? "green"];
            const rawState = signalStates?.[pin.name];
            const isOn = pin.activeLow ? rawState === false : rawState === true;
            const label = component.label ?? pin.name;

            return (
              <g
                key={index}
                {...interactiveProps(component, `LED ${pin.name}`)}
              >
                <title>{`${pin.name} (LED, pin ${pin.pin})`}</title>
                {renderSelectionRing(component.x, component.y, 2.5, key)}
                {isOn ? (
                  <circle
                    cx={component.x}
                    cy={component.y}
                    r={2.6}
                    fill={palette.glow}
                  />
                ) : null}
                <circle
                  className="vboard-led"
                  cx={component.x}
                  cy={component.y}
                  r={1.4}
                  fill={isOn ? palette.on : palette.off}
                />
                <text
                  className="vboard-silk"
                  x={component.x}
                  y={component.y + 1.4 + fontSize}
                  textAnchor="middle"
                  fontSize={fontSize * 0.62}
                >
                  {label}
                </text>
              </g>
            );
          }

          // button
          const pin = pinsByName.get(component.pinName);
          if (!pin) return null;
          const key = pinKeyFor(component);
          const rawState = signalStates?.[pin.name];
          const isPressed = pin.activeLow
            ? rawState === false
            : rawState === true;
          const label = component.label ?? pin.name;
          const size = 4;

          return (
            <g
              key={index}
              {...interactiveProps(component, `button ${pin.name}`)}
            >
              <title>{`${pin.name} (button, pin ${pin.pin})`}</title>
              {renderSelectionRing(component.x, component.y, 3.1, key)}
              <rect
                className="vboard-button-base"
                x={component.x - size / 2}
                y={component.y - size / 2}
                width={size}
                height={size}
                rx={0.7}
              />
              <circle
                className={`vboard-button-cap${isPressed ? " pressed" : ""}`}
                cx={component.x}
                cy={component.y}
                r={1.3}
              />
              <text
                className="vboard-silk"
                x={component.x}
                y={component.y + size / 2 + fontSize}
                textAnchor="middle"
                fontSize={fontSize * 0.62}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      {showCaption ? (
        <div className="vboard-caption">
          {layout.handcrafted
            ? "Stylized layout — placement follows the physical board."
            : "Generic layout — this board does not have a hand-drawn view yet."}
        </div>
      ) : null}
    </div>
  );
}
