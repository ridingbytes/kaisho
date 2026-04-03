import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  captureInboxItem,
  deleteInboxItem,
  fetchInboxItems,
  promoteInboxItem,
} from "../api/client";

export function useInboxItems() {
  return useQuery({
    queryKey: ["inbox"],
    queryFn: fetchInboxItems,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCaptureItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      text,
      type,
      customer,
    }: {
      text: string;
      type?: string;
      customer?: string;
    }) => captureInboxItem(text, type, customer),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteInboxItem(itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });
}

export function usePromoteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      customer,
    }: {
      itemId: string;
      customer: string;
    }) => promoteInboxItem(itemId, customer),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
