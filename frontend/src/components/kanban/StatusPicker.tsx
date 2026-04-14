/**
 * StatusPicker -- Dropdown menu for changing a task's status.
 * Closes when clicking outside.
 */
import { useEffect, useRef } from "react";

interface TaskState {
  name: string;
  label: string;
  color: string;
}

interface StatusPickerProps {
  /** Current status name (shown as disabled). */
  current: string;
  /** Available task states from settings. */
  states: TaskState[];
  /** Called with the chosen status name. */
  onSelect: (status: string) => void;
  /** Called when the picker should close. */
  onClose: () => void;
}

/**
 * Renders an absolutely-positioned dropdown listing all
 * available task states. The current state is disabled.
 * Clicking outside closes the picker.
 */
export function StatusPicker({
  current,
  states,
  onSelect,
  onClose,
}: StatusPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onClick);
    return () =>
      document.removeEventListener(
        "mousedown",
        onClick,
      );
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={[
        "absolute left-2 bottom-0 translate-y-full",
        "z-50 py-1 rounded-lg shadow-lg",
        "bg-surface-card border border-border",
        "min-w-[120px]",
      ].join(" ")}
    >
      {states.map((s) => (
        <button
          key={s.name}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(s.name);
          }}
          disabled={s.name === current}
          className={[
            "w-full flex items-center gap-2",
            "px-3 py-1.5 text-xs text-left",
            "transition-colors",
            s.name === current
              ? "text-stone-400 cursor-default"
              : "text-stone-800 hover:bg-surface-raised",
          ].join(" ")}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: s.color }}
          />
          {s.label || s.name}
        </button>
      ))}
    </div>
  );
}
