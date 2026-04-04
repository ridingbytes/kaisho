import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Customer } from "../types";
import {
  addTimeEntry,
  deleteTimeEntry,
  fetchCustomers,
  fetchTimeEntries,
  updateCustomer,
  updateTimeEntry,
} from "../api/client";

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

export function useTimeEntries(customerName: string) {
  return useQuery({
    queryKey: ["time-entries", customerName],
    queryFn: () => fetchTimeEntries(customerName),
    staleTime: 30_000,
  });
}

export function useAddTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      customerName,
      description,
      hours,
      date,
    }: {
      customerName: string;
      description: string;
      hours: number;
      date?: string;
    }) => addTimeEntry(customerName, description, hours, date),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ["time-entries", vars.customerName],
      });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      customerName,
      entryId,
      updates,
    }: {
      customerName: string;
      entryId: string;
      updates: { description?: string; hours?: number; date?: string };
    }) => updateTimeEntry(customerName, entryId, updates),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ["time-entries", vars.customerName],
      });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      customerName,
      entryId,
    }: {
      customerName: string;
      entryId: string;
    }) => deleteTimeEntry(customerName, entryId),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ["time-entries", vars.customerName],
      });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
