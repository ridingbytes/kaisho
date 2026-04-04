import { useQuery } from "@tanstack/react-query";
import { fetchGithubIssues } from "../api/client";

export function useGithubIssues() {
  return useQuery({
    queryKey: ["github", "issues"],
    queryFn: fetchGithubIssues,
    staleTime: 120_000,
  });
}
