/**
 * StateHistoryPopup -- Modal overlay showing the chronological
 * history of status changes for a task.
 */
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("kanban");
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
        className="relative bg-surface-card rounded-lg shadow-lg border border-border p-5 w-80 max-h-[60vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold tracking-wider uppercase text-fg-muted">
            {t("stateHistory")}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-fg-subtle hover:text-fg-strong"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {history.map((h, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs py-1"
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-fg-subtle" />
              <span className="font-medium text-fg-strong">
                {h.to}
              </span>
              <span className="text-fg-muted">
                {t("from")} {h.from}
              </span>
              <RelDate
                date={h.timestamp}
                className="ml-auto text-fg-subtle text-2xs"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
