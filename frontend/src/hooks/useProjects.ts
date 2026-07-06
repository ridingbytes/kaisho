import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  addMilestone,
  createProject,
  deleteMilestone,
  deleteProject,
  deleteProjectFile,
  fetchProject,
  fetchProjectAggregate,
  fetchProjectFiles,
  fetchProjects,
  updateMilestone,
  updateProject,
} from "../api/client";

const KEY = ["projects"];

export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: [...KEY, includeArchived],
    queryFn: () => fetchProjects(includeArchived),
    staleTime: 30_000,
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "one", id],
    queryFn: () => fetchProject(id as string),
    enabled: !!id,
  });
}

export function useProjectAggregate(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "aggregate", id],
    queryFn: () => fetchProjectAggregate(id as string),
    enabled: !!id,
  });
}

export function useProjectFiles(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "files", id],
    queryFn: () => fetchProjectFiles(id as string),
    enabled: !!id,
  });
}

/** Invalidate everything that depends on a project. */
function invalidateProject(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: KEY });
  // The dashboard embeds active-project cards.
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => invalidateProject(qc),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      updates: Parameters<typeof updateProject>[1];
    }) => updateProject(args.id, args.updates),
    onSuccess: () => invalidateProject(qc),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => invalidateProject(qc),
  });
}

export function useAddMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      projectId: string;
      title: string;
      due?: string | null;
    }) =>
      addMilestone(args.projectId, {
        title: args.title,
        due: args.due,
      }),
    onSuccess: () => invalidateProject(qc),
  });
}

export function useUpdateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      projectId: string;
      milestoneId: string;
      updates: { title?: string; done?: boolean; due?: string };
    }) =>
      updateMilestone(
        args.projectId, args.milestoneId, args.updates,
      ),
    onSuccess: () => invalidateProject(qc),
  });
}

export function useDeleteMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      projectId: string;
      milestoneId: string;
    }) => deleteMilestone(args.projectId, args.milestoneId),
    onSuccess: () => invalidateProject(qc),
  });
}

export function useDeleteProjectFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      projectId: string;
      storedName: string;
    }) => deleteProjectFile(args.projectId, args.storedName),
    onSuccess: () => invalidateProject(qc),
  });
}
