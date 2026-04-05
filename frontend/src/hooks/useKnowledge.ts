import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteKnowledgeFile,
  fetchKnowledgeFile,
  fetchKnowledgeTree,
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
    }) => saveKnowledgeFile(label, path, content),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["knowledge", "tree"] });
      void qc.invalidateQueries({
        queryKey: ["knowledge", "file", vars.path],
      });
    },
  });
}

export function useDeleteKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => deleteKnowledgeFile(path),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["knowledge", "tree"] });
    },
  });
}
