import { useQuery } from "@tanstack/react-query";
import { fetchDashboard } from "../api/client";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
