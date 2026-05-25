import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listIntegrations,
  connectIntegrationKey,
  getIntegrationConnectUrl,
  disconnectIntegration,
  type ConnectedIntegration,
} from "../../api/client";
import { useCloudSyncStatus } from "../../hooks/useSettings";
import { openExternal } from "../../utils/tauri";

type ProviderType = "key" | "oauth";

interface Provider {
  kind: string;
  label: string;
  type: ProviderType;
  hintKey?: string;
}

// Premium integrations. Linear/GitHub connect with a
// pasted token; Slack/Google via OAuth in the browser.
const PROVIDERS: Provider[] = [
  { kind: "linear", label: "Linear", type: "key",
    hintKey: "integrations.hint.linear" },
  { kind: "github", label: "GitHub Projects", type: "key",
    hintKey: "integrations.hint.github" },
  { kind: "slack", label: "Slack", type: "oauth" },
  { kind: "google", label: "Google Calendar",
    type: "oauth" },
];

const btn =
  "px-3 py-1 rounded-lg text-xs font-medium "
  + "transition-colors disabled:opacity-50";

export function IntegrationsSection() {
  const { t } = useTranslation("settings");
  const { data: cloudStatus } = useCloudSyncStatus();
  const plan = cloudStatus?.plan;
  const isPro = plan === "pro" || plan === "team";

  const [connected, setConnected] = useState<
    ConnectedIntegration[]
  >([]);
  const [keys, setKeys] = useState<Record<string, string>>(
    {}
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function refresh() {
    listIntegrations()
      .then(setConnected)
      .catch(() => {});
  }

  useEffect(() => {
    if (isPro) refresh();
  }, [isPro]);

  const isConnected = (kind: string) =>
    connected.some((c) => c.kind === kind);

  function fail(e: unknown) {
    setErr(e instanceof Error ? e.message : String(e));
  }

  async function handleConnectKey(kind: string) {
    setBusy(kind);
    setErr(null);
    try {
      await connectIntegrationKey(kind, keys[kind] || "");
      setKeys((k) => ({ ...k, [kind]: "" }));
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function handleConnectOAuth(kind: string) {
    setBusy(kind);
    setErr(null);
    try {
      const { url } = await getIntegrationConnectUrl(kind);
      if (url) await openExternal(url);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect(kind: string) {
    setBusy(kind);
    setErr(null);
    try {
      await disconnectIntegration(kind);
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  if (!isPro) {
    return (
      <div className="bg-surface-card rounded-xl border border-border p-4">
        <p className="text-sm text-stone-600">
          {t("integrations.proOnly")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-500">
          {t("integrations.hint")}
        </p>
        <button
          type="button"
          onClick={refresh}
          className={`${btn} text-stone-500 hover:text-stone-700`}
        >
          {t("integrations.refresh")}
        </button>
      </div>
      {err && (
        <p className="text-xs text-red-500">{err}</p>
      )}
      {PROVIDERS.map((p) => {
        const conn = isConnected(p.kind);
        const isBusy = busy === p.kind;
        return (
          <div
            key={p.kind}
            className="bg-surface-card rounded-xl border border-border p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-stone-900">
                  {p.label}
                </p>
                {conn ? (
                  <p className="text-xs text-green-600 mt-0.5">
                    {t("integrations.connected")}
                  </p>
                ) : (
                  p.hintKey && (
                    <p className="text-[10px] text-stone-500 mt-0.5">
                      {t(p.hintKey)}
                    </p>
                  )
                )}
              </div>
              {conn ? (
                <button
                  type="button"
                  onClick={() => handleDisconnect(p.kind)}
                  disabled={isBusy}
                  className={`${btn} bg-surface-raised border border-border text-stone-700 hover:bg-surface-card`}
                >
                  {t("integrations.disconnect")}
                </button>
              ) : (
                p.type === "oauth" && (
                  <button
                    type="button"
                    onClick={() =>
                      handleConnectOAuth(p.kind)
                    }
                    disabled={isBusy}
                    className={`${btn} bg-cta text-white hover:bg-cta-hover`}
                  >
                    {t("integrations.connect")}
                  </button>
                )
              )}
            </div>
            {!conn && p.type === "key" && (
              <div className="flex gap-2 mt-2">
                <input
                  type="password"
                  value={keys[p.kind] || ""}
                  onChange={(e) =>
                    setKeys((k) => ({
                      ...k, [p.kind]: e.target.value,
                    }))
                  }
                  placeholder={t(
                    "integrations.apiKeyPlaceholder"
                  )}
                  className="flex-1 px-2 py-1 rounded-lg text-xs bg-surface-raised border border-border text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta"
                />
                <button
                  type="button"
                  onClick={() => handleConnectKey(p.kind)}
                  disabled={
                    isBusy || !(keys[p.kind] || "").trim()
                  }
                  className={`${btn} bg-cta text-white hover:bg-cta-hover`}
                >
                  {t("integrations.connect")}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[10px] text-stone-400">
        {t("integrations.oauthNote")}
      </p>
    </div>
  );
}
