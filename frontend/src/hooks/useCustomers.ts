import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Customer } from "../types";
import {
  createCustomer,
  deleteCustomer,
  fetchCustomers,
  updateCustomer,
} from "../api/client";

export function useCustomers(includeInactive = false) {
  return useQuery({
    queryKey: ["customers", includeInactive],
    queryFn: () => fetchCustomers(includeInactive),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      status?: string;
      type?: string;
      budget?: number;
      repo?: string | null;
      tags?: string[];
    }) => createCustomer(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteCustomer(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
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
          | "name"
          | "status"
          | "type"
          | "color"
          | "budget"
          | "used"
          | "rest"
          | "repo"
          | "tags"
        >
      > & { used_offset?: number };
    }) => updateCustomer(name, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
