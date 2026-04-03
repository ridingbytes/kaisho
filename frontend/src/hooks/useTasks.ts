import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchTasks, moveTask } from "../api/client";

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
