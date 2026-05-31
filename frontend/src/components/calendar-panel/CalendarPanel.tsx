import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import type { CalendarEvent } from "../../api/client";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import {
  useCalendarEvents,
  useCalendarSources,
} from "../../hooks/useCalendar";
import {
  addDays,
  addMonths,
  dayBounds,
  monthBounds,
  weekBounds,
} from "./dateUtils";
import { BookFromEventDialog } from "./BookFromEventDialog";
import { DayGrid } from "./DayGrid";
import { EventPopover } from "./EventPopover";
import { MonthGrid } from "./MonthGrid";
import { SourceBadges } from "./SourceBadges";
import { WeekGrid } from "./WeekGrid";

type ViewMode = "day" | "week" | "month";

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
    () => {
      if (mode === "month") return monthBounds(anchor);
      if (mode === "week") return weekBounds(anchor);
      return dayBounds(anchor);
    },
    [mode, anchor],
  );
  const eventsQ = useCalendarEvents({
    from: bounds.from, to: bounds.to,
  });

  function nudgeDays(days: number) {
    setAnchor((a) => addDays(a, days));
  }

  function nudgeMonths(months: number) {
    setAnchor((a) => addMonths(a, months));
  }

  function onPrev() {
    if (mode === "month") return nudgeMonths(-1);
    return nudgeDays(mode === "week" ? -7 : -1);
  }

  function onNext() {
    if (mode === "month") return nudgeMonths(1);
    return nudgeDays(mode === "week" ? 7 : 1);
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
        onPrev={onPrev}
        onNext={onNext}
        onToday={jumpToday}
        onJump={setAnchor}
        onRefresh={refresh}
        refreshing={eventsQ.isFetching}
        anchor={anchor}
      />
      <SourceBadges
        connected={sourcesQ.data?.sources || []}
        statuses={sourceStatuses}
      />
      {mode === "month" && (
        <MonthGrid
          anchor={anchor}
          events={events}
          onSelect={setSelected}
        />
      )}
      {mode === "week" && (
        <WeekGrid
          anchor={anchor}
          events={events}
          onSelect={setSelected}
        />
      )}
      {mode === "day" && (
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
  mode, onMode, onPrev, onNext, onToday, onJump, onRefresh,
  refreshing, anchor,
}: {
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onJump: (d: Date) => void;
  onRefresh: () => void;
  refreshing: boolean;
  anchor: Date;
}) {
  const { t, i18n } = useTranslation("calendar");
  const label = formatAnchor(anchor, mode, i18n.language);
  return (
    // Three-column layout: title+date left, navigation
    // controls centred, help button right. The centre group
    // is absolutely positioned so its width doesn't push the
    // edge groups around when the date label changes length.
    <div className="relative flex items-center justify-between px-4 py-2 border-b border-border bg-surface-card">
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-sm font-semibold text-stone-900">
          {t("title")}
        </h1>
        <DateJumper
          anchor={anchor} label={label} onJump={onJump}
        />
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
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
      <div className="flex items-center gap-1">
        <HelpButton
          title={t("title")}
          doc={DOCS.calendar}
          view="calendar"
        />
      </div>
    </div>
  );
}


function DateJumper({
  anchor, label, onJump,
}: {
  anchor: Date;
  label: string;
  onJump: (d: Date) => void;
}) {
  // ``<input type="date">`` reads/writes a local YYYY-MM-DD;
  // build the value from local Y/M/D so the picker preselects
  // the correct day across timezones. Chromium-based shells
  // (Tauri) only open the picker on the small calendar glyph,
  // not on body clicks, so we drive ``showPicker()`` from a
  // button that wraps the visible label.
  const inputRef = useRef<HTMLInputElement>(null);
  const value = toLocalIsoDate(anchor);

  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    // ``showPicker`` is the only reliable way to surface the
    // native picker programmatically; fall back to focus on
    // browsers that don't implement it yet.
    if (typeof el.showPicker === "function") {
      el.showPicker();
    } else {
      el.focus();
      el.click();
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const next = parseLocalIsoDate(e.target.value);
    if (next) onJump(next);
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={openPicker}
        className="text-xs text-stone-500 hover:text-stone-700 underline-offset-2 hover:underline cursor-pointer"
        title="Jump to date"
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={handleChange}
        className="absolute left-0 top-full w-0 h-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}


function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


function parseLocalIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
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
      {opt("month", t("month"))}
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
  if (mode === "month") {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric", month: "long",
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
