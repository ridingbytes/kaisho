/**
 * Presentational "paused timer" widget shared by the
 * main app (``PausedTimer``) and the tray popover
 * (``TimerSection``). Renders the frozen elapsed time,
 * the customer/description, and Resume + Stop buttons.
 * The caller supplies the click handlers and pending
 * flags so the same visual stays consistent across
 * surfaces.
 */
import { useTranslation } from "react-i18next";
import { Play, Square } from "lucide-react";
import type { ClockEntry } from "../../types";

interface Props {
  entry: ClockEntry;
  onResume: () => void;
  onStop: () => void;
  resumePending?: boolean;
  stopPending?: boolean;
  customerColor?: string;
  /** When true, render an extra footer line explaining
   *  the resume-starts-from-zero contract. The main app
   *  shows it; the tray popover hides it to save space. */
  showResumeHint?: boolean;
}

/** Format a number of minutes as HH:MM (e.g. 75 -> "01:15"). */
export function formatPausedMinutes(
  total: number | null | undefined,
): string {
  const n = Math.max(0, total ?? 0);
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${
    String(m).padStart(2, "0")
  }`;
}

export function PausedTimerView({
  entry,
  onResume,
  onStop,
  resumePending,
  stopPending,
  customerColor,
  showResumeHint,
}: Props) {
  const { t } = useTranslation("clocks");
  const dot = customerColor || "#a1a1aa";

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-card text-center">
      <div className="flex items-center justify-center gap-3">
        <div className="text-3xl font-light font-mono text-fg tabular-nums tracking-wide">
          {formatPausedMinutes(entry.duration_minutes)}
        </div>
        <button
          type="button"
          onClick={onResume}
          disabled={resumePending}
          title={t("resumePausedTimer")}
          aria-label={t("resumePausedTimer")}
          className={[
            "inline-flex items-center justify-center",
            "w-6 h-6 rounded-full",
            "bg-emerald-500 text-white",
            "border border-emerald-500",
            "hover:brightness-110 transition-all",
            "disabled:opacity-40 disabled:cursor-wait",
          ].join(" ")}
        >
          <Play size={10} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={stopPending}
          title={t("stopTimer")}
          aria-label={t("stopTimer")}
          className={[
            "inline-flex items-center justify-center",
            "w-6 h-6 rounded-full",
            "bg-red-500 text-white",
            "border border-red-500",
            "hover:brightness-110 transition-all",
            "disabled:opacity-40 disabled:cursor-wait",
          ].join(" ")}
        >
          <Square size={10} fill="currentColor" />
        </button>
      </div>

      <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
          {t("paused") || "Paused"}
        </span>
      </div>

      {entry.customer && (
        <div className="flex items-center justify-center gap-1 mt-2">
          <p className="text-xs text-fg-muted truncate flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: dot }}
            />
            <span className="text-fg">
              {entry.customer}
            </span>
            {entry.description && (
              <>
                <span className="font-bold text-fg-subtle">
                  &middot;
                </span>
                <span className="truncate">
                  {entry.description}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      {showResumeHint && (
        <p className="mt-2 text-[10px] text-fg-muted">
          {t("startsAtZeroOnResume")}
        </p>
      )}
    </div>
  );
}
