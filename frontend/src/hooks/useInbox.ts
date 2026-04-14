import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  captureInboxItem,
  deleteInboxItem,
  fetchInboxItems,
  moveInboxItem,
  promoteInboxItem,
  updateInboxItem,
} from "../api/client";
import { useToast } from "../context/ToastContext";

export function useInboxItems() {
  return useQuery({
    queryKey: ["inbox"],
    queryFn: fetchInboxItems,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCaptureItem() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      text,
      type,
      customer,
      body,
      channel,
      direction,
    }: {
      text: string;
      type?: string;
      customer?: string;
      body?: string;
      channel?: string;
      direction?: string;
    }) => captureInboxItem({
      text, type, customer, body,
      channel, direction,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["inbox"],
      });
      toast("Inbox item captured");
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (itemId: string) =>
      deleteInboxItem(itemId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["inbox"],
      });
      toast("Inbox item deleted");
    },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      itemId,
      updates,
    }: {
      itemId: string;
      updates: {
        title?: string;
        type?: string;
        customer?: string;
        body?: string;
        channel?: string;
        direction?: string;
      };
    }) => updateInboxItem(itemId, updates),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["inbox"],
      });
      toast("Inbox item updated");
    },
  });
}

export function useMoveItem() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      itemId,
      destination,
      customer,
      filename,
    }: {
      itemId: string;
      destination: "todo" | "note" | "kb" | "archive";
      customer?: string;
      filename?: string;
    }) => moveInboxItem(
      itemId, destination, { customer, filename },
    ),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({
        queryKey: ["inbox"],
      });
      void qc.invalidateQueries({
        queryKey: ["tasks"],
      });
      void qc.invalidateQueries({
        queryKey: ["notes"],
      });
      toast(`Moved to ${vars.destination}`);
    },
  });
}

export function usePromoteItem() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      itemId,
      customer,
    }: {
      itemId: string;
      customer: string;
    }) => promoteInboxItem(itemId, customer),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["inbox"],
      });
      void qc.invalidateQueries({
        queryKey: ["tasks"],
      });
      toast("Promoted to task");
    },
  });
}
