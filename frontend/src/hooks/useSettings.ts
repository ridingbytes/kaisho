import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  addCustomerType,
  addInboxType,
  addInboxChannel,
  addTag,
  copyProfile,
  createProfile,
  createSkill,
  deleteCustomerType,
  deleteInboxType,
  deleteInboxChannel,
  deleteProfile,
  renameProfile,
  updateUserProfile,
  deleteSkill,
  deleteTag,
  fetchAdvisorFiles,
  fetchAdvisorSkills,
  fetchAiSettings,
  fetchAvailableModels,
  fetchBackups,
  fetchBackupSettings,
  fetchClaudeCliStatus,
  fetchCloudActiveTimer,
  fetchCloudSyncStatus,
  fetchInvoiceExportSettings,
  fetchCurrentUser,
  fetchAiUsage,
  probeAiProviders,
  fetchVersionInfo,
  pruneBackupsRemote,
  runBackup,
  updateBackupSettings,
  fetchGithubSettings,
  fetchKbSources,
  fetchPaths,
  fetchProfiles,
  fetchSettings,
  fetchUrlAllowlist,
  addState,
  deleteState,
  reorderStates,
  updateState,
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
  { name: "NEXT", label: "Next", color: "#2563eb", done: false },
  {
    name: "IN-PROGRESS",
    label: "In Progress",
    color: "#d97706",
    done: false,
  },
  { name: "WAIT", label: "Waiting", color: "#7c3aed", done: false },
  { name: "DONE", label: "Done", color: "#16a34a", done: true },
  {
    name: "CANCELLED",
    label: "Cancelled",
    color: "#dc2626",
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
    }) => addTag({ name, color, description }),
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

export function useAddInboxType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => addInboxType(name),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings"],
      });
    },
  });
}

export function useDeleteInboxType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      deleteInboxType(name),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings"],
      });
    },
  });
}

export function useAddInboxChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      addInboxChannel(name),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings"],
      });
    },
  });
}

export function useDeleteInboxChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      deleteInboxChannel(name),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings"],
      });
    },
  });
}

export function useUpdateState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      updates,
    }: {
      name: string;
      updates: { label?: string; color?: string; done?: boolean };
    }) => updateState(name, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useAddState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      label: string;
      color: string;
      done?: boolean;
      after?: string;
    }) => addState(params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useDeleteState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteState(name),
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
      json_dir?: string;
      sql_dsn?: string;
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

export function useInvoiceExportSettings() {
  return useQuery({
    queryKey: ["settings", "invoice_export"],
    queryFn: fetchInvoiceExportSettings,
    staleTime: 60_000,
  });
}

export function useCloudSyncStatus() {
  return useQuery({
    queryKey: ["settings", "cloud_sync"],
    queryFn: fetchCloudSyncStatus,
    staleTime: 30_000,
  });
}

/** Poll the cloud-side running timer every 5s so
 *  timers started on mobile appear on the desktop
 *  quickly. */
export function useCloudActiveTimer() {
  return useQuery({
    queryKey: ["clocks", "cloud_active"],
    queryFn: fetchCloudActiveTimer,
    refetchInterval: 5_000,
    staleTime: 2_500,
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

export function useRenameProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      oldName,
      newName,
    }: {
      oldName: string;
      newName: string;
    }) => renameProfile(oldName, newName),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings", "profiles"],
      });
    },
  });
}

export function useCopyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      target,
    }: {
      name: string;
      target: string;
    }) => copyProfile(name, target),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings", "profiles"],
      });
    },
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteProfile(name),
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
    onMutate: async (updates) => {
      await qc.cancelQueries({ queryKey: ["settings", "user"] });
      const previous = qc.getQueryData(["settings", "user"]);
      qc.setQueryData(["settings", "user"], (old: Record<string, unknown>) => ({
        ...old,
        ...updates,
      }));
      return { previous };
    },
    onError: (_err, _updates, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(["settings", "user"], context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "user"] });
    },
  });
}



// ─── Backup ─────────────────────────────────────────

export function useBackupSettings() {
  return useQuery({
    queryKey: ["settings", "backup"],
    queryFn: fetchBackupSettings,
    staleTime: 60_000,
  });
}

export function useUpdateBackupSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateBackupSettings,
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["settings", "backup"],
      });
    },
  });
}

export function useBackups() {
  return useQuery({
    queryKey: ["backups"],
    queryFn: fetchBackups,
    staleTime: 30_000,
  });
}

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prune: boolean = true) =>
      runBackup(prune),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backups"] });
    },
  });
}

export function usePruneBackups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keep?: number) => pruneBackupsRemote(keep),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backups"] });
    },
  });
}


// ─── Version ───────────────────────────────────────

export function useVersionInfo() {
  return useQuery({
    queryKey: ["version"],
    queryFn: fetchVersionInfo,
    staleTime: 300_000,
  });
}

export function useAiUsage() {
  return useQuery({
    queryKey: ["cloud", "ai_usage"],
    queryFn: fetchAiUsage,
    staleTime: 60_000,
  });
}

export function useAiProbe() {
  return useQuery({
    queryKey: ["settings", "ai", "probe"],
    queryFn: probeAiProviders,
    staleTime: 120_000,
  });
}
