import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addContract,
  deleteContract,
  fetchContracts,
  updateContract,
} from "../api/client";
import type { Contract } from "../types";

export function useContracts(customerName: string | null) {
  return useQuery({
    queryKey: ["contracts", customerName],
    queryFn: () => fetchContracts(customerName!),
    enabled: !!customerName,
    staleTime: 15_000,
  });
}

export function useAddContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      customerName,
      data,
    }: {
      customerName: string;
      data: {
        name: string;
        kontingent: number;
        start_date: string;
        notes?: string;
      };
    }) => addContract(customerName, data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ["contracts", vars.customerName],
      });
      void qc.invalidateQueries({ queryKey: ["customers"] });
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
        kontingent?: number;
        verbraucht_offset?: number;
        start_date?: string;
        end_date?: string | null;
        notes?: string;
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
