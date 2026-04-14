import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Customer } from "../types";
import {
  createCustomer,
  deleteCustomer,
  fetchCustomers,
  updateCustomer,
} from "../api/client";
import { useToast } from "../context/ToastContext";

/** Provides the list of customers. Set includeInactive
 *  to also load archived/inactive customers. */
export function useCustomers(includeInactive = false) {
  return useQuery({
    queryKey: ["customers", includeInactive],
    queryFn: () => fetchCustomers(includeInactive),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Returns a mutation to create a new customer.
 *  Invalidates customer and dashboard caches. */
export function useCreateCustomer() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: {
      name: string;
      status?: string;
      type?: string;
      budget?: number;
      repo?: string | null;
      tags?: string[];
    }) => createCustomer(data),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({
        queryKey: ["customers"],
      });
      void qc.invalidateQueries({
        queryKey: ["dashboard"],
      });
      toast(`Customer created: ${vars.name}`);
    },
  });
}

/** Returns a mutation to delete a customer by name. */
export function useDeleteCustomer() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (name: string) => deleteCustomer(name),
    onSuccess: (_d, name) => {
      void qc.invalidateQueries({
        queryKey: ["customers"],
      });
      void qc.invalidateQueries({
        queryKey: ["dashboard"],
      });
      toast(`Customer deleted: ${name}`);
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  const toast = useToast();
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
      qc.invalidateQueries({
        queryKey: ["customers"],
      });
      qc.invalidateQueries({
        queryKey: ["dashboard"],
      });
      toast("Customer updated");
    },
  });
}
