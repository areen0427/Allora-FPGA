import { useEffect, useLayoutEffect, useRef } from "react";
import type { VariantBoardCatalogItem } from "../../data/boardSupport";

type VariantSelectorPopupProps = {
  id: string;
  board: VariantBoardCatalogItem;
  anchor: HTMLButtonElement;
  selectedBoardId: string | null;
  onSelectVariant: (boardId: string) => void;
  onClose: () => void;
};

export function VariantSelectorPopup({
  id,
  board,
  anchor,
  selectedBoardId,
  onSelectVariant,
  onClose,
}: VariantSelectorPopupProps) {
  const popupRef = useRef<HTMLElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = id + "-title";

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    const activePopup = popup;
    if (!activePopup.matches(":popover-open")) activePopup.showPopover();

    function positionPopup() {
      const source = anchor.getBoundingClientRect();
      if (!anchor.isConnected) {
        onCloseRef.current();
        return;
      }

      const edge = 16;
      const gap = 8;
      const width = Math.min(360, window.innerWidth - edge * 2);
      activePopup.style.width = String(width) + "px";
      activePopup.style.maxHeight =
        String(Math.max(180, window.innerHeight - edge * 2)) + "px";

      const height = activePopup.offsetHeight;
      const canOpenRight = source.right + gap + width <= window.innerWidth - edge;
      const canOpenLeft = source.left - gap - width >= edge;
      let placement: "right" | "left" | "below" | "above";
      let left: number;
      let top: number;

      if (canOpenRight || canOpenLeft) {
        placement = canOpenRight ? "right" : "left";
        left = canOpenRight ? source.right + gap : source.left - width - gap;
        top = Math.max(
          edge,
          Math.min(source.top, window.innerHeight - height - edge),
        );
      } else {
        /* In a stacked workspace, keep the popup beside the clicked row and
           tuck it against the viewport edge instead of covering rows below. */
        placement = "right";
        left = Math.max(
          edge,
          Math.min(
            source.right - width + gap,
            window.innerWidth - width - edge,
          ),
        );
        top = Math.max(
          edge,
          Math.min(source.top, window.innerHeight - height - edge),
        );
      }

      activePopup.dataset.placement = placement;
      activePopup.style.left = String(left) + "px";
      activePopup.style.top = String(top) + "px";
    }

    positionPopup();
    activePopup.classList.add("glass-unfold");
    const focusFrame = window.requestAnimationFrame(() => {
      (selectedOptionRef.current ?? firstOptionRef.current)?.focus();
    });
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
      activePopup.classList.remove("glass-unfold");
      if (activePopup.matches(":popover-open")) activePopup.hidePopover();
    };
  }, [anchor]);

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (popupRef.current?.contains(target) || anchor.contains(target)) return;
      onCloseRef.current();
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
      anchor.focus();
    }

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [anchor]);

  return (
    <section
      ref={popupRef}
      id={id}
      popover="manual"
      className="welcome-product-info pin-variant-popup"
      role="dialog"
      aria-labelledby={titleId}
    >
      <header className="pin-variant-popup-header">
        <span>Pin mapping</span>
        <h2 id={titleId}>Choose a {board.name} variant</h2>
      </header>

      <div
        className="pin-variant-options ui-button-group ui-selection-group ui-quiet-selection-group"
        role="group"
        aria-label={board.name + " variants"}
      >
        {board.variants.map((variant, index) => {
          const isSelected = variant.id === selectedBoardId;
          return (
            <button
              key={variant.id}
              ref={
                isSelected
                  ? selectedOptionRef
                  : index === 0
                    ? firstOptionRef
                    : undefined
              }
              className="pin-variant-option"
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                anchor.focus();
                onSelectVariant(variant.id);
              }}
            >
              <strong>{variant.name}</strong>
              <span>{variant.fpga}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
