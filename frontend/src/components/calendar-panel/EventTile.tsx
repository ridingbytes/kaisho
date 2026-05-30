import type { CalendarEvent } from "../../api/client";
import { colorFor } from "./calendarColors";
import { hhmm, parseIso } from "./dateUtils";

interface Props {
  event: CalendarEvent;
  /** Absolute placement within a day column (week view).
   *  Omitted in the all-day strip. */
  style?: React.CSSProperties;
  onClick?: () => void;
}

/** A single event pill rendered in the time grid or the
 *  all-day row. Stays read-only in PR 4; the drag wiring
 *  arrives in PR 5. */
export function EventTile({ event, style, onClick }: Props) {
  const color = colorFor(event);
  const start = parseIso(event.start);
  const end = parseIso(event.end);

  return (
    <button
      type="button"
      onClick={onClick}
      title={event.title}
      style={style}
      className={
        "absolute left-0.5 right-0.5 px-1.5 py-1 rounded "
        + "border-l-4 text-left text-[11px] overflow-hidden "
        + "cursor-pointer hover:brightness-95 "
        + `${color.bg} ${color.text}`
      }
    >
      <div
        className={`absolute inset-y-0 left-0 w-1 ${color.bar}`}
      />
      <div className="font-medium truncate">
        {event.title || "(no title)"}
      </div>
      {!event.all_day && (
        <div className="text-[10px] opacity-75 truncate">
          {hhmm(start)} - {hhmm(end)}
        </div>
      )}
      {event.location && (
        <div className="text-[10px] opacity-60 truncate">
          {event.location}
        </div>
      )}
    </button>
  );
}
