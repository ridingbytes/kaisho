import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "../utils/tauri";
import {
  fetchActiveTimer,
  fetchCustomers,
  fetchTodayEntries,
  startTimer,
  stopTimer,
} from "../api/client";
import type {
  ActiveTimer,
  ClockEntry,
  Customer,
} from "../types";
import { TimerSection } from "./TimerSection";
import { CaptureSection } from "./CaptureSection";
import { RecentSection } from "./RecentSection";

/** Elapsed time as HH:MM:SS. */
function formatElapsed(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/** Hours elapsed since start. */
function hoursElapsed(startIso: string): number {
  const ms = Date.now() - new Date(startIso).getTime();
  return ms / 3_600_000;
}

/** Sum duration_minutes of completed entries. */
function totalMinutes(entries: ClockEntry[]): number {
  return entries.reduce(
    (sum, e) => sum + (e.duration_minutes ?? 0),
    0,
  );
}

/** Format total minutes as "Xh YYm". */
function formatTotal(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

async function invokeTauri(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import(
      "@tauri-apps/api/core"
    );
    await invoke(cmd, args);
  } catch {
    // ignore when not in Tauri
  }
}

export function TrayPanel() {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");

  const [timer, setTimer] =
    useState<ActiveTimer | null>(null);
  const [entries, setEntries] = useState<ClockEntry[]>(
    [],
  );
  const [customers, setCustomers] = useState<Customer[]>(
    [],
  );
  const [, setTick] = useState(0);

  // Poll active timer + today entries every 5s
  const refresh = useCallback(async () => {
    try {
      const [t, e, c] = await Promise.all([
        fetchActiveTimer(),
        fetchTodayEntries(),
        fetchCustomers(),
      ]);
      setTimer(t);
      setEntries(e);
      setCustomers(c);
    } catch {
      // Backend offline
      setTimer(null);
      invokeTauri("update_tray_icon", {
        state: "offline",
        tooltip: "Kaisho — backend offline",
      });
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Tick every second for live elapsed display
  useEffect(() => {
    const id = setInterval(
      () => setTick((n) => n + 1),
      1_000,
    );
    return () => clearInterval(id);
  }, []);

  // Update tray icon based on timer state
  useEffect(() => {
    if (!timer) return;
    if (!timer.active || !timer.start) {
      invokeTauri("update_tray_icon", {
        state: "idle",
        tooltip: "Kaisho — no active timer",
      });
      return;
    }
    const hours = hoursElapsed(timer.start);
    const elapsed = formatElapsed(timer.start);
    if (hours > 8) {
      invokeTauri("update_tray_icon", {
        state: "long",
        tooltip: `${timer.customer} — ${elapsed} (long)`,
      });
    } else {
      invokeTauri("update_tray_icon", {
        state: "active",
        tooltip: `${timer.customer} — ${elapsed}`,
      });
    }
  }, [timer]);

  // Listen for toggle-timer event from global shortcut
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import(
          "@tauri-apps/api/event"
        );
        unlisten = await listen(
          "toggle-timer",
          async () => {
            if (timer?.active && timer.start) {
              await stopTimer();
            } else if (
              customers.length > 0
            ) {
              await startTimer({
                customer: customers[0].name,
              });
            }
            refresh();
          },
        );
      } catch {
        // not in Tauri
      }
    })();
    return () => unlisten?.();
  }, [timer, customers, refresh]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        invokeTauri("hide_tray_window");
      }
    }
    window.addEventListener("keydown", onKey);
    return () =>
      window.removeEventListener("keydown", onKey);
  }, []);

  // Close on click outside (blur)
  useEffect(() => {
    function onBlur() {
      // Small delay to avoid closing on tray click
      setTimeout(() => {
        invokeTauri("hide_tray_window");
      }, 200);
    }
    window.addEventListener("blur", onBlur);
    return () =>
      window.removeEventListener("blur", onBlur);
  }, []);

  const isRunning =
    timer?.active === true && !!timer.start;
  const completedToday = entries.filter(
    (e) => e.end !== null,
  );
  const recentEntries = completedToday.slice(0, 3);
  const todayTotal = totalMinutes(completedToday);

  async function handleStart(
    customer: string,
    description: string,
    contract?: string,
  ) {
    await startTimer({ customer, description, contract });
    refresh();
  }

  async function handleStop() {
    await stopTimer();
    refresh();
  }

  async function handleResume(entry: ClockEntry) {
    await startTimer({
      customer: entry.customer,
      description: entry.description,
      contract: entry.contract ?? undefined,
    });
    refresh();
  }

  function openMainWindow() {
    invokeTauri("show_main_window");
  }

  return (
    <div className="h-screen flex flex-col bg-surface-base text-stone-800 overflow-hidden select-none rounded-xl border border-border shadow-lg">
      {/* Timer or start form */}
      <TimerSection
        timer={timer}
        isRunning={isRunning}
        elapsed={
          isRunning ? formatElapsed(timer!.start!) : ""
        }
        customers={customers}
        onStart={handleStart}
        onStop={handleStop}
      />

      <div className="border-t border-border-subtle" />

      {/* Quick capture */}
      <CaptureSection />

      <div className="border-t border-border-subtle" />

      {/* Recent entries */}
      <RecentSection
        entries={recentEntries}
        onResume={handleResume}
        isRunning={isRunning}
      />

      {/* Footer */}
      <div className="mt-auto border-t border-border-subtle px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-stone-500">
            {tc("today")}: {formatTotal(todayTotal)}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={openMainWindow}
              className="text-[11px] text-cta hover:underline"
            >
              {t("openKaisho")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
