import { useQuery } from "@tanstack/react-query";
import { fetchGithubIssues, fetchGithubProjects } from "../api/client";

export function useGithubIssues() {
  return useQuery({
    queryKey: ["github", "issues"],
    queryFn: fetchGithubIssues,
    staleTime: 120_000,
  });
}

export function useGithubProjects() {
  return useQuery({
    queryKey: ["github", "projects"],
    queryFn: fetchGithubProjects,
    staleTime: 120_000,
  });
}
