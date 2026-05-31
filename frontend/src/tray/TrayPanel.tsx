import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "../utils/tauri";
import {
  fetchActiveTimer,
  fetchCustomers,
  fetchTodayEntries,
  clearPausedTimer,
  fetchPausedTimer,
  pauseTimer,
  startTimer,
  stopTimer,
  updateClockEntry,
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

/** Notify other webviews (main window) that the timer
 *  state changed so they can refresh their cache. */
async function emitTimerChanged(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit("timer-changed", "");
  } catch {
    // not in Tauri shell
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
  const [paused, setPaused] =
    useState<ClockEntry | null>(null);
  const [, setTick] = useState(0);

  // Poll active timer + today entries every 5s. The
  // main window's useTrayIconSync owns menu-bar updates,
  // so this loop only refreshes the popover content.
  const refresh = useCallback(async () => {
    try {
      const [t, e, c, p] = await Promise.all([
        fetchActiveTimer(),
        fetchTodayEntries(),
        fetchCustomers(),
        fetchPausedTimer(),
      ]);
      setTimer(t);
      setEntries(e);
      setCustomers(c);
      setPaused(p);
    } catch {
      setTimer(null);
      setPaused(null);
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

  // Listen for timer-changed event from Rust
  // (tray menu or global shortcut triggered a
  // start/stop — refresh to show updated state)
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import(
          "@tauri-apps/api/event"
        );
        unlisten = await listen(
          "timer-changed",
          () => refresh(),
        );
      } catch {
        // not in Tauri
      }
    })();
    return () => unlisten?.();
  }, [refresh]);

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

  // Close on blur (click outside the panel).
  // On macOS, blur fires too aggressively when
  // clicking the tray icon itself, so we skip it
  // there — the tray icon toggle handles closing.
  useEffect(() => {
    const isMac = navigator.platform
      .toUpperCase()
      .includes("MAC");
    if (isMac) return;
    function onBlur() {
      invokeTauri("hide_tray_window");
    }
    window.addEventListener("blur", onBlur);
    return () =>
      window.removeEventListener("blur", onBlur);
  }, []);

  const isRunning =
    timer?.active === true && !!timer.start;
  // The popover scrolls when there are more entries than
  // fit, so we don't cap the list.
  const completedToday = entries.filter(
    (e) => e.end !== null,
  );
  const todayTotal = totalMinutes(completedToday);

  async function handleStart(
    customer: string,
    description: string,
    contract?: string,
  ) {
    await startTimer({ customer, description, contract });
    refresh();
    void emitTimerChanged();
  }

  async function handleStop() {
    await stopTimer();
    refresh();
    void emitTimerChanged();
  }

  async function handlePause() {
    await pauseTimer();
    refresh();
    void emitTimerChanged();
  }

  async function handleResumePaused(entry: ClockEntry) {
    await startTimer({
      customer: entry.customer,
      description: entry.description,
      contract: entry.contract ?? undefined,
      taskId: entry.task_id ?? undefined,
    });
    refresh();
    void emitTimerChanged();
  }

  async function handleDismissPaused() {
    await clearPausedTimer();
    refresh();
    void emitTimerChanged();
  }

  async function handleUpdateDescription(desc: string) {
    if (!timer?.start) return;
    await updateClockEntry(
      { sync_id: timer.sync_id ?? null, start: timer.start },
      { description: desc },
    );
    refresh();
    void emitTimerChanged();
  }

  async function handleUpdateNotes(notes: string) {
    if (!timer?.start) return;
    await updateClockEntry(
      { sync_id: timer.sync_id ?? null, start: timer.start },
      { notes },
    );
    refresh();
    void emitTimerChanged();
  }

  async function handleResume(entry: ClockEntry) {
    await startTimer({
      customer: entry.customer,
      description: entry.description,
      contract: entry.contract ?? undefined,
    });
    refresh();
    void emitTimerChanged();
  }

  function openMainWindow() {
    invokeTauri("show_main_window");
  }

  return (
    <div className="flex flex-col h-screen bg-surface-base text-fg-strong overflow-hidden select-none">
      {/* Timer or start form */}
      <TimerSection
        timer={timer}
        isRunning={isRunning}
        elapsed={
          isRunning ? formatElapsed(timer!.start!) : ""
        }
        customers={customers}
        pausedEntry={paused}
        onStart={handleStart}
        onStop={handleStop}
        onPause={handlePause}
        onResumePaused={handleResumePaused}
        onDismissPaused={handleDismissPaused}
        onUpdateDescription={handleUpdateDescription}
        onUpdateNotes={handleUpdateNotes}
      />

      <div className="border-t border-border-subtle" />

      {/* Quick capture */}
      <CaptureSection />

      <div className="border-t border-border-subtle" />

      {/* Recent entries */}
      <RecentSection
        entries={completedToday}
        onResume={handleResume}
        isRunning={isRunning}
      />

      {/* Footer */}
      <div className="mt-auto border-t border-border-subtle px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-muted">
            {tc("today")}: {formatTotal(todayTotal)}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={openMainWindow}
              className="text-xs text-cta hover:underline"
            >
              {t("openKaisho")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
