/**
 * TimerBadge -- Live-updating badge that shows elapsed time
 * for an active timer, with a click-to-stop action.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface TimerBadgeProps {
  /** ISO timestamp when the timer started. */
  start: string;
  /** Called when the user clicks to stop the timer. */
  onStop: () => void;
}

/**
 * Displays a pulsing green badge with elapsed HH:MM that
 * updates every minute. Clicking the badge stops the timer.
 */
export function TimerBadge({
  start,
  onStop,
}: TimerBadgeProps) {
  const { t } = useTranslation("clocks");
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setTick((t) => t + 1),
      60_000,
    );
    return () => clearInterval(id);
  }, []);
  const diffMs =
    Date.now() - new Date(start).getTime();
  const totalMin = Math.floor(diffMs / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const label =
    `${String(h).padStart(2, "0")}:` +
    `${String(m).padStart(2, "0")}`;
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onStop}
      className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-mono font-semibold hover:bg-red-500/10 hover:text-red-500 transition-colors"
      title={t("stopTimer")}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      {label}
    </button>
  );
}
