import type { BoardDefinition } from "../data/boards";
import { getFpgaForBoard } from "../data/fpgas";
import {
  formatClockFrequency,
  getResourceGroupsForBrowser,
} from "../data/pinResourceGroups";

/** Catalog facts shared by setup and both editable/read-only pin workspaces. */
export default function BoardResourceSummary({
  board,
}: {
  board: BoardDefinition;
}) {
  const fpga = getFpgaForBoard(board);
  const peripherals = getResourceGroupsForBrowser(board).filter((group) =>
    group.pins.some((pin) => !["clock", "led", "button"].includes(pin.type)),
  );
  return (
    <section
      className="board-resource-summary"
      aria-label={`${board.name} resource specifications`}
    >
      <dl className="board-resource-specs">
        <div>
          <dt>{fpga?.logicUnit ?? "Logic resources"}</dt>
          <dd>{fpga?.logicCells?.toLocaleString() ?? "Not verified"}</dd>
        </div>
        <div>
          <dt>Block RAM</dt>
          <dd>
            {fpga?.bramKb === undefined
              ? "Not verified"
              : `${fpga.bramKb.toLocaleString()} Kibit`}
          </dd>
        </div>
        <div>
          <dt>{fpga?.dspUnit ?? "DSP resources"}</dt>
          <dd>
            {fpga?.dsp === undefined
              ? "Not verified"
              : fpga.dsp.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt>PLLs</dt>
          <dd>
            {fpga?.pll === undefined
              ? "Not verified"
              : fpga.pll.toLocaleString()}
          </dd>
        </div>
        {fpga?.spramKb !== undefined ? (
          <div>
            <dt>SPRAM</dt>
            <dd>{fpga.spramKb.toLocaleString()} Kibit</dd>
          </div>
        ) : null}
        {fpga?.largeRamKb !== undefined ? (
          <div>
            <dt>Large RAM (LRAM)</dt>
            <dd>{fpga.largeRamKb.toLocaleString()} Kibit</dd>
          </div>
        ) : null}
        {fpga?.ultraRamKb !== undefined ? (
          <div>
            <dt>UltraRAM</dt>
            <dd>{fpga.ultraRamKb.toLocaleString()} Kibit</dd>
          </div>
        ) : null}
      </dl>
      <div className="board-resource-facts">
        <h4>Clock sources</h4>
        {board.clocks.length ? (
          <ul>
            {board.clocks.map((clock) => (
              <li key={clock.name}>
                <strong>{clock.name}</strong>
                <span>
                  {formatClockFrequency(clock.frequency)}
                  {clock.role === "reference"
                    ? " · dedicated reference"
                    : ""} ·{" "}
                  {clock.pin
                    ? clock.differentialPin
                      ? `pins ${clock.pin} / ${clock.differentialPin}`
                      : `pin ${clock.pin}`
                    : clock.source === "internal-hfosc"
                      ? "internal oscillator"
                      : "pin not verified"}
                  {clock.ioStandard ? ` · ${clock.ioStandard}` : ""}
                  {!clock.verified ? " · unverified" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No verified clock sources in this profile.</p>
        )}
      </div>
      {peripherals.length ? (
        <div className="board-resource-facts">
          <h4>Peripheral / connector mappings</h4>
          <p>
            {peripherals
              .map((group) => `${group.title} (${group.pins.length} mappings)`)
              .join(" · ")}
          </p>
        </div>
      ) : null}
      {board.sources?.length ? (
        <details className="board-resource-sources">
          <summary>Board pin / clock sources</summary>
          <ul>
            {board.sources.map((source) => (
              <li key={`${source.url}:${source.revision ?? ""}`}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.label}
                </a>
                {source.revision ? ` · revision ${source.revision}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {board.notes ? (
        <details className="board-resource-sources">
          <summary>Board profile notes</summary>
          <p>{board.notes}</p>
        </details>
      ) : null}
      {fpga?.sources?.length ? (
        <details className="board-resource-sources">
          <summary>Device resource sources</summary>
          {fpga.notes ? <p>{fpga.notes}</p> : null}
          <ul>
            {fpga.sources.map((source) => (
              <li key={`${source.url}:${source.section ?? ""}`}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                {source.section ? ` · ${source.section}` : ""} · checked{" "}
                {source.checkedAt}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
