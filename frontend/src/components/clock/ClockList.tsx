import { Play, SquareArrowUp } from "lucide-react";
import { useTodayEntries } from "../../hooks/useClocks";
import type { ClockEntry } from "../../types";

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "…";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface EntryRowProps {
  entry: ClockEntry;
  onReuse?: (entry: ClockEntry) => void;
  onBook?: (entry: ClockEntry) => void;
}

function EntryRow({ entry, onReuse, onBook }: EntryRowProps) {
  return (
    <div className="group flex items-start gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-300 truncate">
          {entry.customer}
        </p>
        <p className="text-[11px] text-slate-600 truncate mt-0.5">
          {entry.description}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onReuse && (
          <button
            onClick={() => onReuse(entry)}
            className="p-0.5 rounded text-slate-700 hover:text-accent hover:bg-accent-muted transition-colors opacity-0 group-hover:opacity-100"
            title="Reuse"
          >
            <Play size={10} />
          </button>
        )}
        {onBook && (
          <button
            onClick={() => onBook(entry)}
            className="p-0.5 rounded text-slate-700 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors opacity-0 group-hover:opacity-100"
            title="Book to project"
          >
            <SquareArrowUp size={10} />
          </button>
        )}
        <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
          {formatDuration(entry.duration_minutes)}
        </span>
      </div>
    </div>
  );
}

interface ClockListProps {
  onReuse?: (entry: ClockEntry) => void;
  onBook?: (entry: ClockEntry) => void;
}

export function ClockList({ onReuse, onBook }: ClockListProps) {
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
        <EntryRow
          key={i}
          entry={entry}
          onReuse={onReuse}
          onBook={onBook}
        />
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
