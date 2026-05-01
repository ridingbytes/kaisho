import { useTranslation } from "react-i18next";
import { Play, X } from "lucide-react";
import { useStartTimer } from "../../hooks/useClocks";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import type { ActiveTimer as ActiveTimerType } from "../../types";

interface Props {
  /** The timer that just finished, frozen at its final
   * elapsed text. Stored in the parent so it survives
   * the gap between the local timer becoming null and
   * the user choosing to resume or clear. */
  snapshot: {
    timer: ActiveTimerType;
    finalElapsed: string;
  };
  /** Drop the snapshot — equivalent to a "second click
   * on Stop" per the PWA spec. */
  onClear: () => void;
}

/**
 * Pinned-stopped timer card. Sits in place of the
 * StartForm after the user stops a running timer so
 * they can re-fire the same customer/description with a
 * single click.
 */
export function StoppedTimer({ snapshot, onClear }: Props) {
  const { t: tc } = useTranslation("common");
  const { timer, finalElapsed } = snapshot;
  const start = useStartTimer();
  const customerColors = useCustomerColors();

  const custColor = timer.customer
    ? customerColors[timer.customer]
    : undefined;

  function handleResume() {
    if (start.isPending) return;
    start.mutate(
      {
        customer: timer.customer ?? "",
        description: timer.description ?? "",
      },
      // Drop the snapshot once the new timer is on its
      // way — the active-timer card will take over.
      { onSuccess: () => onClear() },
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-card p-4 shadow-card text-center">
      <div className="flex items-center justify-center gap-3">
        <div className="text-3xl font-light font-mono text-stone-900 tabular-nums tracking-wide">
          {finalElapsed}
        </div>
        <button
          onClick={handleResume}
          disabled={start.isPending}
          title={tc("resume")}
          aria-label={tc("resume")}
          className={[
            "inline-flex items-center justify-center",
            "w-6 h-6 rounded-full",
            "bg-green-500 text-white",
            "border border-green-500",
            "hover:brightness-110 transition-all",
            "disabled:opacity-40 disabled:cursor-wait",
          ].join(" ")}
        >
          <Play size={10} fill="currentColor" />
        </button>
        <button
          onClick={onClear}
          title={tc("clear")}
          aria-label={tc("clear")}
          className={[
            "inline-flex items-center justify-center",
            "w-6 h-6 rounded-full",
            "border border-border text-stone-500",
            "hover:border-stone-400 hover:text-stone-800",
            "transition-colors",
          ].join(" ")}
        >
          <X size={12} />
        </button>
      </div>

      {/* Stopped pill */}
      <div className="flex items-center justify-center mt-2">
        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-stone-500/10 border border-stone-500/30">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-stone-600">
            {tc("stopped")}
          </span>
        </div>
      </div>

      {/* Customer · description */}
      <div className="flex items-center justify-center mt-2">
        <p className="text-xs text-stone-500 truncate flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: custColor || "#a1a1aa" }}
          />
          <span className="text-stone-700">
            {timer.customer || "—"}
          </span>
          {timer.description && (
            <>
              <span className="font-bold text-stone-400">
                &middot;
              </span>
              <span className="truncate">
                {timer.description}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
