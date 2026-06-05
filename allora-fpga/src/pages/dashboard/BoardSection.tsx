import type { BoardDefinition } from "../../data/boards";
import InfoCard, { InfoRow } from "./InfoCard";
import { formatSynthesisFlow } from "./format";

export default function BoardSection({ board }: { board: BoardDefinition }) {
  return (
    <InfoCard title="Board Information">
      <InfoRow label="Vendor" value={board.vendor} />
      <InfoRow label="Family" value={board.family} />
      <InfoRow label="Device" value={board.device} />
      <InfoRow label="Package" value={board.package} />
      <InfoRow label="Constraint Format" value={board.constraintsFile.toUpperCase()} />
      <InfoRow label="Synthesis Flow" value={formatSynthesisFlow(board.synthesisFlow)} />
    </InfoCard>
  );
}