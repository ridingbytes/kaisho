import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCronJob,
  deleteCronJob,
  deleteCronRun,
  disableCronJob,
  enableCronJob,
  fetchCronHistory,
  fetchCronJobs,
  fetchCronTemplates,
  fetchJobPrompt,
  moveCronOutput,
  saveJobPrompt,
  triggerCronJob,
  updateCronJob,
} from "../api/client";
import type { CronJob } from "../types";
import { useToast } from "../context/ToastContext";

export function useCronJobs() {
  return useQuery({
    queryKey: ["cron", "jobs"],
    queryFn: fetchCronJobs,
    staleTime: 30_000,
  });
}

export function useCronTemplates() {
  return useQuery({
    queryKey: ["cron", "templates"],
    queryFn: fetchCronTemplates,
    staleTime: 5 * 60_000,
  });
}

export function useCronHistory(jobId?: string) {
  return useQuery({
    queryKey: ["cron", "history", jobId],
    queryFn: () => fetchCronHistory(jobId),
    staleTime: 10_000,
    // Poll while at least one run is still "running"
    // so the user sees the output as soon as the job
    // finishes, without needing to manually reload.
    // Idle when nothing's running — no wasted requests.
    refetchInterval: (query) => {
      const runs = query.state.data;
      const hasRunning = Array.isArray(runs)
        && runs.some((r: { status: string }) =>
          r.status === "running",
        );
      return hasRunning ? 3_000 : false;
    },
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
  const toast = useToast();
  return useMutation({
    mutationFn: (data: Parameters<typeof createCronJob>[0]) =>
      createCronJob(data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["cron"] });
      toast(`Cron job added: ${vars.name}`);
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
