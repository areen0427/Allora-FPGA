import type { BoardDefinition } from "../../data/boards";
import { getBoardCapabilities } from "../../data/boardCapabilities";
import InfoCard, { InfoRow } from "./InfoCard";

export default function BoardSection({ board }: { board: BoardDefinition }) {
  const capabilities = getBoardCapabilities(board);

  return (
    <InfoCard title="Board Information">
      <InfoRow label="Vendor" value={board.vendor} />
      <InfoRow label="Family" value={board.family} />
      <InfoRow label="Device" value={board.device} />
      <InfoRow label="Package" value={board.package} />
      <InfoRow label="Constraint Format" value={board.constraintsFile.toUpperCase()} />
      <InfoRow label="Toolchain" value={capabilities.toolchain} />
      <InfoRow
        label="Synthesis Diagram"
        value={capabilities.synthesisDiagram.label}
      />
      <InfoRow label="Bitstream" value={capabilities.bitstream.label} />
    </InfoCard>
  );
}
