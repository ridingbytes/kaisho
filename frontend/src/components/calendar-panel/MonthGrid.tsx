import { useTranslation } from "react-i18next";

import type { CalendarEvent } from "../../api/client";
import { colorFor } from "./calendarColors";
import {
  isoWeek,
  monthGridDays,
  parseIso,
  sameDay,
} from "./dateUtils";

interface Props {
  anchor: Date;
  events: CalendarEvent[];
  onSelect?: (event: CalendarEvent) => void;
}

const MAX_TILES_PER_CELL = 3;

/** Classic 6x7 month grid. The KW column on the left
 *  carries the ISO week number for each row; cells outside
 *  the anchor's month are dimmed. Per-cell event capping
 *  keeps the layout from blowing up on heavy days; the
 *  overflow chip surfaces the rest in the popover. */
export function MonthGrid({ anchor, events, onSelect }: Props) {
  const { t } = useTranslation("calendar");
  const days = monthGridDays(anchor);
  const today = new Date();
  const month = anchor.getMonth();

  // Group events by local YYYY-MM-DD for O(1) day lookup.
  const byDay = groupByDay(events);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <WeekdayHeader />
      <div className="flex-1 grid grid-rows-6">
        {Array.from({ length: 6 }, (_, row) => {
          const rowDays = days.slice(row * 7, row * 7 + 7);
          return (
            <div
              key={row}
              className="grid border-b border-border last:border-b-0"
              style={{
                gridTemplateColumns:
                  "2.5rem repeat(7, minmax(0, 1fr))",
              }}
            >
              <div className="flex items-start justify-center pt-1.5 text-[10px] text-stone-500 border-r border-border">
                {t("weekShort")} {isoWeek(rowDays[0])}
              </div>
              {rowDays.map((d) => {
                const inMonth = d.getMonth() === month;
                const key = toKey(d);
                const dayEvents = byDay.get(key) || [];
                return (
                  <DayCell
                    key={key}
                    day={d}
                    isToday={sameDay(d, today)}
                    inMonth={inMonth}
                    events={dayEvents}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function WeekdayHeader() {
  const { t } = useTranslation("calendar");
  // Monday-first; day.0=Sun in the locale dict, so reorder.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div
      className="grid border-b border-border bg-surface-card"
      style={{
        gridTemplateColumns:
          "2.5rem repeat(7, minmax(0, 1fr))",
      }}
    >
      <div className="border-r border-border" />
      {order.map((idx) => (
        <div
          key={idx}
          className="py-1.5 text-[10px] text-stone-500 text-center uppercase tracking-wide"
        >
          {t(`day.${idx}`)}
        </div>
      ))}
    </div>
  );
}


function DayCell({
  day, isToday, inMonth, events, onSelect,
}: {
  day: Date;
  isToday: boolean;
  inMonth: boolean;
  events: CalendarEvent[];
  onSelect?: (e: CalendarEvent) => void;
}) {
  const visible = events.slice(0, MAX_TILES_PER_CELL);
  const overflow = events.length - visible.length;
  return (
    <div
      className={
        "border-r border-border last:border-r-0 p-1 "
        + "flex flex-col gap-0.5 overflow-hidden "
        + (inMonth ? "" : "bg-surface-base/40")
      }
    >
      <div
        className={
          "text-[11px] leading-none "
          + (isToday
            ? "text-cta font-semibold"
            : inMonth
              ? "text-stone-700"
              : "text-stone-400")
        }
      >
        {day.getDate()}
      </div>
      {visible.map((e) => (
        <MiniTile
          key={e.id} event={e} onClick={() => onSelect?.(e)}
        />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => onSelect?.(events[visible.length])}
          className="text-[10px] text-stone-500 hover:text-stone-700 text-left truncate"
        >
          +{overflow} more
        </button>
      )}
    </div>
  );
}


function MiniTile({
  event, onClick,
}: {
  event: CalendarEvent;
  onClick?: () => void;
}) {
  const color = colorFor(event);
  return (
    <button
      type="button"
      onClick={onClick}
      title={event.title}
      className={
        "px-1 py-0.5 rounded text-[10px] text-left "
        + "truncate cursor-pointer hover:brightness-95 "
        + `${color.bg} ${color.text}`
      }
    >
      {event.title || "(no title)"}
    </button>
  );
}


function groupByDay(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const start = parseIso(e.start);
    const key = toKey(start);
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }
  return map;
}


function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
