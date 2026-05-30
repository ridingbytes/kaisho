import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import type { CalendarEvent } from "../../api/client";
import {
  useCalendarEvents,
  useCalendarSources,
} from "../../hooks/useCalendar";
import { addDays, dayBounds, weekBounds } from "./dateUtils";
import { BookFromEventDialog } from "./BookFromEventDialog";
import { DayGrid } from "./DayGrid";
import { EventPopover } from "./EventPopover";
import { SourceBadges } from "./SourceBadges";
import { WeekGrid } from "./WeekGrid";

type ViewMode = "day" | "week";

/** Top-level Calendar panel. Sits between Clocks and Cron
 *  in the sidebar. Read-only in PR 4; drag-to-clock and
 *  advisor tools arrive in PR 5. */
export function CalendarPanel() {
  const { t } = useTranslation("calendar");
  const qc = useQueryClient();
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = (
    useState<CalendarEvent | null>(null)
  );
  const [booking, setBooking] = (
    useState<CalendarEvent | null>(null)
  );

  const sourcesQ = useCalendarSources();
  const bounds = useMemo(
    () => (mode === "week"
      ? weekBounds(anchor)
      : dayBounds(anchor)
    ),
    [mode, anchor],
  );
  const eventsQ = useCalendarEvents({
    from: bounds.from, to: bounds.to,
  });

  function nudge(days: number) {
    setAnchor((a) => addDays(a, days));
  }

  function jumpToday() {
    setAnchor(new Date());
  }

  async function refresh() {
    await qc.invalidateQueries({
      queryKey: ["calendar"],
    });
  }

  const events = eventsQ.data?.events || [];
  const sourceStatuses = eventsQ.data?.sources || [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header
        mode={mode}
        onMode={setMode}
        onPrev={() => nudge(mode === "week" ? -7 : -1)}
        onNext={() => nudge(mode === "week" ? 7 : 1)}
        onToday={jumpToday}
        onRefresh={refresh}
        refreshing={eventsQ.isFetching}
        anchor={anchor}
      />
      <SourceBadges
        connected={sourcesQ.data?.sources || []}
        statuses={sourceStatuses}
      />
      {mode === "week" ? (
        <WeekGrid
          anchor={anchor}
          events={events}
          onSelect={setSelected}
        />
      ) : (
        <DayGrid
          anchor={anchor}
          events={events}
          onSelect={setSelected}
        />
      )}
      {eventsQ.isError && (
        <p className="text-xs text-red-500 text-center py-2">
          {t("loadFailed")}
        </p>
      )}
      {selected && (
        <EventPopover
          event={selected}
          onClose={() => setSelected(null)}
          onBook={(e) => {
            setSelected(null);
            setBooking(e);
          }}
        />
      )}
      {booking && (
        <BookFromEventDialog
          event={booking}
          onClose={() => setBooking(null)}
        />
      )}
    </div>
  );
}


function Header({
  mode, onMode, onPrev, onNext, onToday, onRefresh,
  refreshing, anchor,
}: {
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  anchor: Date;
}) {
  const { t, i18n } = useTranslation("calendar");
  const label = formatAnchor(anchor, mode, i18n.language);
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-card">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-stone-900">
          {t("title")}
        </h1>
        <span className="text-xs text-stone-500">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <ViewToggle mode={mode} onMode={onMode} />
        <button
          type="button"
          onClick={onPrev}
          className="p-1 rounded hover:bg-surface-raised text-stone-600"
          aria-label={t("prev")}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="px-2 py-1 text-xs rounded hover:bg-surface-raised text-stone-700"
        >
          {t("today")}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="p-1 rounded hover:bg-surface-raised text-stone-600"
          aria-label={t("next")}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="p-1 rounded hover:bg-surface-raised text-stone-600"
          aria-label={t("refresh")}
        >
          <RefreshCw
            className={
              "w-4 h-4 "
              + (refreshing ? "animate-spin" : "")
            }
          />
        </button>
      </div>
    </div>
  );
}


function ViewToggle({
  mode, onMode,
}: {
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
}) {
  const { t } = useTranslation("calendar");
  const opt = (m: ViewMode, label: string) => (
    <button
      type="button"
      onClick={() => onMode(m)}
      className={
        "px-2 py-1 text-xs rounded "
        + (mode === m
          ? "bg-cta text-white"
          : "text-stone-600 hover:bg-surface-raised")
      }
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 border border-border rounded mr-2">
      {opt("day", t("day"))}
      {opt("week", t("week"))}
    </div>
  );
}


function formatAnchor(
  date: Date, mode: ViewMode, locale: string,
): string {
  if (mode === "day") {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long", year: "numeric",
      month: "long", day: "numeric",
    }).format(date);
  }
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat(locale, {
    month: "short", day: "numeric",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}
