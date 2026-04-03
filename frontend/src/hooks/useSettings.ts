import { useQuery } from "@tanstack/react-query";
import { fetchSettings } from "../api/client";
import type { TaskState } from "../types";

const DEFAULT_STATES: TaskState[] = [
  { name: "TODO", label: "To Do", color: "#64748b", done: false },
  { name: "NEXT", label: "Next", color: "#3b82f6", done: false },
  {
    name: "IN-PROGRESS",
    label: "In Progress",
    color: "#f59e0b",
    done: false,
  },
  { name: "WAIT", label: "Waiting", color: "#8b5cf6", done: false },
  { name: "DONE", label: "Done", color: "#10b981", done: true },
  {
    name: "CANCELLED",
    label: "Cancelled",
    color: "#ef4444",
    done: true,
  },
];

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
    staleTime: 60_000,
    select: (data) => ({
      ...data,
      task_states:
        data.task_states?.length > 0
          ? data.task_states
          : DEFAULT_STATES,
    }),
  });
}
