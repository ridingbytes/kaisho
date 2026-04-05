import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  archiveTask,
  createTask,
  fetchArchivedTasks,
  fetchTasks,
  moveTask,
  setTaskTags,
  unarchiveTask,
  updateTask,
} from "../api/client";

export function useTasks(includeDone = false) {
  return useQuery({
    queryKey: ["tasks", includeDone],
    queryFn: () => fetchTasks(includeDone),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMoveTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      status,
    }: {
      taskId: string;
      status: string;
    }) => moveTask(taskId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      customer,
      title,
      status,
      github_url,
    }: {
      customer: string;
      title: string;
      status: string;
      github_url?: string;
    }) => createTask(customer, title, status, github_url),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      updates,
    }: {
      taskId: string;
      updates: {
        title?: string;
        customer?: string;
        status?: string;
        body?: string;
        github_url?: string;
      };
    }) => updateTask(taskId, updates),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useSetTaskTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      tags,
    }: {
      taskId: string;
      tags: string[];
    }) => setTaskTags(taskId, tags),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => archiveTask(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["archive"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useArchivedTasks() {
  return useQuery({
    queryKey: ["archive"],
    queryFn: fetchArchivedTasks,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useUnarchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => unarchiveTask(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}
