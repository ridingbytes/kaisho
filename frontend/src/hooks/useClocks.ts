import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useToast } from "../context/ToastContext";
import { isTauri } from "../utils/tauri";
import {
  deleteClockEntry,
  mergeClockEntries,
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

/** Fire a Tauri ``timer-changed`` event so the tray
 *  popover (a separate webview) re-fetches its data
 *  after a start / stop / merge / delete from the main
 *  window. No-op outside Tauri. */
async function emitTimerChanged(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit("timer-changed", "");
  } catch {
    // not in Tauri shell
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

/** Provides clock entries for a time period or a
 *  specific date. Use for the clocks history view. */
export function useClockEntries(period: string, specificDate?: string) {
  return useQuery({
    queryKey: ["clocks", "entries", period, specificDate ?? ""],
    queryFn: () => fetchClockEntries(period, specificDate),
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
      forceNew,
    }: {
      customer: string;
      description?: string;
      taskId?: string;
      contract?: string;
      forceNew?: boolean;
    }) => startTimer({
      customer, description, taskId, contract, forceNew,
    }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({
        queryKey: ["clocks"],
      });
      void qc.invalidateQueries({
        queryKey: ["customers"],
      });
      void qc.invalidateQueries({
        queryKey: ["contracts"],
      });
      void qc.invalidateQueries({
        queryKey: ["dashboard"],
      });
      void emitTimerChanged();
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
      void qc.invalidateQueries({
        queryKey: ["clocks"],
      });
      void qc.invalidateQueries({
        queryKey: ["customers"],
      });
      void qc.invalidateQueries({
        queryKey: ["contracts"],
      });
      void qc.invalidateQueries({
        queryKey: ["dashboard"],
      });
      void emitTimerChanged();
      toast("Timer stopped");
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
      void qc.invalidateQueries({
        queryKey: ["clocks"],
      });
      void qc.invalidateQueries({
        queryKey: ["customers"],
      });
      void qc.invalidateQueries({
        queryKey: ["contracts"],
      });
      void qc.invalidateQueries({
        queryKey: ["dashboard"],
      });
      void emitTimerChanged();
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
      };
      silent?: boolean;
    }) => updateClockEntry(entry, updates),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ["clocks"],
      });
      void qc.invalidateQueries({
        queryKey: ["customers"],
      });
      void qc.invalidateQueries({
        queryKey: ["contracts"],
      });
      void qc.invalidateQueries({
        queryKey: ["dashboard"],
      });
      void emitTimerChanged();
      if (!vars.silent) toast("Clock entry updated");
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
      void qc.invalidateQueries({
        queryKey: ["clocks"],
      });
      void qc.invalidateQueries({
        queryKey: ["dashboard"],
      });
      void emitTimerChanged();
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
      void qc.invalidateQueries({
        queryKey: ["clocks"],
      });
      void qc.invalidateQueries({
        queryKey: ["customers"],
      });
      void qc.invalidateQueries({
        queryKey: ["contracts"],
      });
      void qc.invalidateQueries({
        queryKey: ["dashboard"],
      });
      void emitTimerChanged();
      toast("Clock entry deleted");
    },
  });
}
