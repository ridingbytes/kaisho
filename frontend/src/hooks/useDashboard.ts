import { useQuery } from "@tanstack/react-query";
import {
  fetchDashboard,
  fetchTimeInsights,
} from "../api/client";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useTimeInsights(period: string) {
  return useQuery({
    queryKey: ["time-insights", period],
    queryFn: () => fetchTimeInsights(period),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
