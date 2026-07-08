/**
 * @module TreeContextMenu
 *
 * A lightweight right-click context menu for the knowledge
 * tree, rendered at the cursor via a portal. Closes on any
 * outside click, Escape, scroll, or resize.
 *
 * Items may opt into an in-menu confirm step (used for
 * Delete) so a destructive action needs two clicks without
 * a separate popover or a blocking browser dialog.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** One entry in a {@link TreeContextMenu}. */
export interface MenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Render a divider instead of a button. */
  separator?: boolean;
  /** Require a second click; shows this label first. */
  confirmLabel?: string;
}

const MENU_W = 180;
const ITEM_H = 32;

/** Context menu anchored near (x, y). */
export function TreeContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  // Keep the menu inside the viewport.
  const left = Math.min(x, window.innerWidth - MENU_W - 8);
  const maxTop =
    window.innerHeight - items.length * ITEM_H - 8;
  const top = Math.max(8, Math.min(y, maxTop));

  function handle(item: MenuItem) {
    if (item.confirmLabel && confirming !== item.key) {
      setConfirming(item.key);
      return;
    }
    item.onClick?.();
    onClose();
  }

  return createPortal(
    <div
      className={
        "fixed z-[70] min-w-44 rounded-md border " +
        "border-border bg-surface-raised shadow-lg " +
        "py-1 text-sm"
      }
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div
            key={item.key || `sep-${i}`}
            className="my-1 border-t border-border-subtle"
          />
        ) : (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            onClick={() => handle(item)}
            className={[
              "w-full flex items-center gap-2 px-3 py-1.5",
              "text-left transition-colors",
              "disabled:opacity-40 disabled:cursor-default",
              item.danger || confirming === item.key
                ? "text-red-400 hover:bg-red-500/10"
                : "text-fg-strong hover:bg-cta-muted " +
                  "hover:text-cta",
            ].join(" ")}
          >
            {item.icon}
            <span className="truncate">
              {confirming === item.key
                ? item.confirmLabel
                : item.label}
            </span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
