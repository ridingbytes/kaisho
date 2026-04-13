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

export function useActiveTimer() {
  return useQuery({
    queryKey: ["clocks", "active"],
    queryFn: fetchActiveTimer,
    refetchInterval: 5_000,
    staleTime: 0,
  });
}

export function useTodayEntries() {
  return useQuery({
    queryKey: ["clocks", "today"],
    queryFn: fetchTodayEntries,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useClockEntries(period: string, specificDate?: string) {
  return useQuery({
    queryKey: ["clocks", "entries", period, specificDate ?? ""],
    queryFn: () => fetchClockEntries(period, specificDate),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}


export function useCustomerClockEntries(customer: string) {
  return useQuery({
    queryKey: ["clocks", "customer", customer],
    queryFn: () => fetchCustomerClockEntries(customer),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!customer,
  });
}

export function useTaskClockEntries(taskId: string) {
  return useQuery({
    queryKey: ["clocks", "task", taskId],
    queryFn: () => fetchTaskClockEntries(taskId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!taskId,
  });
}

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
    }) => startTimer(
      customer, description, taskId, contract,
    ),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({
        queryKey: ["clocks"],
      });
      toast(`Timer started: ${vars.customer}`);
    },
  });
}

export function useStopTimer() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: stopTimer,
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["clocks"],
      });
      toast("Timer stopped");
    },
  });
}

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
    }) => quickBook(
      duration, customer, description,
      taskId, contract, date, notes,
    ),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({
        queryKey: ["clocks"],
      });
      toast(`Booked ${vars.duration} for ${vars.customer}`);
    },
  });
}

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
      toast("Clock entry updated");
    },
  });
}

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
      toast("Clock entry deleted");
    },
  });
}
