import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ConfirmPopoverProps {
  /** The trigger element (typically a button). */
  children: React.ReactNode;
  /** Label shown in the popover, e.g. "Delete?" */
  label?: string;
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Disable the trigger button. */
  disabled?: boolean;
}

/**
 * Wraps a trigger element with a small confirmation
 * popover that appears on click. Rendered via a portal
 * so it's never clipped by parent overflow or stacking
 * contexts. Clicking outside or pressing X dismisses.
 */
export function ConfirmPopover({
  children,
  label = "Delete?",
  onConfirm,
  disabled,
}: ConfirmPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    // Position below the trigger element
    if (triggerRef.current) {
      const rect =
        triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 180),
      });
    }
    function onMouseDown(e: MouseEvent) {
      if (
        popRef.current &&
        !popRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () =>
      document.removeEventListener(
        "mousedown",
        onMouseDown,
      );
  }, [open]);

  const popover = open
    ? createPortal(
        <div
          ref={popRef}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
          }}
          className={[
            "flex items-center gap-1 px-2 py-1",
            "rounded bg-surface-overlay",
            "border border-border shadow-lg",
            "whitespace-nowrap",
          ].join(" ")}
        >
          <span className="text-[10px] text-stone-700">
            {label}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
              setOpen(false);
            }}
            className={[
              "p-0.5 rounded text-red-400",
              "hover:bg-red-500/10",
            ].join(" ")}
          >
            <Check size={10} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className={[
              "p-0.5 rounded text-stone-600",
              "hover:text-stone-900",
            ].join(" ")}
          >
            <X size={10} />
          </button>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        ref={triggerRef}
        onClick={(e) => {
          if (disabled) return;
          e.stopPropagation();
          setOpen(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
      {popover}
    </>
  );
}
