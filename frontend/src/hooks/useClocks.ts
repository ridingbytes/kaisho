import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  deleteClockEntry,
  fetchActiveTimer,
  fetchClockEntries,
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

export function useClockEntries(period: string) {
  return useQuery({
    queryKey: ["clocks", "entries", period],
    queryFn: () => fetchClockEntries(period),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
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
    }: {
      customer: string;
      description: string;
      taskId?: string;
    }) => startTimer(customer, description, taskId),
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
    }: {
      duration: string;
      customer: string;
      description: string;
      taskId?: string;
    }) => quickBook(duration, customer, description, taskId),
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
