import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useToast } from "../context/ToastContext";
import {
  deleteClockEntry,
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
    }: {
      customer: string;
      description: string;
      taskId?: string;
      contract?: string;
    }) => startTimer({
      customer, description, taskId, contract,
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
      description: string;
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
      toast(`Booked ${vars.duration} for ${vars.customer}`);
    },
  });
}

/** Returns a mutation to update an existing clock
 *  entry (customer, description, hours, etc.). */
export function useUpdateClockEntry() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      startIso,
      updates,
    }: {
      startIso: string;
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
    }) => updateClockEntry(startIso, updates),
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
      toast("Clock entry updated");
    },
  });
}

/** Returns a mutation to delete a clock entry by
 *  its start timestamp. */
export function useDeleteClockEntry() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (startIso: string) =>
      deleteClockEntry(startIso),
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
      toast("Clock entry deleted");
    },
  });
}
