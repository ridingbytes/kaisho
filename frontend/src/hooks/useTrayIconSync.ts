/**
 * Keep the system-tray icon and (macOS) menu-bar title
 * in sync with the active timer.
 *
 * Driven from the main window so the title keeps ticking
 * even when the tray popover is closed (the hidden tray
 * webview gets background-throttled and misses updates).
 */
import { useEffect, useRef, useState } from "react";
import { isTauri } from "../utils/tauri";
import type { ActiveTimer } from "../types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatElapsed(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

function formatElapsedShort(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime();
  const total = Math.max(0, Math.floor(ms / 60_000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function hoursElapsed(startIso: string): number {
  return (
    (Date.now() - new Date(startIso).getTime())
    / 3_600_000
  );
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
    // not in Tauri shell
  }
}

export function useTrayIconSync(
  timer: ActiveTimer | null | undefined,
) {
  const [, setTick] = useState(0);
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    if (!isTauri()) return;
    if (!timer?.active) return;
    const id = setInterval(
      () => setTick((n) => n + 1), 1000,
    );
    return () => clearInterval(id);
  }, [timer?.active]);

  useEffect(() => {
    if (!isTauri()) return;
    if (!timer) return;
    if (!timer.active || !timer.start) {
      if (lastKeyRef.current !== "idle") {
        invokeTauri("update_tray_icon", {
          state: "idle",
          tooltip: "Kaisho — no active timer",
          title: "",
        });
        lastKeyRef.current = "idle";
      }
      return;
    }
    const hours = hoursElapsed(timer.start);
    const elapsed = formatElapsed(timer.start);
    const elapsedShort = formatElapsedShort(timer.start);
    const label = timer.customer || "Kaisho";
    const state = hours > 8 ? "long" : "active";
    const tooltip = hours > 8
      ? `${label} — ${elapsed} (long)`
      : `${label} — ${elapsed}`;
    const key = `${state}|${elapsedShort}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    invokeTauri("update_tray_icon", {
      state, tooltip, title: elapsedShort,
    });
  });
}
