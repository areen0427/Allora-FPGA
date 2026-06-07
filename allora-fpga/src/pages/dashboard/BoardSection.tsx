import type { BoardDefinition } from "../../data/boards";
import InfoCard, { InfoRow } from "./InfoCard";

export default function BoardSection({ board }: { board: BoardDefinition }) {
  return (
    <InfoCard title="Board Information">
      <InfoRow label="Vendor" value={board.vendor} />
      <InfoRow label="Family" value={board.family} />
      <InfoRow label="Device" value={board.device} />
      <InfoRow label="Package" value={board.package} />
      <InfoRow label="Constraint Format" value={board.constraintsFile.toUpperCase()} />
    </InfoCard>
  );
}
