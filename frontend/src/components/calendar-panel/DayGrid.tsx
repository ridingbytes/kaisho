import { useTranslation } from "react-i18next";

import type { CalendarEvent } from "../../api/client";
import {
  DAY_HOURS,
  hoursFromMidnight,
  parseIso,
  sameDay,
} from "./dateUtils";
import { EventTile } from "./EventTile";

const HOUR_HEIGHT_PX = 48;

interface Props {
  anchor: Date;
  events: CalendarEvent[];
  onSelect?: (event: CalendarEvent) => void;
}

/** Single-day variant of WeekGrid. Same time gutter,
 *  wider column. */
export function DayGrid({ anchor, events, onSelect }: Props) {
  const { t } = useTranslation("calendar");
  const dayEvents = events.filter((e) =>
    !e.all_day && sameDay(parseIso(e.start), anchor),
  );
  const allDay = events.filter((e) =>
    e.all_day && sameDay(parseIso(e.start), anchor),
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {allDay.length > 0 && (
        <div className="border-b border-border bg-surface-card px-4 py-2 flex flex-wrap gap-1">
          {allDay.map((e) => (
            <div
              key={e.id}
              className="relative h-6 min-w-[12rem]"
            >
              <EventTile
                event={e}
                onClick={() => onSelect?.(e)}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <div className="flex">
          <div className="w-16 shrink-0 border-r border-border">
            {Array.from({ length: DAY_HOURS }, (_, h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT_PX }}
                className="text-xs text-fg-subtle text-right pr-2 border-b border-border"
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div className="flex-1 relative">
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
              const top =
                hoursFromMidnight(start) * HOUR_HEIGHT_PX;
              const height = Math.max(
                24,
                (hoursFromMidnight(end)
                  - hoursFromMidnight(start))
                  * HOUR_HEIGHT_PX,
              );
              return (
                <EventTile
                  key={e.id}
                  event={e}
                  style={{
                    position: "absolute",
                    top, height,
                    left: 8, right: 8,
                  }}
                  onClick={() => onSelect?.(e)}
                />
              );
            })}
          </div>
        </div>
      </div>
      {dayEvents.length === 0 && allDay.length === 0 && (
        <p className="text-xs text-fg-subtle text-center py-2">
          {t("empty")}
        </p>
      )}
    </div>
  );
}
