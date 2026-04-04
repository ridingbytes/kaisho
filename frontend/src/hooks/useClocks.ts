import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  deleteClockEntry,
  fetchActiveTimer,
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

export function useStartTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      customer,
      description,
    }: {
      customer: string;
      description: string;
    }) => startTimer(customer, description),
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
    }: {
      duration: string;
      customer: string;
      description: string;
    }) => quickBook(duration, customer, description),
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
      updates: { description?: string; hours?: number };
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
