import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import type { CalendarEvent } from "../../api/client";
import { QuickBookForm } from "../clock/QuickBookForm";
import { parseIso } from "./dateUtils";

interface Props {
  event: CalendarEvent;
  onClose: () => void;
}

/** Modal wrapping `QuickBookForm` with fields prefilled
 *  from a calendar event. The user can correct anything
 *  (customer, contract, notes) before saving -- the
 *  prefill is just a shortcut, not a hard binding. */
export function BookFromEventDialog({
  event, onClose,
}: Props) {
  const { t } = useTranslation("calendar");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-card rounded-2xl border border-border shadow-2xl w-full max-w-lg p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg-strong">
              {t("bookFromEvent")}
            </h2>
            <p className="text-[10px] text-fg-muted mt-0.5 truncate">
              {event.title || "(no title)"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-raised text-fg-muted"
            aria-label={t("close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <QuickBookForm
          defaultDate={toDateInput(event.start)}
          initial={prefillFromEvent(event)}
          onDone={onClose}
        />
      </div>
    </div>
  );
}


function prefillFromEvent(e: CalendarEvent) {
  return {
    duration: durationFor(e),
    description: e.title,
  };
}


function durationFor(e: CalendarEvent): string {
  if (e.all_day) return "1h";
  const start = parseIso(e.start);
  const end = parseIso(e.end);
  const minutes = Math.max(
    1, Math.round((end.getTime() - start.getTime()) / 60000),
  );
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m}m`;
}


function toDateInput(iso: string): string {
  const d = parseIso(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
