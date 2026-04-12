import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDow = (firstDay.getDay() + 6) % 7;

  const days: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = startDow - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month - 1, -i), isCurrentMonth: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({
      date: new Date(year, month - 1, d),
      isCurrentMonth: true,
    });
  }
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: false });
  }
  return days;
}

function toIsoDate(date: Date): string {
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, "0")}-` +
    `${String(date.getDate()).padStart(2, "0")}`
  );
}

function groupByDate(entries: ClockEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const key = e.start.slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + (e.duration_minutes ?? 0));
  }
  return map;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const MONTH_NAMES = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

interface CalendarWidgetProps {
  selectedDate: string | null;
  onDateChange: (date: string | null) => void;
}

export function CalendarWidget({
  selectedDate,
  onDateChange,
}: CalendarWidgetProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const yearMonth = buildYearMonth(year, month);

  const { data: entries = [] } = useQuery({
    queryKey: ["clocks", "entries", "month", yearMonth],
    queryFn: () => fetchMonthEntries(year, month),
  });

  const minutesByDate = groupByDate(entries);
  const calendarDays = buildCalendarDays(year, month);
  const todayIso = toIsoDate(today);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else { setMonth((m) => m - 1); }
  }

  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else { setMonth((m) => m + 1); }
  }

  function handleDayClick(date: Date, isCurrentMonth: boolean) {
    if (!isCurrentMonth) return;
    const iso = toIsoDate(date);
    onDateChange(selectedDate === iso ? null : iso);
  }

  function goToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    onDateChange(null);
  }

  const showTodayLink =
    selectedDate !== null ||
    year !== today.getFullYear() ||
    month !== today.getMonth() + 1;

  return (
    <div className="flex flex-col gap-2">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-1 rounded text-stone-500 hover:text-stone-900 transition-colors"
        >
          <ChevronLeft size={12} />
        </button>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-600">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="p-1 rounded text-stone-500 hover:text-stone-900 transition-colors"
        >
          <ChevronRight size={12} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7">
        {DAY_LABELS.map((label, i) => (
          <div
            key={i}
            className="text-center text-[9px] font-semibold uppercase text-stone-400 py-0.5"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border-subtle rounded overflow-hidden">
        {calendarDays.map(({ date, isCurrentMonth }, idx) => {
          const iso = toIsoDate(date);
          const mins = minutesByDate.get(iso) ?? 0;
          const isToday = iso === todayIso;
          const isSelected =
            iso === selectedDate ||
            (selectedDate === null && isToday);

          return (
            <div
              key={idx}
              onClick={() => handleDayClick(date, isCurrentMonth)}
              className={[
                "flex flex-col items-center justify-center h-8 cursor-pointer",
                "text-[10px] leading-none transition-colors",
                isCurrentMonth ? "" : "opacity-25 pointer-events-none",
                isSelected
                  ? "bg-surface-overlay text-cta font-semibold rounded"
                  : isToday
                    ? "bg-cta/10 text-cta font-semibold rounded"
                    : "bg-surface-card text-stone-700 hover:bg-surface-raised",
              ].join(" ")}
            >
              <span className={isToday ? "font-bold" : "font-medium"}>
                {date.getDate()}
              </span>
              {mins > 0 && (
                <span className="text-[8px] text-stone-500 leading-none mt-0.5">
                  {formatHours(mins)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {showTodayLink && (
        <button
          onClick={goToday}
          className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors self-end"
        >
          Today
        </button>
      )}
    </div>
  );
}
