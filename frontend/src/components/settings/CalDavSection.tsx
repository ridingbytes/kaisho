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
  useCalDavPresets,
  useRemoveCalDavAccount,
  useTestCalDavConnection,
} from "../../hooks/useCalDav";
import { openExternal } from "../../utils/tauri";

const btn =
  "px-3 py-1 rounded-lg text-xs font-medium "
  + "transition-colors disabled:opacity-50";

const inputCls =
  "flex-1 px-2 py-1 rounded-lg text-xs bg-surface-raised "
  + "border border-border text-stone-900 "
  + "placeholder-stone-500 focus:outline-none "
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
    <div className="bg-surface-card rounded-xl border border-border p-4 flex flex-col gap-3">
      <CalDavHeader count={accounts.length} />
      {accounts.length > 0 && (
        <AccountList accounts={accounts} />
      )}
      <AddAccountForm presets={presets} />
      <p className="text-[10px] text-stone-400">
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
        <p className="font-semibold text-sm text-stone-900">
          {t("integrations.caldav.label")}
        </p>
        <p className="text-[10px] text-stone-500 mt-0.5">
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
          className="flex items-center justify-between gap-3 bg-surface-raised rounded-lg border border-border p-2"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-stone-900 truncate">
              {acc.label}
            </p>
            <p className="text-[10px] text-stone-500 truncate">
              {acc.preset} · {acc.username}
            </p>
            {acc.storage === "fallback" && (
              <p className="text-[10px] text-amber-600 mt-0.5">
                {t("integrations.caldav.fallbackWarning")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => remove.mutate(acc.id)}
            disabled={remove.isPending}
            className={`${btn} bg-surface-card border border-border text-stone-700 hover:bg-surface-raised`}
          >
            {t("integrations.disconnect")}
          </button>
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
      <p className="text-xs font-medium text-stone-700 mb-2">
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
        <p className="text-[10px] text-stone-500 mt-2">
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
          className={`${btn} bg-surface-raised border border-border text-stone-700 hover:bg-surface-card`}
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
