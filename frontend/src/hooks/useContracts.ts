import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addContract,
  deleteContract,
  fetchContracts,
  updateContract,
} from "../api/client";
import type { Contract, Customer } from "../types";
import { useToast } from "../context/ToastContext";
import { useCustomers } from "./useCustomers";

export function useContracts(customerName: string | null) {
  const { data: customers = [] } = useCustomers(true);
  const isKnown = !!(
    customerName &&
    customers.some(
      (c: Customer) => c.name === customerName,
    )
  );

  return useQuery({
    queryKey: ["contracts", customerName],
    queryFn: () => fetchContracts(customerName!),
    enabled: isKnown,
    staleTime: 15_000,
  });
}

export function useAddContract() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      customerName,
      data,
    }: {
      customerName: string;
      data: {
        name: string;
        budget: number;
        start_date: string;
        notes?: string;
        billable?: boolean;
        invoiced?: boolean;
      };
    }) => addContract(customerName, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ["contracts", vars.customerName],
      });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      toast(`Contract added: ${vars.data.name}`);
    },
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      customerName,
      contractName,
      updates,
    }: {
      customerName: string;
      contractName: string;
      updates: {
        name?: string;
        budget?: number;
        used_offset?: number;
        start_date?: string;
        end_date?: string | null;
        notes?: string;
        billable?: boolean;
        invoiced?: boolean;
      };
    }) => updateContract(customerName, contractName, updates),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ["contracts", vars.customerName],
      });
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      customerName,
      contractName,
    }: {
      customerName: string;
      contractName: string;
    }) => deleteContract(customerName, contractName),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ["contracts", vars.customerName],
      });
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function contractStatusLabel(c: Contract): string {
  return c.end_date ? "closed" : "active";
}
