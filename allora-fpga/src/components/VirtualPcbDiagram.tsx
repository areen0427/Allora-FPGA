import type { ReactNode } from "react";

type VirtualPcbDiagramProps = {
  ariaLabel: string;
  boardLabel?: string;
  chipLabel?: string;
  chipSublabel?: string;
  clockHz?: number;
  inputs?: boolean[];
  onToggleInput?: (index: number) => void;
  className?: string;
  children?: ReactNode;
};

/**
 * Shared Allora PCB chassis used by welcome, pin browsing, project setup, and
 * board interaction surfaces. Feature-specific controls are layered into the
 * overlay while the board silhouette and component language stay consistent.
 */
export default function VirtualPcbDiagram({
  ariaLabel,
  boardLabel = "ALLORA LABS · VIRTUAL I/O",
  chipLabel = "VIRTUAL FPGA",
  chipSublabel = "RTL ENGINE",
  clockHz = 100_000_000,
  inputs,
  onToggleInput,
  className = "",
  children,
}: VirtualPcbDiagramProps) {
  const showIo = Boolean(inputs?.length);
  const frequencyMhz = Math.max(1, Math.round(clockHz / 1_000_000));

  return (
    <div
      className={`professional-board shared-virtual-pcb${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
    >
      <span className="board-mount board-mount-nw" aria-hidden="true" />
      <span className="board-mount board-mount-ne" aria-hidden="true" />
      <span className="board-mount board-mount-sw" aria-hidden="true" />
      <span className="board-mount board-mount-se" aria-hidden="true" />
      <div className="board-silkscreen board-silkscreen-top">{boardLabel}</div>
      <div className="board-header-row board-header-top" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => <i key={index} />)}
      </div>
      <div className="board-fpga-package" aria-hidden={Boolean(children)}>
        <span>ALLORA</span>
        <strong>{chipLabel}</strong>
        <small>{chipSublabel} · {frequencyMhz} MHz</small>
        <i className="board-pin-one" />
      </div>
      <div className="board-clock" aria-hidden="true">
        <span>OSC</span>
        <strong>{frequencyMhz}.000</strong>
      </div>
      <div className="board-usb" aria-hidden="true">
        <span>USB-C</span>
      </div>

      {showIo ? (
        <>
          <div className="board-led-bank" aria-label="Output LEDs">
            {inputs?.map((active, index) => (
              <span key={index}>
                <i className={active ? "on" : ""} />
                <small>LD{index}</small>
              </span>
            ))}
          </div>
          <div className="board-input-bank" aria-label="Input switches">
            {inputs?.map((active, index) => (
              <button
                type="button"
                key={index}
                className={active ? "is-on" : ""}
                aria-pressed={active}
                aria-label={`Toggle virtual input ${index}`}
                onClick={() => onToggleInput?.(index)}
              >
                <i />
                <small>SW{index}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {children ? <div className="virtual-pcb-overlay">{children}</div> : null}

      <div className="board-header-row board-header-bottom" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => <i key={index} />)}
      </div>
    </div>
  );
}
