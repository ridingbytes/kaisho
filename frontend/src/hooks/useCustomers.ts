import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Customer } from "../types";
import { fetchCustomers, updateCustomer } from "../api/client";

export function useCustomers(includeInactive = false) {
  return useQuery({
    queryKey: ["customers", includeInactive],
    queryFn: () => fetchCustomers(includeInactive),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      updates,
    }: {
      name: string;
      updates: Partial<
        Pick<
          Customer,
          "name" | "status" | "kontingent" | "verbraucht" | "rest" | "repo"
        >
      >;
    }) => updateCustomer(name, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
