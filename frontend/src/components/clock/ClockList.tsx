import { useTodayEntries } from "../../hooks/useClocks";
import type { ClockEntry } from "../../types";

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "…";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function EntryRow({ entry }: { entry: ClockEntry }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-300 truncate">
          {entry.customer}
        </p>
        <p className="text-[11px] text-slate-600 truncate mt-0.5">
          {entry.description}
        </p>
      </div>
      <span className="shrink-0 text-[11px] font-semibold text-slate-500 tabular-nums">
        {formatDuration(entry.duration_minutes)}
      </span>
    </div>
  );
}

export function ClockList() {
  const { data: entries = [], isLoading } = useTodayEntries();

  const totalMin = entries.reduce(
    (sum, e) => sum + (e.duration_minutes ?? 0),
    0
  );
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;

  if (isLoading) {
    return (
      <p className="text-xs text-slate-700 text-center py-4">
        Loading…
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-xs text-slate-700 text-center py-4">
        No entries today
      </p>
    );
  }

  return (
    <div>
      {entries.map((entry, i) => (
        <EntryRow key={i} entry={entry} />
      ))}
      <div className="flex justify-between pt-2 mt-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          Total today
        </span>
        <span className="text-[11px] font-semibold text-slate-400 tabular-nums">
          {totalH}h {totalM}m
        </span>
      </div>
    </div>
  );
}
