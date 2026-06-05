import type { BoardDefinition } from "../../data/boards";
import InfoCard, { InfoRow } from "./InfoCard";

export default function ConstraintsSection({
  board,
}: {
  board: BoardDefinition;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "22px",
      }}
    >
      <InfoCard title="Constraint Summary">
        <InfoRow label="Format" value={board.constraintsFile.toUpperCase()} />
        <InfoRow label="Clock Pins" value={String(board.clocks.length)} />
        <InfoRow label="LED Pins" value={String(board.leds.length)} />
        <InfoRow label="Button Pins" value={String(board.buttons.length)} />
      </InfoCard>

      <InfoCard title="Generated File">
        <InfoRow label="Filename" value={`constraints.${board.constraintsFile}`} />
        <InfoRow label="Source" value="Board database" />
      </InfoCard>

      <PinGroup title="Clocks" pins={board.clocks} />
      <PinGroup title="LEDs" pins={board.leds} />
      <PinGroup title="Buttons" pins={board.buttons} />
    </div>
  );
}

function PinGroup({
  title,
  pins,
}: {
  title: string;
  pins: Array<{ name: string; pin?: string; activeLow?: boolean }>;
}) {
  return (
    <InfoCard title={title}>
      {pins.length === 0 ? (
        <p style={{ margin: 0, color: "#64748b", fontSize: "16px" }}>
          No pins defined yet.
        </p>
      ) : (
        pins.map((pin) => (
          <div
            key={pin.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 0",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: "16px" }}>
                {pin.name}
              </div>

              {pin.activeLow && (
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "13px",
                    color: "#64748b",
                    fontWeight: 700,
                  }}
                >
                  Active low
                </div>
              )}
            </div>

            <div
              style={{
                padding: "7px 11px",
                borderRadius: "999px",
                background: "#f1f5f9",
                color: "#0f172a",
                fontWeight: 800,
                fontSize: "14px",
              }}
            >
              {pin.pin}
            </div>
          </div>
        ))
      )}
    </InfoCard>
  );
}