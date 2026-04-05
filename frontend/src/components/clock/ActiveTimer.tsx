import { useEffect, useState } from "react";
import { useStopTimer } from "../../hooks/useClocks";
import type { ActiveTimer as ActiveTimerType } from "../../types";

function elapsed(startIso: string): string {
  const diffMs = Date.now() - new Date(startIso).getTime();
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  timer: ActiveTimerType;
}

export function ActiveTimer({ timer }: Props) {
  const [tick, setTick] = useState(0);
  const stop = useStopTimer();

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!timer.active || !timer.start) return null;

  return (
    <div className="rounded-xl border border-accent/30 bg-accent-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[10px] font-semibold tracking-widest uppercase text-accent">
              Running
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-200 truncate">
            {timer.customer}
          </p>
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {timer.description}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {/* Re-render on tick */}
          <div
            key={tick}
            className="text-2xl font-mono font-semibold text-slate-200 tabular-nums"
          >
            {elapsed(timer.start)}
          </div>
          <button
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            className={[
              "mt-2 px-3 py-1 rounded-lg text-xs font-semibold",
              "bg-red-500/20 text-red-400 border border-red-500/30",
              "hover:bg-red-500/30 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {stop.isPending ? "Stopping…" : "Stop"}
          </button>
        </div>
      </div>
    </div>
  );
}
