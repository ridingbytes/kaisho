import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  addCustomerType,
  addTag,
  createProfile,
  createSkill,
  createUser,
  deleteCustomerType,
  updateUserProfile,
  deleteSkill,
  deleteTag,
  fetchAdvisorFiles,
  fetchAdvisorSkills,
  fetchAiSettings,
  fetchAvailableModels,
  fetchClaudeCliStatus,
  fetchCurrentUser,
  fetchGithubSettings,
  fetchKbSources,
  fetchPaths,
  fetchProfiles,
  fetchSettings,
  fetchUrlAllowlist,
  fetchUsers,
  reorderStates,
  switchBackend,
  switchProfile,
  updateAdvisorFiles,
  updateAiSettings,
  updateGithubSettings,
  updateKbSources,
  updatePaths,
  updateSkill,
  updateTag,
  updateUrlAllowlist,
} from "../api/client";
import type { AiSettings, TaskState } from "../types";

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

export function useAiSettings() {
  return useQuery({
    queryKey: ["settings", "ai"],
    queryFn: fetchAiSettings,
    staleTime: 30_000,
  });
}

export function useUpdateAiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<AiSettings>) =>
      updateAiSettings(updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["settings", "ai"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["settings", "ai", "models"],
      });
    },
  });
}

export function useClaudeCliStatus() {
  return useQuery({
    queryKey: ["settings", "ai", "claude_cli"],
    queryFn: fetchClaudeCliStatus,
    staleTime: 120_000,
  });
}

export function useAvailableModels() {
  return useQuery({
    queryKey: ["settings", "ai", "models"],
    queryFn: fetchAvailableModels,
    staleTime: 60_000,
    select: (data) => data.models,
  });
}

export function useAddTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      color,
      description,
    }: {
      name: string;
      color: string;
      description?: string;
    }) => addTag(name, color, description),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      updates,
    }: {
      name: string;
      updates: { color?: string; description?: string };
    }) => updateTag(name, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteTag(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useAddCustomerType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => addCustomerType(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useDeleteCustomerType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteCustomerType(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useReorderStates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) => reorderStates(names),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function usePaths() {
  return useQuery({
    queryKey: ["settings", "paths"],
    queryFn: fetchPaths,
    staleTime: 300_000,
  });
}

export function useSwitchBackend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (backend: string) => switchBackend(backend),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useUpdatePaths() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: {
      org_dir?: string;
      markdown_dir?: string;
      data_dir?: string;
    }) => updatePaths(updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "paths"] });
    },
  });
}

export function useKbSources() {
  return useQuery({
    queryKey: ["settings", "kb_sources"],
    queryFn: fetchKbSources,
    staleTime: 60_000,
  });
}

export function useUpdateKbSources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      sources: { label: string; path: string }[]
    ) => updateKbSources(sources),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings", "kb_sources"],
      });
      void qc.invalidateQueries({
        queryKey: ["knowledge"],
      });
    },
  });
}

export function useGithubSettings() {
  return useQuery({
    queryKey: ["settings", "github"],
    queryFn: fetchGithubSettings,
    staleTime: 60_000,
  });
}

export function useUpdateGithubSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      updates: { token?: string; base_url?: string }
    ) => updateGithubSettings(updates),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings", "github"],
      });
    },
  });
}

export function useAdvisorFiles() {
  return useQuery({
    queryKey: ["settings", "advisor_files"],
    queryFn: fetchAdvisorFiles,
    staleTime: 60_000,
  });
}

export function useUpdateAdvisorFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      soul,
      user,
    }: {
      soul: string;
      user: string;
    }) => updateAdvisorFiles(soul, user),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings", "advisor_files"],
      });
    },
  });
}

export function useUrlAllowlist() {
  return useQuery({
    queryKey: ["settings", "url_allowlist"],
    queryFn: fetchUrlAllowlist,
    staleTime: 60_000,
  });
}

export function useUpdateUrlAllowlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domains: string[]) =>
      updateUrlAllowlist(domains),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings", "url_allowlist"],
      });
    },
  });
}

export function useAdvisorSkills() {
  return useQuery({
    queryKey: ["advisor", "skills"],
    queryFn: fetchAdvisorSkills,
    staleTime: 60_000,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      content,
    }: {
      name: string;
      content: string;
    }) => createSkill(name, content),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["advisor", "skills"],
      });
    },
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      content,
    }: {
      name: string;
      content: string;
    }) => updateSkill(name, content),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["advisor", "skills"],
      });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteSkill(name),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["advisor", "skills"],
      });
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["settings", "profiles"],
    queryFn: fetchProfiles,
    staleTime: 60_000,
  });
}

export function useSwitchProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profile: string) => switchProfile(profile),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createProfile(name),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings", "profiles"],
      });
    },
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["settings", "user"],
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
  });
}

export function useUpdateUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: {
      name?: string;
      email?: string;
      bio?: string;
      avatar_seed?: string;
    }) => updateUserProfile(updates),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings", "user"],
      });
    },
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ["settings", "users"],
    queryFn: fetchUsers,
    staleTime: 60_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      username: string;
      name?: string;
      email?: string;
      bio?: string;
    }) => createUser(data),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings", "users"],
      });
    },
  });
}
