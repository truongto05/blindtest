import { X } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "../../hooks/useModalFocus";

type Props = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
};

export function PlaylistDialog({
  title,
  children,
  onClose,
  busy = false,
}: Props) {
  const titleId = useId();
  const modal = useRef<HTMLElement>(null);
  useModalFocus(true, modal, busy ? undefined : onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-ink-950/90 p-3 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-md border border-white/10 bg-ink-900 p-5 sm:p-7"
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <h2
            id={titleId}
            className="min-w-0 break-words pt-2 text-2xl font-bold"
          >
            {title}
          </h2>
          <button
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer la fenêtre"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
