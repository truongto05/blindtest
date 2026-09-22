import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocus(
  open: boolean,
  container: RefObject<HTMLElement>,
  onClose?: () => void,
) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open || !container.current) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const modal = container.current;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      [...modal.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) =>
          !item.closest("[hidden], [inert]") &&
          getComputedStyle(item).display !== "none" &&
          getComputedStyle(item).visibility !== "hidden",
      );
    const frame = window.requestAnimationFrame(() =>
      (focusables()[0] || modal).focus(),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = items[0]!;
      const last = items.at(-1)!;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = scroll;
      if (previous?.isConnected) previous.focus();
    };
  }, [open, container]);
}
