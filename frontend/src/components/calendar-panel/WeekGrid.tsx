import { useTranslation } from "react-i18next";

import type { CalendarEvent } from "../../api/client";
import {
  DAY_HOURS,
  hoursFromMidnight,
  isoWeek,
  parseIso,
  sameDay,
  weekDays,
} from "./dateUtils";
import { EventTile } from "./EventTile";

const HOUR_HEIGHT_PX = 40;

interface Props {
  anchor: Date;
  events: CalendarEvent[];
  onSelect?: (event: CalendarEvent) => void;
}

/** A 7-column week view. The top strip shows all-day
 *  events; the body is a 24h timeline with per-day
 *  columns of absolutely-positioned event tiles. */
export function WeekGrid({ anchor, events, onSelect }: Props) {
  const { t } = useTranslation("calendar");
  const days = weekDays(anchor);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <DayHeader days={days} />
      <AllDayStrip
        days={days}
        events={events}
        onSelect={onSelect}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="flex">
          <HourGutter />
          <div
            className="flex-1 grid"
            style={{
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            }}
          >
            {days.map((d) => (
              <DayColumn
                key={d.toISOString()}
                day={d}
                events={events}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </div>
      {events.length === 0 && (
        <p className="text-xs text-fg-subtle text-center py-2">
          {t("empty")}
        </p>
      )}
    </div>
  );
}


function DayHeader({ days }: { days: Date[] }) {
  const { t } = useTranslation("calendar");
  const today = new Date();
  const wk = days.length ? isoWeek(days[0]) : null;
  return (
    <div className="flex border-b border-border bg-surface-card">
      <div className="w-12 shrink-0 flex items-end justify-center pb-1 text-2xs text-fg-muted">
        {wk !== null && (
          <span title={t("week")}>
            {t("weekShort")} {wk}
          </span>
        )}
      </div>
      <div
        className="flex-1 grid"
        style={{
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        }}
      >
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={
                "py-2 px-2 text-xs text-center "
                + (isToday
                  ? "text-cta font-semibold"
                  : "text-fg-muted")
              }
            >
              <div className="uppercase text-2xs tracking-wide">
                {t(`day.${d.getDay()}`)}
              </div>
              <div className="text-base">
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function AllDayStrip({
  days, events, onSelect,
}: {
  days: Date[];
  events: CalendarEvent[];
  onSelect?: (e: CalendarEvent) => void;
}) {
  const allDay = events.filter((e) => e.all_day);
  if (allDay.length === 0) return null;
  return (
    <div className="flex border-b border-border bg-surface-card">
      <div className="w-12 shrink-0 py-1 text-2xs text-fg-subtle text-right pr-1">
        all-day
      </div>
      <div
        className="flex-1 grid gap-1 p-1"
        style={{
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        }}
      >
        {days.map((d) => (
          <div key={d.toISOString()}>
            {allDay
              .filter((e) =>
                sameDay(parseIso(e.start), d)
              )
              .map((e) => (
                <div
                  key={e.id}
                  className="relative h-5 mb-0.5"
                >
                  <EventTile
                    event={e}
                    onClick={() => onSelect?.(e)}
                  />
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}


function HourGutter() {
  return (
    <div className="w-12 shrink-0 border-r border-border">
      {Array.from({ length: DAY_HOURS }, (_, h) => (
        <div
          key={h}
          style={{ height: HOUR_HEIGHT_PX }}
          className="text-2xs text-fg-subtle text-right pr-1 border-b border-border"
        >
          {String(h).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}


function DayColumn({
  day, events, onSelect,
}: {
  day: Date;
  events: CalendarEvent[];
  onSelect?: (e: CalendarEvent) => void;
}) {
  const dayEvents = events.filter((e) =>
    !e.all_day && sameDay(parseIso(e.start), day),
  );

  return (
    <div className="relative border-r border-border last:border-r-0">
      {Array.from({ length: DAY_HOURS }, (_, h) => (
        <div
          key={h}
          style={{ height: HOUR_HEIGHT_PX }}
          className="border-b border-border"
        />
      ))}
      {dayEvents.map((e) => {
        const start = parseIso(e.start);
        const end = parseIso(e.end);
        const top = hoursFromMidnight(start) * HOUR_HEIGHT_PX;
        const height = Math.max(
          18,
          (hoursFromMidnight(end) - hoursFromMidnight(start))
            * HOUR_HEIGHT_PX,
        );
        return (
          <EventTile
            key={e.id}
            event={e}
            style={{
              position: "absolute",
              top, height,
              left: 2, right: 2,
            }}
            onClick={() => onSelect?.(e)}
          />
        );
      })}
    </div>
  );
}
