import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatHours } from "../../utils/formatting";
import type { ClockEntry } from "../../types";

async function fetchMonthEntries(
  year: number,
  month: number
): Promise<ClockEntry[]> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const res = await fetch(
    `/api/clocks/entries?from_date=${from}&to_date=${to}`
  );
  if (!res.ok) throw new Error("Failed to fetch entries");
  return res.json();
}

function buildYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function buildCalendarDays(
  year: number,
  month: number
): { date: Date; isCurrentMonth: boolean }[] {
  // Monday-first: 0=Mon ... 6=Sun
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month - 1 + 1, 0);

  // day of week, 0=Sun..6=Sat → convert to Mon-first
  const startDow = (firstDay.getDay() + 6) % 7;

  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  // Pad from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, -i);
    days.push({ date: d, isCurrentMonth: false });
  }

  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month - 1, d), isCurrentMonth: true });
  }

  // Pad to complete last row (up to 6 rows × 7 = 42)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: false });
  }

  return days;
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function groupEntriesByDate(
  entries: ClockEntry[]
): Map<string, ClockEntry[]> {
  const map = new Map<string, ClockEntry[]>();
  for (const entry of entries) {
    const dateKey = entry.start.slice(0, 10);
    const existing = map.get(dateKey) ?? [];
    existing.push(entry);
    map.set(dateKey, existing);
  }
  return map;
}

function sumMinutes(entries: ClockEntry[]): number {
  return entries.reduce(
    (acc, e) => acc + (e.duration_minutes ?? 0),
    0
  );
}

function localeDayLabels(lang: string): string[] {
  // Generate Mon–Sun labels using the browser's locale engine
  const base = new Date(2024, 0, 1); // 2024-01-01 is a Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(1 + i);
    return d.toLocaleDateString(lang, { weekday: "short" });
  });
}

function localeMonthName(
  year: number,
  month: number,
  lang: string,
): string {
  return new Date(year, month - 1, 1).toLocaleDateString(
    lang,
    { month: "long", year: "numeric" },
  );
}

interface DayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  entries: ClockEntry[];
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

function DayCell({
  date,
  isCurrentMonth,
  entries,
  isToday,
  isSelected,
  onSelect,
}: DayCellProps) {
  const totalMinutes = sumMinutes(entries);
  const hasEntries = totalMinutes > 0;

  const cellCls = [
    "relative h-16 p-1 border border-transparent cursor-pointer",
    "flex flex-col transition-colors",
    isCurrentMonth
      ? "text-stone-900"
      : "text-stone-400",
    isSelected
      ? "bg-cta-muted border-cta"
      : "hover:bg-surface-raised",
  ].join(" ");

  return (
    <div className={cellCls} onClick={onSelect}>
      <div className="flex items-start justify-between">
        <span
          className={[
            "text-xs font-medium leading-none",
            isToday
              ? "text-cta font-semibold"
              : "",
          ].join(" ")}
        >
          {date.getDate()}
        </span>
        {isToday && (
          <span className="w-1.5 h-1.5 rounded-full bg-cta shrink-0" />
        )}
      </div>
      {hasEntries && (
        <div className="mt-auto self-end">
          <span className="text-[10px] font-mono text-stone-700 bg-surface-raised rounded px-1 py-0.5">
            {formatHours(totalMinutes)}
          </span>
        </div>
      )}
    </div>
  );
}

interface EntryListProps {
  entries: ClockEntry[];
  dateLabel: string;
}

function EntryList({ entries, dateLabel }: EntryListProps) {
  const { t } = useTranslation("clocks");
  if (entries.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-stone-500">
        {t("noEntriesFound")} {dateLabel}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-subtle">
      {entries.map((entry, i) => {
        const mins = entry.duration_minutes ?? 0;
        return (
          <div
            key={`${entry.start}-${i}`}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <span className="text-xs font-medium text-stone-800 w-28 shrink-0 truncate">
              {entry.customer}
            </span>
            <span className="text-xs text-stone-700 flex-1 truncate">
              {entry.description}
            </span>
            <span className="text-xs font-mono text-stone-600 shrink-0">
              {formatHours(mins)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CalendarView() {
  const { t, i18n } = useTranslation("clocks");
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const yearMonth = buildYearMonth(year, month);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["clocks", "entries", "month", yearMonth],
    queryFn: () => fetchMonthEntries(year, month),
  });

  const byDate = groupEntriesByDate(entries);
  const calendarDays = buildCalendarDays(year, month);
  const todayIso = toIsoDate(today);

  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDate(null);
  }

  function nextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDate(null);
  }

  function handleDayClick(date: Date, isCurrentMonth: boolean) {
    if (!isCurrentMonth) return;
    const iso = toIsoDate(date);
    setSelectedDate((prev) => (prev === iso ? null : iso));
  }

  const selectedEntries = selectedDate
    ? (byDate.get(selectedDate) ?? [])
    : [];

  const selectedLabel = selectedDate
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString(
        i18n.language,
        {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        },
      )
    : "";

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-700">
          {t("calendar")}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded text-stone-600 hover:text-stone-900 hover:bg-surface-raised transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-sm font-semibold text-stone-900">
              {localeMonthName(year, month, i18n.language)}
            </h2>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded text-stone-600 hover:text-stone-900 hover:bg-surface-raised transition-colors"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day header row */}
          <div className="grid grid-cols-7 mb-1">
            {localeDayLabels(i18n.language).map(
              (label, i) => (
                <div
                  key={i}
                  className="text-center text-[10px] font-semibold uppercase tracking-wider text-stone-500 py-1"
                >
                  {label}
                </div>
              ),
            )}
          </div>

          {/* Calendar grid */}
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-sm text-stone-500">
              {t("noEntriesFound")}
            </div>
          ) : (
            <div className="grid grid-cols-7 bg-surface-card rounded-xl border border-border overflow-hidden">
              {calendarDays.map(({ date, isCurrentMonth }, idx) => {
                const iso = toIsoDate(date);
                const dayEntries = byDate.get(iso) ?? [];
                const isToday = iso === todayIso;
                const isSelected = iso === selectedDate;

                return (
                  <DayCell
                    key={idx}
                    date={date}
                    isCurrentMonth={isCurrentMonth}
                    entries={dayEntries}
                    isToday={isToday}
                    isSelected={isSelected}
                    onSelect={() =>
                      handleDayClick(date, isCurrentMonth)
                    }
                  />
                );
              })}
            </div>
          )}

          {/* Selected day entries */}
          {selectedDate && (
            <div className="mt-4 bg-surface-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border-subtle">
                <p className="text-xs font-semibold text-stone-700">
                  {selectedLabel}
                </p>
                {selectedEntries.length > 0 && (
                  <p className="text-[10px] text-stone-500 mt-0.5">
                    {formatHours(sumMinutes(selectedEntries))} total
                  </p>
                )}
              </div>
              <EntryList
                entries={selectedEntries}
                dateLabel={selectedLabel}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
