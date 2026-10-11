import { useId, useRef } from "react";
import type { VariantBoardCatalogItem } from "../../data/boardSupport";
import { useModalFocus } from "../../hooks/useModalFocus";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(dialogRef, onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="variant-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="variant-modal-header">
          <h2 id={titleId}>Select {board.name} Variant</h2>

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
