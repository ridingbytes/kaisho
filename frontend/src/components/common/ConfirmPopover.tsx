import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
 * popover that appears on click. Clicking outside or
 * pressing the X dismisses it.
 */
export function ConfirmPopover({
  children,
  label = "Delete?",
  onConfirm,
  disabled,
}: ConfirmPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node)
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

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={(e) => {
          if (disabled) return;
          e.stopPropagation();
          setOpen(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
      {open && (
        <div
          className={[
            "absolute right-0 top-full mt-1 z-50",
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
        </div>
      )}
    </div>
  );
}
