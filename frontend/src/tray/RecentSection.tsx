import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import type { ClockEntry } from "../types";

interface Props {
  entries: ClockEntry[];
  onResume: (entry: ClockEntry) => void;
  isRunning: boolean;
}

/** Format an ISO timestamp to "HH:MM". */
function timeStr(iso: string): string {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/** Format duration in minutes as "Xh YYm". */
function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, "0")}m`;
}

export function RecentSection({
  entries,
  onResume,
  isRunning,
}: Props) {
  const { t } = useTranslation("clocks");

  if (entries.length === 0) {
    return (
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
          {t("recentEntries")}
        </p>
        <p className="text-xs text-stone-400">
          {t("noEntriesToday")}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex-1 overflow-y-auto min-h-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
        {t("recentEntries")}
      </p>
      <div className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <div
            key={entry.start}
            className="flex items-center gap-2 text-xs group"
          >
            {/* Time range */}
            <span className="text-stone-400 tabular-nums whitespace-nowrap">
              {timeStr(entry.start)}
              {entry.end
                ? `–${timeStr(entry.end)}`
                : ""}
            </span>

            {/* Customer */}
            <span className="text-stone-700 truncate flex-1">
              {entry.customer}
            </span>

            {/* Duration */}
            <span className="text-stone-400 tabular-nums whitespace-nowrap">
              {entry.duration_minutes
                ? fmtDuration(entry.duration_minutes)
                : "—"}
            </span>

            {/* Resume button */}
            {!isRunning && (
              <button
                onClick={() => onResume(entry)}
                title={t("resume")}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-cta hover:bg-cta/10 transition-all"
              >
                <Play size={10} fill="currentColor" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
