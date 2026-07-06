import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useToast } from "../context/ToastContext";
import { isTauri } from "../utils/tauri";
import {
  clearPausedTimer,
  deleteClockEntry,
  fetchPausedTimer,
  mergeClockEntries,
  pauseTimer,
  fetchActiveTimer,
  fetchClockEntries,
  fetchCustomerClockEntries,
  fetchTaskClockEntries,
  fetchTodayEntries,
  quickBook,
  startTimer,
  stopTimer,
  updateClockEntry,
} from "../api/client";
import type { ClockEntry } from "../types";


/** Every clock write affects the same downstream caches:
 *  clock lists, the customer + contract budget bars that
 *  sum booked time, and the dashboard totals. Invalidating
 *  a different subset per mutation left those bars stale
 *  after pause / merge / clear. This single helper keeps
 *  every clock mutation consistent. */
function invalidateClockCaches(qc: QueryClient) {
  for (const key of [
    "clocks", "customers", "contracts", "dashboard",
    // Project rollups sum time booked directly or via an
    // assigned task, so any clock write can change them.
    "projects",
  ]) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}

/** Provides the currently running timer, polling
 *  every 5 seconds. Use this to show elapsed time. */
export function useActiveTimer() {
  return useQuery({
    queryKey: ["clocks", "active"],
    queryFn: fetchActiveTimer,
    refetchInterval: 5_000,
    staleTime: 0,
  });
}

/** Provides the currently paused entry, if any. The UI
 *  shows a Resume affordance for it. Polled at the same
 *  cadence as the active timer so toggles propagate
 *  quickly. */
export function usePausedTimer() {
  return useQuery({
    queryKey: ["clocks", "paused"],
    queryFn: fetchPausedTimer,
    refetchInterval: 5_000,
    staleTime: 0,
  });
}

/** Listen for ``timer-changed`` Tauri events emitted by
 *  the tray popover (separate webview) and global
 *  shortcuts (Rust), and invalidate clocks queries so
 *  the main window picks up the new state immediately
 *  instead of waiting for the next 5s poll. */
export function useTimerChangedListener() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import(
          "@tauri-apps/api/event"
        );
        unlisten = await listen("timer-changed", () => {
          void qc.invalidateQueries({
            queryKey: ["clocks"],
          });
          void qc.invalidateQueries({
            queryKey: ["dashboard"],
          });
        });
      } catch {
        // not in Tauri shell
      }
    })();
    return () => unlisten?.();
  }, [qc]);
}

/** Provides today's clock entries. Refreshes on
 *  window focus. */
export function useTodayEntries() {
  return useQuery({
    queryKey: ["clocks", "today"],
    queryFn: fetchTodayEntries,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Provides clock entries for a time period or a date
 *  range. Pass ``fromDate`` alone for a single day, or
 *  ``fromDate`` + ``toDate`` for an inclusive range. Use
 *  for the clocks history view. */
export function useClockEntries(
  period: string,
  fromDate?: string,
  toDate?: string,
) {
  return useQuery({
    queryKey: [
      "clocks", "entries", period,
      fromDate ?? "", toDate ?? "",
    ],
    queryFn: () =>
      fetchClockEntries(period, fromDate, toDate),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}


/** Provides all clock entries for a specific customer.
 *  Only fetches when a customer name is provided. */
export function useCustomerClockEntries(customer: string) {
  return useQuery({
    queryKey: ["clocks", "customer", customer],
    queryFn: () => fetchCustomerClockEntries(customer),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!customer,
  });
}

/** Provides all clock entries linked to a specific
 *  task. Only fetches when a task ID is provided. */
export function useTaskClockEntries(taskId: string) {
  return useQuery({
    queryKey: ["clocks", "task", taskId],
    queryFn: () => fetchTaskClockEntries(taskId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!taskId,
  });
}

/** Returns a mutation to start a new timer for a
 *  customer. Shows a toast on success. */
export function useStartTimer() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      customer,
      description,
      taskId,
      contract,
    }: {
      customer: string;
      description?: string;
      taskId?: string;
      contract?: string;
    }) => startTimer({
      customer, description, taskId, contract,
    }),
    onSuccess: (_d, vars) => {
      invalidateClockCaches(qc);
      toast(`Timer started: ${vars.customer}`);
    },
  });
}

/** Returns a mutation to stop the running timer.
 *  Shows a toast on success. */
export function useStopTimer() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: stopTimer,
    onSuccess: () => {
      invalidateClockCaches(qc);
      toast("Timer stopped");
    },
  });
}

