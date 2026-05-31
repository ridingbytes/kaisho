import {
  KeyboardEvent,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";

interface Props {
  /** Controls visibility. */
  open: boolean;
  /** Called when the user presses Escape, clicks the
   *  backdrop, or clicks the close button. */
  onClose: () => void;
  /** Heading rendered in the dialog header. */
  title: ReactNode;
  /** Optional subtitle / description under the title. */
  subtitle?: ReactNode;
  /** Body content. */
  children: ReactNode;
  /** Optional footer (typically a row of buttons). */
  footer?: ReactNode;
  /** Width preset for the panel. */
  size?: "sm" | "md" | "lg";
  /** Disable backdrop click-to-close (for forms with
   *  unsaved state). Escape still works. */
  noBackdropClose?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

/**
 * Centered modal dialog with backdrop + focus management.
 *
 * - Escape closes
 * - Click on backdrop closes (unless ``noBackdropClose``)
 * - Body scroll is locked while open
 * - Focus is restored to the previously-focused element on
 *   close
 *
 *     <Dialog
 *       open={open}
 *       onClose={() => setOpen(false)}
 *       title="Confirm delete"
 *       footer={
 *         <>
 *           <Button variant="secondary" onClick={cancel}>
 *             Cancel
 *           </Button>
 *           <Button variant="danger" onClick={confirm}>
 *             Delete
 *           </Button>
 *         </>
 *       }
 *     >
 *       Are you sure?
 *     </Dialog>
 */
export function Dialog({
  open, onClose, title, subtitle, children, footer,
  size = "md", noBackdropClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Body scroll lock + focus restore.
  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current =
      document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Auto-focus the dialog panel itself so Escape works
    // without the user clicking inside first.
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      lastFocusedRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  function onBackdrop(e: React.MouseEvent) {
    if (noBackdropClose) return;
    if (e.target === e.currentTarget) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onBackdrop}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={onKey}
        className={[
          "w-full flex flex-col",
          "bg-surface-card border border-border rounded-lg",
          "shadow-card-drag outline-none",
          "max-h-[90vh] overflow-hidden",
          SIZE_CLASSES[size],
        ].join(" ")}
      >
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border-subtle">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-fg-strong truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-fg-muted mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X size={14} />}
            onClick={onClose}
          >
            Close
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
          {children}
        </div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-subtle">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
