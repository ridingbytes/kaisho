import { useState } from "react";
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

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  sync: "Cloud Sync",
  sync_ai: "Sync + AI",
};

function planLabel(plan: string): string {
  return PLAN_LABELS[plan] || plan;
}

export function CloudSyncSection(): JSX.Element {
  const { data: status, isLoading } =
    useCloudSyncStatus();
  const { data: aiUsage } = useAiUsage();
  const qc = useQueryClient();

  const CLOUD_URL = "https://cloud.kaisho.dev";
  const [apiKey, setApiKey] = useState("");
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
    connectCloudSync(CLOUD_URL, apiKey.trim())
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
        setErr(
          e?.message || "Connection failed",
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
        void qc.invalidateQueries({
          queryKey: ["clocks"],
        });
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
              Unlock Cloud Sync, Mobile App
              &amp; AI
            </p>
            <p className="text-xs text-stone-600 leading-relaxed mb-3">
              Connect your Kaisho instance to the cloud
              to sync time entries with the{" "}
              <button
                onClick={() =>
                  openExternal(
                    "https://cloud.kaisho.dev/m",
                  )
                }
                className="text-cta hover:underline"
              >
                mobile app
              </button>
              , enable the AI advisor and cron jobs
              without a local model, and access your
              data from anywhere.
            </p>
            <ul className="text-xs text-stone-600 space-y-1 mb-3">
              <li className="flex items-start gap-2">
                <span className="text-cta mt-0.5">
                  *
                </span>
                <span>
                  <strong>Cloud Sync</strong> — real-time
                  bidirectional sync of clock entries
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cta mt-0.5">
                  *
                </span>
                <span>
                  <strong>Mobile App</strong> — start
                  and stop timers from your phone
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cta mt-0.5">
                  *
                </span>
                <span>
                  <strong>Kaisho AI</strong> — AI
                  advisor and automated cron jobs
                  without local GPU
                </span>
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
              View plans &amp; pricing
            </button>
          </div>
          <div className="px-4 py-2.5 bg-amber-500/10 border-t border-amber-500/20">
            <p className="text-[10px] text-amber-700">
              After signing up, check your spam folder
              for the confirmation email. Some providers
              may flag it initially.
            </p>
          </div>
        </div>
      )}

      {connected ? (
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Connection
            </p>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              <span className="text-xs text-green-400">
                Connected
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
            {(status?.pending_deletes ?? 0) > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                {status?.pending_deletes} tombstones
                waiting to push
              </p>
            )}
            {status?.last_error && (
              <p className="text-xs text-red-400 mt-1">
                Last error: {status.last_error}
              </p>
            )}
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-stone-500">
              <dt>Last pull</dt>
              <dd className="text-stone-700">
                {status?.last_pull_at
                  ? new Date(status.last_pull_at)
                      .toLocaleString()
                  : "never"}
              </dd>
              <dt>Last push</dt>
              <dd className="text-stone-700">
                {status?.last_push_at
                  ? new Date(status.last_push_at)
                      .toLocaleString()
                  : "never"}
              </dd>
              {status?.cloud_entry_count !==
                undefined && (
                <>
                  <dt>Cloud entries</dt>
                  <dd className="text-stone-700 tabular-nums">
                    {status.cloud_entry_count}
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* Kaisho AI toggle */}
          <div className="px-4 py-3 border-b border-border-subtle">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-xs font-medium text-stone-700">
                  Use Kaisho AI
                </p>
                <p className="text-[10px] text-stone-500 mt-0.5">
                  Route advisor and cron jobs through
                  OpenRouter instead of local models.
                  Requires Sync + AI plan.
                </p>
              </div>
              <button
                onClick={() => {
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
                AI Usage ({aiUsage.month || "---"})
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
                {aiUsage.request_count} request
                {aiUsage.request_count !== 1
                  ? "s"
                  : ""}{" "}
                this month
              </p>
            </div>
          )}

          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className={saveBtnCls}
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
            <ConfirmPopover
              label="Wipe cloud data and disconnect?"
              onConfirm={handleDisconnect}
              disabled={disconnecting}
            >
              <button
                disabled={disconnecting}
                className="px-4 py-1.5 rounded text-sm text-stone-600 hover:text-red-600 border border-border hover:border-red-300 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {disconnecting
                  ? "Flushing cloud data..."
                  : "Disconnect"}
              </button>
            </ConfirmPopover>
          </div>
        </div>
      ) : (
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
              Connect
            </p>
            <p className="text-[10px] text-stone-400 mb-3">
              Enter the API key from your
              confirmation email.
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3">
                <span className="text-xs text-stone-700 w-24 shrink-0">
                  API Key
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) =>
                    setApiKey(e.target.value)
                  }
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx"
                  className={inputCls}
                />
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
                ? "Connecting..."
                : "Connect"}
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
        Cloud sync is optional. The app works fully
        standalone without a cloud connection.
      </p>
    </section>
  );
}
