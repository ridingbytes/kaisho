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
// Per-line vertical budget at the current font sizes.
// Title ~16px, secondary lines ~14px, plus py-1 (8px total).
// Used to gate which lines render so a too-short tile never
// shows a half-clipped line; full details live in the popover.
const LINE_TITLE_PX = 16;
const LINE_SECONDARY_PX = 14;
const PADDING_Y_PX = 8;

export function EventTile({ event, style, onClick }: Props) {
  const color = colorFor(event);
  const start = parseIso(event.start);
  const end = parseIso(event.end);

  const heightPx = typeof style?.height === "number"
    ? style.height
    : Number.POSITIVE_INFINITY;
  const budget = heightPx - PADDING_Y_PX - LINE_TITLE_PX;
  const showTime = !event.all_day && budget >= LINE_SECONDARY_PX;
  const showLocation = Boolean(event.location)
    && budget >= LINE_SECONDARY_PX * (showTime ? 2 : 1);

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
      {showTime && (
        <div className="text-[10px] opacity-75 truncate">
          {hhmm(start)} - {hhmm(end)}
        </div>
      )}
      {showLocation && (
        <div className="text-[10px] opacity-60 truncate">
          {event.location}
        </div>
      )}
    </button>
  );
}
