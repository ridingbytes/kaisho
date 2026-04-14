/**
 * TaskClockSection -- Collapsible section showing all clock
 * entries linked to a task, with total duration.
 */
import { useState } from "react";
import {
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  useTaskClockEntries,
  useUpdateClockEntry,
  useDeleteClockEntry,
} from "../../hooks/useClocks";
import { formatHours } from "../../utils/formatting";
import { ClockEntryRow } from "./ClockEntryRow";
import type { ClockEntry, Task } from "../../types";

function totalMinutes(entries: ClockEntry[]): number {
  return entries.reduce(
    (s, e) => s + (e.duration_minutes ?? 0), 0,
  );
}

interface TaskClockSectionProps {
  task: Task;
}

/**
 * Renders a collapsible list of clock entries for a task,
 * with a summary line showing entry count and total hours.
 */
export function TaskClockSection({
  task,
}: TaskClockSectionProps) {
  const { data: entries = [] } = useTaskClockEntries(
    task.id,
  );
  const updateEntry = useUpdateClockEntry();
  const deleteEntry = useDeleteClockEntry();
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  const totalAll = totalMinutes(entries);

  return (
    <div
      className="mt-2 border-t border-border-subtle pt-1.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 text-[10px] text-stone-600 w-full">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 hover:text-stone-900 flex-1 min-w-0"
        >
          {open ? (
            <ChevronDown size={10} />
          ) : (
            <ChevronRight size={10} />
          )}
          <Clock size={10} />
          <span className="truncate">
            {entries.length}{" "}
            {entries.length === 1 ? "entry" : "entries"}
            {" · "}
            {formatHours(totalAll)}
          </span>
        </button>
      </div>
      {open && (
        <ul className="mt-1 ml-5 space-y-0.5">
          {entries.map((e) => (
            <ClockEntryRow
              key={e.start}
              entry={e}
              updateEntry={updateEntry}
              deleteEntry={deleteEntry}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
