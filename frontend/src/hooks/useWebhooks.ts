import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createWebhook,
  deleteWebhook,
  fetchWebhookDeliveries,
  fetchWebhooks,
  testWebhook,
  updateWebhook,
} from "../api/client";

const KEY = ["settings", "webhooks"];
const DELIVERIES_KEY = ["settings", "webhooks", "deliveries"];

/** Webhook subscriptions plus the event catalog. */
export function useWebhooks() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchWebhooks,
    staleTime: 60_000,
  });
}

/** Recent delivery records, newest first. */
export function useWebhookDeliveries() {
  return useQuery({
    queryKey: DELIVERIES_KEY,
    queryFn: () => fetchWebhookDeliveries(),
    // Deliveries are fired server-side; poll while the
    // Automations panel is open so a test/ping shows up.
    refetchInterval: 5_000,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWebhook,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      updates: {
        url?: string;
        events?: string[];
        secret?: string;
        active?: boolean;
      };
    }) => updateWebhook(args.id, args.updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useTestWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: testWebhook,
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: DELIVERIES_KEY,
      });
    },
  });
}
