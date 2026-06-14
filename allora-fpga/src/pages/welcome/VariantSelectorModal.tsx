import type { VariantBoardCatalogItem } from "../../data/boardSupport";

type VariantSelectorModalProps = {
  board: VariantBoardCatalogItem;
  onSelectVariant: (boardId: string) => void;
  onClose: () => void;
};

export function VariantSelectorModal({
  board,
  onSelectVariant,
  onClose,
}: VariantSelectorModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="variant-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="variant-modal-header">
          <h2>Select {board.name} Variant</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="variant-grid">
          {board.variants.map((variant) => (
            <button
              className="variant-card"
              type="button"
              key={variant.id}
              onClick={() => onSelectVariant(variant.id)}
            >
              <h3>{variant.name}</h3>
              <p>{variant.fpga}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
