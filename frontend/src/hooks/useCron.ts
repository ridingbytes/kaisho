import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disableCronJob,
  enableCronJob,
  fetchCronHistory,
  fetchCronJobs,
  triggerCronJob,
} from "../api/client";

export function useCronJobs() {
  return useQuery({
    queryKey: ["cron", "jobs"],
    queryFn: fetchCronJobs,
    staleTime: 30_000,
  });
}

export function useCronHistory(jobId?: string) {
  return useQuery({
    queryKey: ["cron", "history", jobId],
    queryFn: () => fetchCronHistory(jobId),
    staleTime: 10_000,
  });
}

export function useTriggerCronJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => triggerCronJob(jobId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cron"] });
    },
  });
}

export function useEnableCronJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => enableCronJob(jobId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cron"] });
    },
  });
}

export function useDisableCronJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => disableCronJob(jobId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cron"] });
    },
  });
}
