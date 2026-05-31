import {
  KeyboardEvent,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";

interface Props {
  /** Controls visibility. */
  open: boolean;
  /** Called on Escape or outside-click. */
  onClose: () => void;
  /** Body content. */
  children: ReactNode;
  /** Element to anchor against. The popover renders below
   *  and aligned to its left edge by default. */
  anchorRef: React.RefObject<HTMLElement>;
  /** Vertical placement. */
  placement?: "below" | "above";
  /** Horizontal alignment relative to the anchor. */
  align?: "start" | "end";
  /** Extra Tailwind classes for the panel. */
  className?: string;
}

/**
 * Anchored popover with backdrop click-out + Escape close.
 *
 * Pairs with a button/input that owns ``anchorRef``. The
 * popover positions itself relative to the anchor's
 * bounding rect on open and on window resize/scroll.
 *
 * Use ``Dialog`` for modal flows; use ``Popover`` for
 * non-modal overlays (autocomplete results, menus,
 * contextual previews).
 */
export function Popover({
  open, onClose, children, anchorRef,
  placement = "below", align = "start", className = "",
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function position() {
      const a = anchorRef.current;
      const p = panelRef.current;
      if (!a || !p) return;
      const r = a.getBoundingClientRect();
      const top = placement === "below"
        ? r.bottom + 4
        : r.top - p.offsetHeight - 4;
      const left = align === "start"
        ? r.left
        : r.right - p.offsetWidth;
      p.style.top = `${Math.max(4, top)}px`;
      p.style.left = `${Math.max(4, left)}px`;
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, placement, align, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const p = panelRef.current;
      const a = anchorRef.current;
      const t = e.target as Node;
      if (!p || !a) return;
      if (p.contains(t) || a.contains(t)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") onClose();
  }

  return createPortal(
    <div
      ref={panelRef}
      onKeyDown={onKey}
      className={[
        "fixed z-50",
        "bg-surface-card border border-border rounded-lg",
        "shadow-card-drag",
        "outline-none",
        className,
      ].filter(Boolean).join(" ")}
      role="dialog"
    >
      {children}
    </div>,
    document.body,
  );
}
