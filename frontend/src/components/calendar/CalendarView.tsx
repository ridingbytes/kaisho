import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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

function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
      ? "text-slate-200"
      : "text-slate-700",
    isSelected
      ? "bg-accent-muted border-accent"
      : "hover:bg-surface-raised",
  ].join(" ");

  return (
    <div className={cellCls} onClick={onSelect}>
      <div className="flex items-start justify-between">
        <span
          className={[
            "text-xs font-medium leading-none",
            isToday
              ? "text-accent font-semibold"
              : "",
          ].join(" ")}
        >
          {date.getDate()}
        </span>
        {isToday && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
        )}
      </div>
      {hasEntries && (
        <div className="mt-auto self-end">
          <span className="text-[10px] font-mono text-slate-400 bg-surface-raised rounded px-1 py-0.5">
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
  if (entries.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-slate-600">
        No entries for {dateLabel}.
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
            <span className="text-xs font-medium text-slate-300 w-28 shrink-0 truncate">
              {entry.customer}
            </span>
            <span className="text-xs text-slate-400 flex-1 truncate">
              {entry.description}
            </span>
            <span className="text-xs font-mono text-slate-500 shrink-0">
              {formatHours(mins)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CalendarView() {
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
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Calendar
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-raised transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-sm font-semibold text-slate-200">
              {MONTH_NAMES[month - 1]} {year}
            </h2>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-surface-raised transition-colors"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day header row */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-center text-[10px] font-semibold uppercase tracking-wider text-slate-600 py-1"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-sm text-slate-600">
              Loading…
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
                <p className="text-xs font-semibold text-slate-400">
                  {selectedLabel}
                </p>
                {selectedEntries.length > 0 && (
                  <p className="text-[10px] text-slate-600 mt-0.5">
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
