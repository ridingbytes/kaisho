import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCronJob,
  deleteCronJob,
  deleteCronRun,
  disableCronJob,
  enableCronJob,
  fetchCronHistory,
  fetchCronJobs,
  fetchJobPrompt,
  moveCronOutput,
  saveJobPrompt,
  triggerCronJob,
  updateCronJob,
} from "../api/client";
import type { CronJob } from "../types";

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

export function useAddCronJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof createCronJob>[0]) =>
      createCronJob(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cron"] });
    },
  });
}

export function useUpdateCronJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      updates,
    }: {
      jobId: string;
      updates: Partial<
        Pick<CronJob, "name" | "schedule" | "model" | "output" | "timeout">
      >;
    }) => updateCronJob(jobId, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cron"] });
    },
  });
}

export function useDeleteCronJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => deleteCronJob(jobId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cron"] });
    },
  });
}

export function useJobPrompt(jobId: string) {
  return useQuery({
    queryKey: ["cron", "prompt", jobId],
    queryFn: () => fetchJobPrompt(jobId),
    enabled: !!jobId,
    staleTime: 60_000,
  });
}

export function useDeleteCronRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: number) => deleteCronRun(runId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cron"] });
    },
  });
}

export function useMoveCronOutput() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      runId,
      destination,
      customer,
      filename,
    }: {
      runId: number;
      destination: "inbox" | "todo" | "note" | "kb";
      customer?: string;
      filename?: string;
    }) => moveCronOutput(runId, destination, { customer, filename }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cron"] });
      void qc.invalidateQueries({ queryKey: ["inbox"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useSaveJobPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      content,
    }: {
      jobId: string;
      content: string;
    }) => saveJobPrompt(jobId, content),
    onSuccess: (_, { jobId }) => {
      void qc.invalidateQueries({ queryKey: ["cron", "prompt", jobId] });
    },
  });
}
