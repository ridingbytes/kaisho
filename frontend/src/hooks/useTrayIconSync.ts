/**
 * Push the active-timer snapshot to the Rust tray
 * helper on each transition. A Rust-side ticker
 * recomputes elapsed at every wall-clock minute
 * boundary so the menu bar stays current even when the
 * main window is backgrounded and its setInterval is
 * OS-throttled.
 */
import { useEffect, useRef } from "react";
import { isTauri } from "../utils/tauri";
import type { ActiveTimer } from "../types";

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
  isError: boolean = false,
) {
  const lastKeyRef = useRef<string>("");
  const lastOfflineRef = useRef<boolean | null>(null);

  // Push backend offline state separately from the
  // timer snapshot so the offline icon doesn't get
  // overwritten by a stale timer push.
  useEffect(() => {
    if (!isTauri()) return;
    if (lastOfflineRef.current === isError) return;
    lastOfflineRef.current = isError;
    invokeTauri("set_backend_offline", { offline: isError });
  }, [isError]);

  useEffect(() => {
    if (!isTauri()) return;
    if (!timer) return;
    if (!timer.active || !timer.start) {
      if (lastKeyRef.current !== "idle") {
        invokeTauri("clear_active_timer");
        lastKeyRef.current = "idle";
      }
      return;
    }
    const startSecs = Math.floor(
      new Date(timer.start).getTime() / 1000,
    );
    const label = timer.customer || "Kaisho";
    const key = `${startSecs}|${label}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    invokeTauri("set_active_timer", {
      startSecs,
      label,
    });
  }, [timer]);
}
