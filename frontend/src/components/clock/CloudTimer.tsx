import { useEffect, useState } from "react";
import { Smartphone, Square } from "lucide-react";
import { elapsed } from "../../utils/formatting";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import {
  stopCloudTimer,
  type CloudActiveTimer,
} from "../../api/client";

interface Props {
  timer: CloudActiveTimer;
  onStopped?: () => void;
}

/**
 * Display of a timer running on another device (typically
 * the Kaisho Cloud mobile app). Ticks the elapsed time and
 * exposes a Stop button so the user can end the session
 * from the desktop without unlocking their phone.
 */
export function CloudTimer({ timer, onStopped }: Props) {
  const [tick, setTick] = useState(0);
  const [stopping, setStopping] = useState(false);
  const customerColors = useCustomerColors();

  useEffect(() => {
    const id = setInterval(
      () => setTick((n) => n + 1), 1000,
    );
    return () => clearInterval(id);
  }, []);

  if (!timer.active || !timer.start) return null;

  const custColor = timer.customer
    ? customerColors[timer.customer]
    : undefined;

  async function handleStop() {
    setStopping(true);
    try {
      await stopCloudTimer(timer.id);
    } catch {
      // Swallow: polling will reconcile or show the
      // timer as still active on next tick.
    } finally {
      setStopping(false);
      onStopped?.();
    }
  }

  return (
    <div
      className={[
        "rounded-xl border border-dashed",
        "border-border bg-surface-card/60 p-4",
        "text-center",
      ].join(" ")}
    >
      <div
        key={tick}
        className={
          "text-3xl font-light font-mono text-stone-600 "
          + "tabular-nums tracking-wide"
        }
      >
        {elapsed(timer.start)}
      </div>

      <div className="flex items-center justify-center mt-2">
        <div
          className={
            "inline-flex items-center gap-1.5 px-2.5 "
            + "py-0.5 rounded-full bg-stone-500/10"
          }
        >
          <Smartphone
            size={10}
            className="text-stone-500"
          />
          <span
            className={
              "text-[10px] font-semibold tracking-wider "
              + "uppercase text-stone-500"
            }
          >
            Running on mobile
          </span>
        </div>
      </div>

      {(timer.customer || timer.description) && (
        <div
          className={
            "flex items-center justify-center gap-1 mt-2"
          }
        >
          <p
            className={
              "text-xs text-stone-500 truncate "
              + "flex items-center gap-1"
            }
          >
            {timer.customer && (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: custColor || "#a1a1aa",
                  }}
                />
                <span className="text-stone-700">
                  {timer.customer}
                </span>
              </>
            )}
            {timer.description && (
              <>
                {timer.customer && (
                  <span className="font-bold text-stone-400">
                    &middot;
                  </span>
                )}
                <span className="truncate">
                  {timer.description}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleStop}
        disabled={stopping}
        className={[
          "mt-3 inline-flex items-center gap-1.5",
          "px-3 py-1.5 rounded-md text-xs font-medium",
          "border border-border bg-surface-raised",
          "text-stone-600 hover:text-red-600",
          "hover:border-red-400 transition-colors",
          "disabled:opacity-60 disabled:cursor-wait",
        ].join(" ")}
      >
        <Square size={11} />
        {stopping ? "Stopping..." : "Stop"}
      </button>
    </div>
  );
}
