import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import {
  useAiUsage,
  useCloudSyncStatus,
} from "../../hooks/useSettings";
import {
  connectCloudSync,
  disconnectCloudSync,
  syncNow,
  toggleCloudAi,
} from "../../api/client";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { openExternal } from "../../utils/tauri";
import { inputCls, saveBtnCls } from "./styles";

export function CloudSyncSection(): JSX.Element {
  const { t } = useTranslation("settings");
  const { data: status, isLoading } =
    useCloudSyncStatus();
  const { data: aiUsage } = useAiUsage();
  const qc = useQueryClient();

  function planLabel(plan: string): string {
    const map: Record<string, string> = {
      free: t("planFree"),
      sync: t("planSync"),
      sync_ai: t("planSyncAi"),
    };
    return map[plan] || plan;
  }

  const DEFAULT_CLOUD_URL = "https://cloud.kaisho.dev";
  const isDev = window.location.hostname === "localhost";
  const [cloudUrl, setCloudUrl] = useState(
    DEFAULT_CLOUD_URL,
  );
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] =
    useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function handleConnect() {
    if (!apiKey.trim()) return;
    setConnecting(true);
    setErr("");
    connectCloudSync(cloudUrl.trim(), apiKey.trim())
      .then((res) => {
        setMsg(
          `Connected (plan: ${res.plan || "free"})`,
        );
        setApiKey("");
        void qc.invalidateQueries({
          queryKey: ["settings", "cloud_sync"],
        });
        setTimeout(() => setMsg(""), 3000);
      })
      .catch((e) => {
        const errorMsg =
          e?.message || "Connection failed";
        setErr(
          `${errorMsg} (URL: ${cloudUrl})`,
        );
      })
      .finally(() => setConnecting(false));
  }
  function handleDisconnect() {
    setDisconnecting(true);
    setErr("");
    disconnectCloudSync()
      .then((res) => {
        const wiped = res?.wiped || 0;
        const wipeErr = res?.wipe_error;
        if (wipeErr) {
          setMsg(`Disconnected (wipe failed: ${wipeErr})`);
        } else {
          setMsg(
            `Disconnected — ${wiped} cloud entries removed`,
          );
        }
        void qc.invalidateQueries({
          queryKey: ["settings", "cloud_sync"],
        });
        setTimeout(() => setMsg(""), 5000);
      })
      .catch((e: { message?: string }) => {
        setErr(e?.message || "Disconnect failed");
      })
      .finally(() => setDisconnecting(false));
  }

  function handleSyncNow() {
    setSyncing(true);
    setErr("");
    syncNow()
      .then((res) => {
        const parts: string[] = [];
        if (res.pulled_up > 0) {
          parts.push(`${res.pulled_up} pulled`);
        }
        if (res.pulled_del > 0) {
          parts.push(`${res.pulled_del} removed`);
        }
        if (res.pushed_live > 0) {
          parts.push(`${res.pushed_live} pushed`);
        }
        if (res.pushed_deletes > 0) {
          parts.push(
            `${res.pushed_deletes} tombstones`,
          );
        }
        if (res.snapshot_pushed) {
          parts.push("snapshot");
        }
        if (res.error) parts.push(res.error);
        setMsg(
          parts.length
            ? parts.join(" · ")
            : "Up to date",
        );
        void qc.invalidateQueries({
          queryKey: ["settings", "cloud_sync"],
        });
        for (const key of [
          "clocks", "inbox", "tasks", "notes",
        ]) {
          void qc.invalidateQueries({
            queryKey: [key],
          });
        }
        setTimeout(() => setMsg(""), 4000);
      })
      .catch((e) => {
        setErr(e?.message || "Sync failed");
      })
      .finally(() => setSyncing(false));
  }

  if (isLoading) {
    return (
      <p className="text-sm text-stone-500">
        Loading...
      </p>
    );
  }

  const connected = status?.connected;

  return (
    <section>
      {!connected && (
        <div className="mb-5 rounded-xl border border-cta/30 bg-cta/5 overflow-hidden">
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-stone-900 mb-1">
              {t("unlockCloudSync")}
            </p>
            <p className="text-xs text-stone-600 leading-relaxed mb-3">
              {t("unlockCloudSyncHint")}
            </p>
            <ul className="text-xs text-stone-600 space-y-1 mb-3">
              <li className="flex items-start gap-2">
                <span className="text-cta mt-0.5">
                  *
                </span>
                <span>{t("cloudSyncFeature")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cta mt-0.5">
                  *
                </span>
                <span>{t("mobileAppFeature")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cta mt-0.5">
                  *
                </span>
                <span>{t("kaishoAiFeature")}</span>
              </li>
            </ul>
            <button
              onClick={() =>
                openExternal(
                  "https://kaisho.dev/#pricing",
                )
              }
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-cta text-white hover:bg-cta-hover transition-colors"
            >
              {t("viewPlans")}
            </button>
          </div>
          <div className="px-4 py-2.5 bg-amber-500/10 border-t border-amber-500/20">
            <p className="text-[10px] text-amber-700">
              {t("spamFolderHint")}
            </p>
          </div>
        </div>
      )}

      {connected ? (
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
              {t("connection")}
            </p>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              <span className="text-xs text-green-400">
                {t("connected")}
              </span>
              {status?.plan && (
                <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-raised text-stone-600 border border-border-subtle">
                  {planLabel(status.plan)}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500">
              {status?.url}
            </p>
            {status?.email && (
              <p className="text-xs text-stone-500 mt-0.5">
                {status.email}
              </p>
            )}
            {(status?.pending_deletes ?? 0) > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                {t("tombstonesWaiting", {
                  count: status?.pending_deletes,
                })}
              </p>
            )}
            {status?.last_error && (
              <p className="text-xs text-red-400 mt-1">
                {t("lastError", {
                  error: status.last_error,
                })}
              </p>
            )}
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-stone-500">
              <dt>{t("lastPull")}</dt>
              <dd className="text-stone-700">
                {status?.last_pull_at
                  ? new Date(status.last_pull_at)
                      .toLocaleString()
                  : t("never")}
              </dd>
              <dt>{t("lastPush")}</dt>
              <dd className="text-stone-700">
                {status?.last_push_at
                  ? new Date(status.last_push_at)
                      .toLocaleString()
                  : t("never")}
              </dd>
              {status?.cloud_entry_count !==
                undefined && (
                <>
                  <dt>{t("cloudEntries")}</dt>
                  <dd className="text-stone-700 tabular-nums">
                    {status.cloud_entry_count}
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* Kaisho AI toggle — only available on
              sync_ai plan */}
          <div className="px-4 py-3 border-b border-border-subtle">
            <label className={[
              "flex items-center justify-between",
              status?.plan === "sync_ai"
                ? "cursor-pointer"
                : "cursor-not-allowed opacity-50",
            ].join(" ")}>
              <div>
                <p className="text-xs font-medium text-stone-700">
                  {t("useKaishoAi")}
                </p>
                <p className="text-[10px] text-stone-500 mt-0.5">
                  {status?.plan === "sync_ai"
                    ? t("useKaishoAiHint")
                    : t("planSyncAi") +
                      " plan required."}
                </p>
              </div>
              <button
                disabled={status?.plan !== "sync_ai"}
                onClick={() => {
                  if (status?.plan !== "sync_ai") return;
                  const next = !status?.use_cloud_ai;
                  toggleCloudAi(next)
                    .then(() => {
                      void qc.invalidateQueries({
                        queryKey: [
                          "settings",
                          "cloud_sync",
                        ],
                      });
                    })
                    .catch((e: { message?: string }) => {
                      setErr(
                        e?.message || "Toggle failed",
                      );
                    });
                }}
                className={[
                  "relative w-9 h-5 rounded-full",
                  "transition-colors shrink-0 ml-4",
                  status?.use_cloud_ai
                    ? "bg-cta"
                    : "bg-stone-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "absolute top-0.5 left-0.5",
                    "w-4 h-4 rounded-full bg-white",
                    "shadow transition-transform",
                    status?.use_cloud_ai
                      ? "translate-x-4"
                      : "",
                  ].join(" ")}
                />
              </button>
            </label>
          </div>

          {/* AI token usage meter */}
          {status?.use_cloud_ai && aiUsage && (
            <div className="px-4 py-3 border-b border-border-subtle">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
                {t("aiUsage")} ({aiUsage.month || "---"})
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-stone-200 overflow-hidden">
                  <div
                    className={[
                      "h-full rounded-full transition-all",
                      (aiUsage.total_tokens /
                        aiUsage.cap) > 0.9
                        ? "bg-red-400"
                        : (aiUsage.total_tokens /
                            aiUsage.cap) > 0.7
                          ? "bg-amber-400"
                          : "bg-cta",
                    ].join(" ")}
                    style={{
                      width: `${Math.min(
                        100,
                        (aiUsage.total_tokens /
                          aiUsage.cap) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] text-stone-600 tabular-nums whitespace-nowrap">
                  {(
                    aiUsage.total_tokens / 1000
                  ).toFixed(1)}K
                  {" / "}
                  {(aiUsage.cap / 1000).toFixed(0)}K
                </span>
              </div>
              <p className="text-[10px] text-stone-400 mt-1">
                {t("requestsThisMonth", {
                  count: aiUsage.request_count,
                })}
              </p>
            </div>
          )}

          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className={saveBtnCls}
            >
              {syncing ? t("syncing") : t("syncNow")}
            </button>
            <ConfirmPopover
              label={t("disconnectConfirm")}
              onConfirm={handleDisconnect}
              disabled={disconnecting}
            >
              <button
                disabled={disconnecting}
                className="px-4 py-1.5 rounded text-sm text-stone-600 hover:text-red-600 border border-border hover:border-red-300 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {disconnecting
                  ? t("disconnecting")
                  : t("disconnect")}
              </button>
            </ConfirmPopover>
          </div>
        </div>
      ) : (
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
              {t("connect")}
            </p>
            <p className="text-[10px] text-stone-400 mb-3">
              {t("apiKeyHint")}
            </p>
            <div className="flex flex-col gap-2">
              {isDev && (
                <label className="flex items-center gap-3">
                  <span className="text-xs text-stone-700 w-24 shrink-0">
                    URL
                  </span>
                  <input
                    type="text"
                    value={cloudUrl}
                    onChange={(e) =>
                      setCloudUrl(e.target.value)
                    }
                    placeholder={DEFAULT_CLOUD_URL}
                    className={inputCls}
                  />
                </label>
              )}
              <label className="flex items-center gap-3">
                <span className="text-xs text-stone-700 w-24 shrink-0">
                  {t("apiKey")}
                </span>
                <div className="flex-1 flex items-center gap-1">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) =>
                      setApiKey(e.target.value)
                    }
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowKey((v) => !v)
                    }
                    className="p-1 rounded text-stone-400 hover:text-stone-700 transition-colors shrink-0"
                    title={
                      showKey
                        ? t("hideKey")
                        : t("showKey")
                    }
                  >
                    {showKey ? (
                      <EyeOff size={14} />
                    ) : (
                      <Eye size={14} />
                    )}
                  </button>
                </div>
              </label>
            </div>
          </div>
          <div className="px-4 py-3">
            <button
              onClick={handleConnect}
              disabled={
                connecting || !apiKey.trim()
              }
              className={saveBtnCls}
            >
              {connecting
                ? t("connecting")
                : t("connect")}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className="mt-2 text-xs text-green-400">
          {msg}
        </p>
      )}
      {err && (
        <p className="mt-2 text-xs text-red-400">
          {err}
        </p>
      )}
      <p className="mt-2 text-[10px] text-stone-400">
        {t("cloudSyncOptionalHint")}
      </p>
    </section>
  );
}
