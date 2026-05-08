import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createKnowledgeFolder,
  deleteKnowledgeFile,
  fetchKnowledgeDistinctValues,
  fetchKnowledgeFile,
  fetchKnowledgeMetadata,
  fetchKnowledgeTags,
  fetchKnowledgeTree,
  moveKnowledgeFile,
  patchKnowledgeMetadata,
  reindexKnowledge,
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

export function useKnowledgeSearch(
  q: string, paths?: string[],
) {
  // Stable cache key: sorted paths so the order at the
  // call site does not invalidate the query.
  const sortedPaths = paths ? [...paths].sort() : null;
  return useQuery({
    queryKey: ["knowledge", "search", q, sortedPaths],
    queryFn: () => searchKnowledge(q, paths),
    enabled: q.length > 1,
    staleTime: 10_000,
  });
}

export function useKnowledgeTags() {
  return useQuery({
    queryKey: ["knowledge", "tags"],
    queryFn: fetchKnowledgeTags,
    staleTime: 60_000,
  });
}

export function useKnowledgeDistinctValues() {
  return useQuery({
    queryKey: ["knowledge", "distinct-values"],
    queryFn: fetchKnowledgeDistinctValues,
    staleTime: 60_000,
  });
}

export function useKnowledgeMetadata(
  path: string | null,
) {
  return useQuery({
    queryKey: ["knowledge", "metadata", path],
    queryFn: () => fetchKnowledgeMetadata(path!),
    enabled: path !== null,
    staleTime: 30_000,
  });
}

export function usePatchKnowledgeMetadata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      path, patch,
    }: {
      path: string;
      patch: Record<string, unknown>;
    }) => patchKnowledgeMetadata(path, patch),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ["knowledge", "tree"],
      });
      void qc.invalidateQueries({
        queryKey: ["knowledge", "tags"],
      });
      void qc.invalidateQueries({
        queryKey: ["knowledge", "distinct-values"],
      });
      void qc.invalidateQueries({
        queryKey: [
          "knowledge", "metadata", vars.path,
        ],
      });
    },
  });
}

export function useReindexKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reindexKnowledge,
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["knowledge"],
      });
    },
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
