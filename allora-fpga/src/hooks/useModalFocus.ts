import { useEffect, useRef, type RefObject } from "react";

const activeDialogs: HTMLElement[] = [];

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]',
  )).filter((element) =>
    element.tabIndex >= 0 &&
    !element.matches(":disabled") &&
    !element.closest("[inert]") &&
    element.getClientRects().length > 0,
  );
}

/** Shared keyboard behavior for blocking overlays. Native dialogs keep their own trap. */
export function useModalFocus(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const ownerDocument = dialog.ownerDocument;
    const previouslyFocused = ownerDocument.activeElement as HTMLElement | null;
    activeDialogs.push(dialog);
    const focusable = focusableElements(dialog);
    const initial = initialFocusRef?.current;
    (initial && focusable.includes(initial) ? initial : focusable[0] ?? dialog)
      .focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || activeDialogs.at(-1) !== dialog) return;
      // A native showModal() above this overlay owns focus and Escape itself.
      const nativeDialog = ownerDocument.querySelector("dialog:modal");
      if (nativeDialog && !nativeDialog.contains(dialog)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusableElements(dialog);
      const first = elements[0];
      const last = elements.at(-1);
      const active = ownerDocument.activeElement;
      if (!first || !last) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
      } else if (!dialog.contains(active) || active === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("keydown", handleKeyDown);
      const wasTopmost = activeDialogs.at(-1) === dialog;
      activeDialogs.splice(activeDialogs.lastIndexOf(dialog), 1);
      if (wasTopmost && previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [dialogRef, initialFocusRef]);
}
