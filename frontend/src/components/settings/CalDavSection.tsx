import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  CalDavAccount,
  CalDavConnectInput,
  CalDavPreset,
} from "../../api/client";
import {
  useAddCalDavAccount,
  useCalDavAccounts,
  useCalDavCalendars,
  useCalDavPresets,
  useCalDavPushConfig,
  useCalDavPushHealth,
  usePushSyncCalDavAccount,
  useRemoveCalDavAccount,
  useSetCalDavPushConfig,
  useTestCalDavConnection,
} from "../../hooks/useCalDav";
import { openExternal } from "../../utils/tauri";
import { Toggle } from "../common/Toggle";

const btn =
  "px-3 py-1 rounded-lg text-xs font-medium "
  + "transition-colors disabled:opacity-50";

const inputCls =
  "flex-1 px-2 py-1 rounded-lg text-xs bg-surface-raised "
  + "border border-border text-fg-strong "
  + "placeholder-fg-muted focus:outline-none "
  + "focus:border-cta";

/**
 * CalDAV connect / disconnect card for the Integrations
 * tab. Rendered as a sibling of the generic PROVIDERS
 * list because CalDAV needs four inputs (preset, server
 * host, username, password) rather than a single API key.
 *
 * No Pro gate: matches the local-GitHub / Phase-1 CalDAV
 * model -- local-first integrations are free.
 */
export function CalDavSection(): JSX.Element {
  const { t } = useTranslation("settings");
  const presetsQ = useCalDavPresets();
  const accountsQ = useCalDavAccounts();

  const accounts = accountsQ.data?.accounts || [];
  const presets = presetsQ.data?.presets || [];

  return (
    <div className="bg-surface-card rounded-lg border border-border p-4 flex flex-col gap-3">
      <CalDavHeader count={accounts.length} />
      {accounts.length > 0 && (
        <AccountList accounts={accounts} />
      )}
      <AddAccountForm presets={presets} />
      <p className="text-2xs text-fg-subtle">
        {t("integrations.caldav.note")}
      </p>
    </div>
  );
}


function CalDavHeader({ count }: { count: number }) {
  const { t } = useTranslation("settings");
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-semibold text-sm text-fg-strong">
          {t("integrations.caldav.label")}
        </p>
        <p className="text-2xs text-fg-muted mt-0.5">
          {t("integrations.caldav.hint")}
        </p>
      </div>
      {count > 0 && (
        <span className="text-xs text-green-600">
          {t("integrations.caldav.connected", { count })}
        </span>
      )}
    </div>
  );
}


