import type { ReactNode } from "react";

type VirtualPcbDiagramProps = {
  ariaLabel: string;
  boardLabel?: string;
  chipLabel?: string;
  chipSublabel?: string;
  clockHz?: number;
  vendorLabel?: string;
  showUsb?: boolean;
  showClock?: boolean;
  showHeaders?: boolean;
  io?: { outputs: ReactNode; inputs: ReactNode; resources?: ReactNode };
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
  vendorLabel = "ALLORA",
  showUsb = true,
  showClock = true,
  showHeaders = true,
  io,
  inputs,
  onToggleInput,
  className = "",
  children,
}: VirtualPcbDiagramProps) {
  const showIo = Boolean(inputs?.length);
  const frequencyMhz = clockHz / 1_000_000;
  const frequencyLabel = clockHz >= 1_000_000 ? `${frequencyMhz} MHz`
    : clockHz >= 1_000 ? `${clockHz / 1_000} kHz` : `${clockHz} Hz`;
  const core = <>
    <div className="board-fpga-package" aria-hidden={Boolean(children)}>
      <span>{vendorLabel}</span>
      <strong>{chipLabel}</strong>
      <small>{chipSublabel} · {frequencyLabel}</small>
      <i className="board-pin-one" />
    </div>
    {showClock ? <div className="board-clock" aria-label={`Oscillator ${frequencyLabel}`}>
      <span>OSC</span>
      <strong>{frequencyLabel}</strong>
    </div> : null}
    {showUsb ? <div className="board-usb" aria-hidden="true"><span>USB-C</span></div> : null}
  </>;

  return (
    <div
      className={`professional-board shared-virtual-pcb${io ? " virtual-pcb-flow" : ""}${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
    >
      <span className="board-mount board-mount-nw" aria-hidden="true" />
      <span className="board-mount board-mount-ne" aria-hidden="true" />
      <span className="board-mount board-mount-sw" aria-hidden="true" />
      <span className="board-mount board-mount-se" aria-hidden="true" />
      <div className="board-silkscreen board-silkscreen-top">{boardLabel}</div>
      {showHeaders ? <div className="board-header-row board-header-top" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => <i key={index} />)}
      </div> : null}
      {io ? <div className="virtual-pcb-flow-content">
        {io.outputs}
        <div className="virtual-pcb-core">{core}</div>
        {io.inputs}
        {io.resources}
      </div> : core}

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

      {showHeaders ? <div className="board-header-row board-header-bottom" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => <i key={index} />)}
      </div> : null}
    </div>
  );
}
