import { useQuery } from "@tanstack/react-query";
import { fetchCustomers } from "../api/client";

export function useCustomers(includeInactive = false) {
  return useQuery({
    queryKey: ["customers", includeInactive],
    queryFn: () => fetchCustomers(includeInactive),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
