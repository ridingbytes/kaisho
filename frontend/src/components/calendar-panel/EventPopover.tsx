import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Clock4, X } from "lucide-react";

import type { CalendarEvent } from "../../api/client";
import { Button } from "../common/Button";
import { colorFor } from "./calendarColors";
import { hhmm, parseIso, sameDay } from "./dateUtils";

interface Props {
  event: CalendarEvent;
  onClose: () => void;
  onBook?: (event: CalendarEvent) => void;
}

/** Side popover with full event details: title, when,
 *  where, organizer, source. Read-only in PR 4. Closes on
 *  backdrop click and Escape. */
export function EventPopover({
  event, onClose, onBook,
}: Props) {
  const { t, i18n } = useTranslation("calendar");
  const color = colorFor(event);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/30 flex justify-end"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-md h-full bg-surface-card shadow-2xl border-l border-border p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-6 rounded ${color.bar}`}
            />
            <h2 className="text-sm font-semibold text-fg-strong truncate">
              {event.title || "(no title)"}
            </h2>
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
        <DetailRow
          label={t("when")}
          value={formatWhen(event, i18n.language)}
        />
        {event.location && (
          <DetailRow
            label={t("where")}
            value={event.location}
          />
        )}
        <DetailRow
          label={t("source.label")}
          value={t(`source.${event.source}`)}
        />
        {event.status && (
          <DetailRow
            label={t("status")}
            value={event.status}
          />
        )}
        {event.html_link && (
          <a
            href={event.html_link}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-cta hover:text-cta-hover underline"
          >
            {t("openExternal")}
          </a>
        )}
        {onBook && (
          <div className="mt-auto pt-3 border-t border-border">
            <Button
              onClick={() => onBook(event)}
              icon={<Clock4 className="w-4 h-4" />}
              className="w-full"
            >
              {t("bookFromEvent")}
            </Button>
            <p className="text-2xs text-fg-muted mt-1 text-center">
              {t("bookFromEventHint")}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}


function DetailRow({
  label, value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wide text-fg-muted">
        {label}
      </div>
      <div className="text-sm text-fg-strong">
        {value}
      </div>
    </div>
  );
}


function formatWhen(event: CalendarEvent, locale: string) {
  const start = parseIso(event.start);
  const end = parseIso(event.end);
  const dateFmt = new Intl.DateTimeFormat(locale, {
    weekday: "long", year: "numeric",
    month: "long", day: "numeric",
  });

  if (event.all_day) {
    return sameDay(start, end)
      ? dateFmt.format(start)
      : `${dateFmt.format(start)} – ${dateFmt.format(end)}`;
  }

  const sameDayEvt = sameDay(start, end);
  if (sameDayEvt) {
    return `${dateFmt.format(start)}, ${hhmm(start)}–${hhmm(end)}`;
  }
  return (
    `${dateFmt.format(start)} ${hhmm(start)} → `
    + `${dateFmt.format(end)} ${hhmm(end)}`
  );
}