/** Dismiss the paused state without touching the
 *  underlying clock entry. The Resume widget disappears
 *  and the closed entry stays in the file. */
export function useClearPaused() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearPausedTimer,
    onSuccess: () => {
      invalidateClockCaches(qc);
    },
  });
}

/** Returns a mutation that pauses the running timer:
 *  stops it but skips the round-on-stop setting so the
 *  partial segment is recorded at exact length. The
 *  user can Resume from the entry's row to reopen it. */
export function usePauseTimer() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: pauseTimer,
    onSuccess: () => {
      invalidateClockCaches(qc);
      toast("Timer paused");
    },
  });
}

/** Returns a mutation to book time without the timer.
 *  Provide a duration string like "1h30m". */
export function useQuickBook() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      duration,
      customer,
      description,
      taskId,
      contract,
      date,
      notes,
    }: {
      duration: string;
      customer: string;
      description?: string;
      taskId?: string;
      contract?: string;
      date?: string;
      notes?: string;
    }) => quickBook({
      duration, customer, description,
      taskId, contract, date, notes,
    }),
    onSuccess: (_d, vars) => {
      invalidateClockCaches(qc);
      toast(`Booked ${vars.duration} for ${vars.customer}`);
    },
  });
}

/** Returns a mutation to update an existing clock
 *  entry (customer, description, hours, etc.). The
 *  entry is identified by ``sync_id`` when available
 *  (collision-free), else by start timestamp. */
export function useUpdateClockEntry() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      entry,
      updates,
    }: {
      entry: { sync_id: string | null; start: string };
      updates: {
        customer?: string;
        description?: string;
        hours?: number;
        new_date?: string;
        start_time?: string;
        task_id?: string;
        invoiced?: boolean;
        notes?: string;
        contract?: string;
        project?: string;
      };
      silent?: boolean;
    }) => updateClockEntry(entry, updates),
    onSuccess: (_data, vars) => {
      invalidateClockCaches(qc);
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (!vars.silent) toast("Clock entry updated");
    },
  });
}

/** Returns a mutation that applies the same field
 *  updates to many clock entries at once (bulk edit of
 *  invoiced / contract / customer). Writes are performed
 *  sequentially, not in parallel: the org backend appends
 *  to one file per write and concurrent writes race. The
 *  caches are invalidated once, after the whole batch. */
export function useBatchUpdateClockEntries() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({
      entries,
      updates,
    }: {
      entries: ClockEntry[];
      updates: {
        invoiced?: boolean;
        contract?: string;
        customer?: string;
      };
    }) => {
      for (const e of entries) {
        await updateClockEntry(
          { sync_id: e.sync_id, start: e.start },
          updates,
        );
      }
    },
    onSuccess: (_data, vars) => {
      invalidateClockCaches(qc);
      toast(`${vars.entries.length} entries updated`);
    },
  });
}

/** Returns a mutation that merges two clock entries:
 *  ``from`` is deleted and its time + notes are folded
 *  into ``into``. Both entries must share a customer
 *  and be stopped. */
export function useMergeClockEntries() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (args: {
      into: { sync_id: string | null };
      from: { sync_id: string | null };
    }) => {
      if (!args.into.sync_id || !args.from.sync_id) {
        return Promise.reject(
          new Error("Both entries need a sync_id"),
        );
      }
      return mergeClockEntries(
        args.into.sync_id, args.from.sync_id,
      );
    },
    onSuccess: () => {
      invalidateClockCaches(qc);
      toast("Entries merged");
    },
    onError: (err: Error) => {
      toast(err.message || "Could not merge entries");
    },
  });
}

/** Returns a mutation to delete a clock entry. The
 *  entry is identified by ``sync_id`` when available
 *  (collision-free), else by start timestamp. */
export function useDeleteClockEntry() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (
      entry: { sync_id: string | null; start: string },
    ) => deleteClockEntry(entry),
    onSuccess: () => {
      invalidateClockCaches(qc);
      toast("Clock entry deleted");
    },
  });
}
