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
import { useToast } from "../context/ToastContext";

export function useTasks(includeDone = false) {
  return useQuery({
    queryKey: ["tasks", includeDone],
    queryFn: () => fetchTasks(includeDone),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      taskId,
      status,
    }: {
      taskId: string;
      status: string;
    }) => moveTask(taskId, status),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({
        queryKey: ["tasks"],
      });
      toast(`Task moved to ${vars.status}`);
    },
  });
}

export function useAddTask() {
  const qc = useQueryClient();
  const toast = useToast();
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
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({
        queryKey: ["tasks"],
      });
      toast(`Task added: ${vars.title}`);
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  const toast = useToast();
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
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["tasks"],
      });
      toast("Task updated");
    },
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
    onSuccess: () =>
      void qc.invalidateQueries({
        queryKey: ["tasks"],
      }),
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (taskId: string) => archiveTask(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["tasks"],
      });
      void qc.invalidateQueries({
        queryKey: ["archive"],
      });
      void qc.invalidateQueries({
        queryKey: ["dashboard"],
      });
      toast("Task archived");
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
  const toast = useToast();
  return useMutation({
    mutationFn: (taskId: string) => unarchiveTask(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["tasks"],
      });
      void qc.invalidateQueries({
        queryKey: ["archive"],
      });
      toast("Task restored");
    },
  });
}
