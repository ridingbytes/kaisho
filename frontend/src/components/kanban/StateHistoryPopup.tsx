/**
 * StateHistoryPopup -- Modal overlay showing the chronological
 * history of status changes for a task.
 */
import { X } from "lucide-react";
import { RelDate } from "../common/RelDate";

interface StateHistoryEntry {
  from: string;
  to: string;
  timestamp: string;
}

interface StateHistoryPopupProps {
  /** List of state transitions to display. */
  history: StateHistoryEntry[];
  /** Called when the popup should close. */
  onClose: () => void;
}

/**
 * Renders a centered modal with a backdrop listing each
 * state transition (from -> to) with a relative timestamp.
 * Closes on backdrop click or Escape key.
 */
export function StateHistoryPopup({
  history,
  onClose,
}: StateHistoryPopupProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-surface-card rounded-xl shadow-lg border border-border p-5 w-80 max-h-[60vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
            State History
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-stone-400 hover:text-stone-900"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {history.map((h, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-[11px] py-1"
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-stone-400" />
              <span className="font-medium text-stone-800">
                {h.to}
              </span>
              <span className="text-stone-500">
                from {h.from}
              </span>
              <RelDate
                date={h.timestamp}
                className="ml-auto text-stone-400 text-[10px]"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
