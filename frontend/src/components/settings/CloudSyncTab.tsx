import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import {
  useAiUsage,
  useCloudSyncStatus,
} from "../../hooks/useSettings";
import {
  applyKaishoModels,
  connectCloudSync,
  disconnectCloudSync,
  syncNow,
} from "../../api/client";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { inputCls, saveBtnCls } from "./styles";

export function CloudSyncSection(): JSX.Element {
  const { t } = useTranslation("settings");
  const { data: status, isLoading } =
    useCloudSyncStatus();
  const { data: aiUsage } = useAiUsage();
  const qc = useQueryClient();

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
  const [applyingModels, setApplyingModels] =
    useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function handleConnect() {
    if (!apiKey.trim()) return;
    setConnecting(true);
    setErr("");
    connectCloudSync(cloudUrl.trim(), apiKey.trim())
      .then((res) => {
        const auto = res.auto_set_models ?? {};
        const autoSet = Object.keys(auto);
        const baseMsg = "Connected";
        if (autoSet.length > 0) {
          setMsg(
            `${baseMsg} — auto-configured ` +
            `${autoSet.join(", ")} → Kaisho AI`,
          );
        } else {
          setMsg(baseMsg);
        }
        setApiKey("");
        void qc.invalidateQueries({
          queryKey: ["settings", "cloud_sync"],
        });
        void qc.invalidateQueries({
          queryKey: ["settings", "ai"],
        });
        setTimeout(
          () => setMsg(""),
          autoSet.length > 0 ? 8000 : 3000,
        );
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

  function handleApplyKaishoModels() {
    setApplyingModels(true);
    setErr("");
    applyKaishoModels()
      .then((res) => {
        setMsg(
          t("applyKaishoModelsDone", {
            count: res.jobs_changed,
          }),
        );
        void qc.invalidateQueries({
          queryKey: ["settings", "ai"],
        });
        void qc.invalidateQueries({
          queryKey: ["cron", "jobs"],
        });
        setTimeout(() => setMsg(""), 5000);
      })
      .catch((e: { message?: string }) => {
        setErr(e?.message || "Failed");
      })
      .finally(() => setApplyingModels(false));
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
      <p className="text-sm text-fg-muted">
        Loading...
      </p>
    );
  }

  const connected = status?.connected;

  return (
    <section>
      {connected ? (
        <div className="bg-surface-card rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-muted mb-2">
              {t("connection")}
            </p>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              <span className="text-xs text-green-400">
                {t("connected")}
              </span>
            </div>
            <p className="text-xs text-fg-muted">
              {status?.url}
            </p>
            {status?.email && (
              <p className="text-xs text-fg-muted mt-0.5">
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
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-muted">
              <dt>{t("lastPull")}</dt>
              <dd className="text-fg">
                {status?.last_pull_at
                  ? new Date(status.last_pull_at)
                      .toLocaleString()
                  : t("never")}
              </dd>
              <dt>{t("lastPush")}</dt>
              <dd className="text-fg">
                {status?.last_push_at
                  ? new Date(status.last_push_at)
                      .toLocaleString()
                  : t("never")}
              </dd>
              {status?.cloud_entry_count !==
                undefined && (
                <>
                  <dt>{t("cloudEntries")}</dt>
                  <dd className="text-fg tabular-nums">
                    {status.cloud_entry_count}
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* Kaisho AI info — available on any connected server */}
          {connected && (
            <div className="px-4 py-3 border-b border-border-subtle">
              <p className="text-xs font-medium text-fg">
                {t("useKaishoAi")}
              </p>
              <p className="text-2xs text-fg-muted mt-1 leading-relaxed">
                {t("useKaishoAiHint")}
              </p>
              <button
                type="button"
                onClick={() => {
                  window.location.hash = "advisor";
                  setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent(
                        "advisor-run-slash",
                        { detail: "/onboard" },
                      ),
                    );
                  }, 100);
                }}
                className={[
                  "mt-2 text-2xs text-cta hover:underline",
                ].join(" ")}
              >
                {t("runOnboard")}
              </button>
            </div>
          )}

          {/* AI token usage meter */}
          {connected && aiUsage && (
            <div className="px-4 py-3 border-b border-border-subtle">
              <p className="text-2xs font-semibold uppercase tracking-wider text-fg-muted mb-2">
                {t("aiUsage")} ({aiUsage.month || "---"})
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-surface-overlay overflow-hidden">
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
                <span className="text-2xs text-fg-muted tabular-nums whitespace-nowrap">
                  {(
                    aiUsage.total_tokens / 1000
                  ).toFixed(1)}K
                  {" / "}
                  {(aiUsage.cap / 1000).toFixed(0)}K
                </span>
              </div>
              <p className="text-2xs text-fg-subtle mt-1">
                {t("requestsThisMonth", {
                  count: aiUsage.request_count,
                })}
              </p>
            </div>
          )}

          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-muted mb-1">
              {t("applyKaishoModelsTitle")}
            </p>
            <p className="text-2xs text-fg-subtle mb-2">
              {t("applyKaishoModelsHint")}
            </p>
            <ConfirmPopover
              label={t("applyKaishoModelsConfirm")}
              onConfirm={handleApplyKaishoModels}
              disabled={applyingModels}
            >
              <button
                disabled={applyingModels}
                className="px-3 py-1.5 rounded text-xs font-medium border border-border hover:border-cta hover:text-cta transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {applyingModels
                  ? t("applyingKaishoModels")
                  : t("applyKaishoModels")}
              </button>
            </ConfirmPopover>
          </div>

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
                className="px-4 py-1.5 rounded text-sm text-fg-muted hover:text-red-600 border border-border hover:border-red-300 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {disconnecting
                  ? t("disconnecting")
                  : t("disconnect")}
              </button>
            </ConfirmPopover>
          </div>
        </div>
      ) : (
        <div className="bg-surface-card rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-muted mb-1">
              {t("connect")}
            </p>
            <p className="text-2xs text-fg-subtle mb-3">
              {t("apiKeyHint")}
            </p>
            <div className="flex flex-col gap-2">
              {isDev && (
                <label className="flex items-center gap-3">
                  <span className="text-xs text-fg w-24 shrink-0">
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
                <span className="text-xs text-fg w-24 shrink-0">
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
                    className="p-1 rounded text-fg-subtle hover:text-fg transition-colors shrink-0"
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
      <p className="mt-2 text-2xs text-fg-subtle">
        {t("cloudSyncOptionalHint")}
      </p>
    </section>
  );
}
