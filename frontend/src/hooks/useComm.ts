import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addComm,
  deleteComm,
  fetchComms,
  searchComms,
  updateComm,
} from "../api/client";

export function useComms(params?: {
  customer?: string;
  channel?: string;
  direction?: string;
}) {
  return useQuery({
    queryKey: ["comm", params],
    queryFn: () => fetchComms(params),
    staleTime: 30_000,
  });
}

export function useUpdateComm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: number;
      updates: {
        subject?: string;
        body?: string;
        contact?: string;
        customer?: string;
        type?: string;
        tags?: string[];
      };
    }) => updateComm(id, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["comm"] });
    },
  });
}

export function useAddComm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      subject: string;
      direction: string;
      channel?: string;
      customer?: string;
      body?: string;
      contact?: string;
      type?: string;
      tags?: string[];
    }) => addComm(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["comm"] });
    },
  });
}

export function useDeleteComm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteComm(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["comm"] });
    },
  });
}

export function useCommSearch(q: string) {
  return useQuery({
    queryKey: ["comm", "search", q],
    queryFn: () => searchComms(q),
    enabled: q.length > 1,
    staleTime: 10_000,
  });
}
