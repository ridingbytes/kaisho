import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createKnowledgeFolder,
  deleteKnowledgeFile,
  fetchKnowledgeFile,
  fetchKnowledgeTree,
  moveKnowledgeFile,
  renameKnowledgeFile,
  saveKnowledgeFile,
  searchKnowledge,
} from "../api/client";

export function useKnowledgeTree() {
  return useQuery({
    queryKey: ["knowledge", "tree"],
    queryFn: fetchKnowledgeTree,
    staleTime: 60_000,
  });
}

export function useKnowledgeFile(path: string | null) {
  return useQuery({
    queryKey: ["knowledge", "file", path],
    queryFn: () => fetchKnowledgeFile(path!),
    enabled: path !== null,
    staleTime: 30_000,
  });
}

export function useKnowledgeSearch(q: string) {
  return useQuery({
    queryKey: ["knowledge", "search", q],
    queryFn: () => searchKnowledge(q),
    enabled: q.length > 1,
    staleTime: 10_000,
  });
}

export function useSaveKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      label,
      path,
      content,
    }: {
      label: string;
      path: string;
      content: string;
    }) => saveKnowledgeFile({ label, path, content }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["knowledge", "tree"] });
      void qc.invalidateQueries({
        queryKey: ["knowledge", "file", vars.path],
      });
    },
  });
}

export function useCreateKnowledgeFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      label, path,
    }: {
      label: string;
      path: string;
    }) => createKnowledgeFolder(label, path),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["knowledge", "tree"],
      });
    },
  });
}

export function useDeleteKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => deleteKnowledgeFile(path),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}

export function useRenameKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      oldPath,
      newPath,
    }: {
      oldPath: string;
      newPath: string;
    }) => renameKnowledgeFile(oldPath, newPath),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}

export function useMoveKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      oldPath,
      oldLabel,
      newLabel,
      newPath,
    }: {
      oldPath: string;
      oldLabel: string;
      newLabel: string;
      newPath?: string;
    }) => moveKnowledgeFile({
      oldPath, oldLabel, newLabel, newPath,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}
