import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  addCalDavAccount,
  getCalDavPushConfig,
  listCalDavAccounts,
  listCalDavCalendars,
  listCalDavPresets,
  refreshCalDavAccount,
  removeCalDavAccount,
  setCalDavPushConfig,
  testCalDavConnection,
  type CalDavConnectInput,
  type CalDavPushConfig,
} from "../api/client";

const ACCOUNTS_KEY = ["caldav", "accounts"];
const PRESETS_KEY = ["caldav", "presets"];

/** List configured presets (static for the session;
 *  cached for an hour). */
export function useCalDavPresets() {
  return useQuery({
    queryKey: PRESETS_KEY,
    queryFn: listCalDavPresets,
    staleTime: 60 * 60 * 1000,
  });
}

/** List connected CalDAV accounts. */
export function useCalDavAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: listCalDavAccounts,
    staleTime: 30_000,
  });
}

/** List calendars on one account (for the per-account
 *  enable / disable UI). */
export function useCalDavCalendars(
  accountId: string | null,
) {
  return useQuery({
    queryKey: ["caldav", "calendars", accountId],
    queryFn: () => listCalDavCalendars(accountId as string),
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Add an account; invalidates the account list + the
 *  /api/integrations list so the IntegrationsTab and the
 *  calendar panel react immediately. */
export function useAddCalDavAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CalDavConnectInput) =>
      addCalDavAccount(body),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ACCOUNTS_KEY,
      });
      void qc.invalidateQueries({
        queryKey: ["calendar", "sources"],
      });
      void qc.invalidateQueries({
        queryKey: ["calendar", "events"],
      });
    },
  });
}

/** Remove an account by id. */
export function useRemoveCalDavAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      removeCalDavAccount(accountId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ACCOUNTS_KEY,
      });
      void qc.invalidateQueries({
        queryKey: ["calendar", "sources"],
      });
      void qc.invalidateQueries({
        queryKey: ["calendar", "events"],
      });
    },
  });
}

/** Preflight check on the connect form. Does not write
 *  anything server-side. */
export function useTestCalDavConnection() {
  return useMutation({
    mutationFn: (body: CalDavConnectInput) =>
      testCalDavConnection(body),
  });
}

/** Read the per-account "push clock entries to a
 *  calendar" config (Phase 1.5). */
export function useCalDavPushConfig(
  accountId: string | null,
) {
  return useQuery({
    queryKey: ["caldav", "push-config", accountId],
    queryFn: () =>
      getCalDavPushConfig(accountId as string),
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Update the per-account push config. Invalidates the
 *  push-config + accounts queries so the UI reflects the
 *  new state instantly. */
export function useSetCalDavPushConfig(
  accountId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CalDavPushConfig) =>
      setCalDavPushConfig(accountId, body),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["caldav", "push-config", accountId],
      });
      void qc.invalidateQueries({
        queryKey: ["caldav", "accounts"],
      });
    },
  });
}


/** Manual cache-bust for an account. */
export function useRefreshCalDavAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      refreshCalDavAccount(accountId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["calendar", "events"],
      });
    },
  });
}
