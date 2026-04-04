import { useQuery } from "@tanstack/react-query";
import {
  fetchKnowledgeFile,
  fetchKnowledgeTree,
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
