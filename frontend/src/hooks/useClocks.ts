import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
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
    }) => startTimer(customer, description, taskId, contract),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clocks"] });
    },
  });
}

export function useStopTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: stopTimer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clocks"] });
    },
  });
}

export function useQuickBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      duration,
      customer,
      description,
      taskId,
      contract,
    }: {
      duration: string;
      customer: string;
      description: string;
      taskId?: string;
      contract?: string;
    }) => quickBook(duration, customer, description, taskId, contract),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clocks"] });
    },
  });
}

export function useUpdateClockEntry() {
  const queryClient = useQueryClient();
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
        task_id?: string;
        booked?: boolean;
        notes?: string;
        contract?: string;
      };
    }) => updateClockEntry(startIso, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clocks"] });
    },
  });
}

export function useDeleteClockEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (startIso: string) => deleteClockEntry(startIso),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clocks"] });
    },
  });
}
