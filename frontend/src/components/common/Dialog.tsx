import {
  KeyboardEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
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
  size?: "sm" | "md" | "lg" | "xl";
  /** Disable backdrop click-to-close (for forms with
   *  unsaved state). Escape still works. */
  noBackdropClose?: boolean;
  /** Show a corner handle to drag-resize the panel. The
   *  chosen size is kept while the dialog stays mounted. */
  resizable?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const MIN_W = 360;
const MIN_H = 240;

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
  size = "md", noBackdropClose, resizable,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  // Explicit pixel size once the user drags the handle;
  // ``null`` falls back to the responsive width preset.
  const [dims, setDims] = useState<
    { w: number; h: number } | null
  >(null);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = rect.width;
    const startH = rect.height;
    // The panel is centred, so each edge moves by half the
    // width change -- double the delta so the corner tracks
    // the pointer.
    function onMove(ev: PointerEvent) {
      setDims({
        w: Math.max(
          MIN_W,
          startW + (ev.clientX - startX) * 2,
        ),
        h: Math.max(
          MIN_H,
          startH + (ev.clientY - startY) * 2,
        ),
      });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

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
        style={
          dims
            ? {
                width: dims.w,
                height: dims.h,
                maxWidth: "95vw",
                maxHeight: "95vh",
              }
            : undefined
        }
        className={[
          "relative w-full flex flex-col",
          "bg-surface-card border border-border rounded-lg",
          "shadow-card-drag outline-none",
          dims ? "" : "max-h-[90vh]",
          "overflow-hidden",
          dims ? "" : SIZE_CLASSES[size],
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

        {resizable && (
          <div
            onPointerDown={startResize}
            title="Drag to resize"
            className={[
              "absolute bottom-0 right-0 z-10",
              "w-4 h-4 cursor-nwse-resize",
              "text-fg-subtle hover:text-fg-muted",
            ].join(" ")}
          >
            <svg
              viewBox="0 0 10 10"
              className="w-full h-full"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <path d="M9 3 L3 9 M9 6 L6 9" />
            </svg>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