function AccountList({
  accounts,
}: {
  accounts: CalDavAccount[];
}) {
  const { t } = useTranslation("settings");
  const remove = useRemoveCalDavAccount();

  return (
    <div className="flex flex-col gap-2">
      {accounts.map((acc) => (
        <div
          key={acc.id}
          className="bg-surface-raised rounded-lg border border-border p-2 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-fg-strong truncate">
                {acc.label}
              </p>
              <p className="text-2xs text-fg-muted truncate">
                {acc.preset} · {acc.username}
              </p>
              {acc.storage === "fallback" && (
                <p className="text-2xs text-amber-600 mt-0.5">
                  {t("integrations.caldav.fallbackWarning")}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove.mutate(acc.id)}
              disabled={remove.isPending}
              className={`${btn} bg-surface-card border border-border text-fg hover:bg-surface-raised`}
            >
              {t("integrations.disconnect")}
            </button>
          </div>
          <PushConfigEditor accountId={acc.id} />
        </div>
      ))}
    </div>
  );
}


function AddAccountForm({
  presets,
}: {
  presets: CalDavPreset[];
}) {
  const { t } = useTranslation("settings");
  const add = useAddCalDavAccount();
  const test = useTestCalDavConnection();

  const [presetId, setPresetId] = useState<string>(
    presets[0]?.id || "icloud",
  );
  const [host, setHost] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const preset = presets.find((p) => p.id === presetId);

  function buildBody(): CalDavConnectInput {
    return {
      preset: presetId,
      username,
      password,
      label,
      host,
      url,
    };
  }

  function reset() {
    setPassword("");
    setUsername("");
    setLabel("");
    setHost("");
    setUrl("");
    setErr(null);
    setOk(null);
  }

  async function handleTest() {
    setErr(null);
    setOk(null);
    try {
      const r = await test.mutateAsync(buildBody());
      setOk(t("integrations.caldav.testOk", {
        count: r.calendar_count,
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleConnect() {
    setErr(null);
    setOk(null);
    try {
      await add.mutateAsync(buildBody());
      reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = test.isPending || add.isPending;
  const ready =
    !!presetId
    && !!username.trim()
    && !!password.trim()
    && (!preset?.needs_host || !!host.trim())
    && (presetId !== "custom" || !!url.trim());

  return (
    <div className="border-t border-border pt-3">
      <p className="text-xs font-medium text-fg mb-2">
        {t("integrations.caldav.addAccount")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
          className={inputCls}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t(
            "integrations.caldav.labelPlaceholder",
          )}
          className={inputCls}
        />
        {preset?.needs_host && (
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder={t(
              "integrations.caldav.hostPlaceholder",
            )}
            className={inputCls}
          />
        )}
        {presetId === "custom" && (
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t(
              "integrations.caldav.urlPlaceholder",
            )}
            className={inputCls}
          />
        )}
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t(
            "integrations.caldav.usernamePlaceholder",
          )}
          className={inputCls}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t(
            "integrations.caldav.passwordPlaceholder",
          )}
          className={inputCls}
        />
      </div>
      {preset?.auth_note && (
        <p className="text-2xs text-fg-muted mt-2">
          {preset.auth_note}{" "}
          {preset.hint_url && (
            <button
              type="button"
              onClick={() => openExternal(preset.hint_url)}
              className="underline text-cta hover:text-cta-hover"
            >
              {t("integrations.caldav.docs")}
            </button>
          )}
        </p>
      )}
      {ok && (
        <p className="text-xs text-green-600 mt-2">{ok}</p>
      )}
      {err && (
        <p className="text-xs text-red-500 mt-2">{err}</p>
      )}
      <div className="flex gap-2 mt-3 justify-end">
        <button
          type="button"
          onClick={handleTest}
          disabled={busy || !ready}
          className={`${btn} bg-surface-raised border border-border text-fg hover:bg-surface-card`}
        >
          {t("integrations.caldav.test")}
        </button>
        <button
          type="button"
          onClick={handleConnect}
          disabled={busy || !ready}
          className={`${btn} bg-cta text-white hover:bg-cta-hover`}
        >
          {t("integrations.connect")}
        </button>
      </div>
    </div>
  );
}


// -- Push-config editor -----------------------------------

const PUSH_DEFAULT_LABEL = "Kaisho (auto)";

/** Per-account "push clock entries to a calendar" toggle
 *  + calendar picker. Lives inside each account row in
 *  the CalDAV card so the user always sees the push
 *  state next to its account context.
 */
function PushConfigEditor({
  accountId,
}: {
  accountId: string;
}) {
  const { t } = useTranslation("settings");
  const cfgQ = useCalDavPushConfig(accountId);
  const cals = useCalDavCalendars(accountId);
  const setCfg = useSetCalDavPushConfig(accountId);
  const healthQ = useCalDavPushHealth(
    cfgQ.data?.enabled ? accountId : null,
  );
  const syncNow = usePushSyncCalDavAccount(accountId);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const enabled = !!cfgQ.data?.enabled;
  const selected = cfgQ.data?.calendar_id ?? "";

  async function toggle() {
    setErr(null);
    setToast(null);
    try {
      await setCfg.mutateAsync({
        enabled: !enabled,
        calendar_id: selected,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function pickCalendar(calendarId: string) {
    setErr(null);
    setToast(null);
    try {
      await setCfg.mutateAsync({
        enabled, calendar_id: calendarId,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSyncNow() {
    setErr(null);
    setToast(null);
    try {
      const out = await syncNow.mutateAsync();
      const s = out.summary;
      const written = s.created + s.updated + s.deleted;
      setToast(
        s.errors > 0
          ? t("integrations.caldav.push.syncErrors", {
              count: s.errors,
            })
          : t("integrations.caldav.push.syncOk", {
              count: written,
            }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = setCfg.isPending || cfgQ.isLoading;

  return (
    <div className="border-t border-border pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-fg-strong">
            {t("integrations.caldav.push.label")}
          </p>
          <p className="text-2xs text-fg-muted">
            {t("integrations.caldav.push.hint")}
          </p>
        </div>
        <Toggle
          checked={enabled}
          onChange={() => toggle()}
          disabled={busy}
        />
      </div>
      {enabled && (
        <div className="mt-2">
          <label className="text-2xs uppercase tracking-wide text-fg-muted block mb-1">
            {t("integrations.caldav.push.calendar")}
          </label>
          <select
            value={selected}
            onChange={(e) => pickCalendar(e.target.value)}
            disabled={busy || cals.isLoading}
            className={inputCls}
          >
            <option value="">{PUSH_DEFAULT_LABEL}</option>
            {(cals.data?.calendars ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <PushHealthBar
            health={healthQ.data ?? null}
            onSync={handleSyncNow}
            busy={syncNow.isPending}
          />
        </div>
      )}
      {toast && (
        <p className="text-xs text-emerald-600 mt-1">
          {toast}
        </p>
      )}
      {err && (
        <p className="text-xs text-red-500 mt-1">{err}</p>
      )}
    </div>
  );
}


function PushHealthBar({
  health, onSync, busy,
}: {
  health: import("../../api/client").CalDavPushHealth | null;
  onSync: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation("settings");
  const lastSync = health?.last_success_at;
  const degraded = !!health?.degraded;
  const lastError = health?.last_error;

  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <div className="min-w-0 text-2xs text-fg-muted">
        {lastSync ? (
          <span>
            {t("integrations.caldav.push.lastSynced", {
              when: relativeAgo(lastSync, t),
            })}
          </span>
        ) : (
          <span>
            {t("integrations.caldav.push.neverSynced")}
          </span>
        )}
        {degraded && (
          <span className="ml-2 text-red-500">
            {t(
              "integrations.caldav.push.degraded",
            )}
            {lastError && `: ${lastError}`}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onSync}
        disabled={busy}
        className={
          "shrink-0 px-2 py-0.5 rounded-md text-xs "
          + "font-medium bg-surface-card border "
          + "border-border text-fg "
          + "hover:bg-surface-raised "
          + "disabled:opacity-50"
        }
      >
        {busy
          ? t("integrations.caldav.push.syncing")
          : t("integrations.caldav.push.syncNow")}
      </button>
    </div>
  );
}


function relativeAgo(
  iso: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.round(
    (Date.now() - then) / 1000,
  ));
  if (sec < 60) {
    return t("integrations.caldav.push.justNow");
  }
  if (sec < 3600) {
    return t("integrations.caldav.push.minutesAgo", {
      count: Math.round(sec / 60),
    });
  }
  if (sec < 86400) {
    return t("integrations.caldav.push.hoursAgo", {
      count: Math.round(sec / 3600),
    });
  }
  return t("integrations.caldav.push.daysAgo", {
    count: Math.round(sec / 86400),
  });
}
