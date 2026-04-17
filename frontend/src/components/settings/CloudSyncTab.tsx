import { useState } from "react";
import { useCloudSyncStatus } from "../../hooks/useSettings";
import {
  connectCloudSync,
  disconnectCloudSync,
  syncNow,
} from "../../api/client";
import { useQueryClient } from "@tanstack/react-query";
import { inputCls, saveBtnCls } from "./styles";

export function CloudSyncSection(): JSX.Element {
  const { data: status, isLoading } =
    useCloudSyncStatus();
  const qc = useQueryClient();

  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function handleConnect() {
    if (!url.trim() || !apiKey.trim()) return;
    setConnecting(true);
    setErr("");
    connectCloudSync(url.trim(), apiKey.trim())
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

  const [disconnecting, setDisconnecting] = useState(false);

  function handleDisconnect() {
    if (!confirm(
      "Disconnect and wipe all synced entries from " +
      "the cloud? Your local data is kept.",
    )) return;
    setDisconnecting(true);
    setErr("");
    disconnectCloudSync()
      .then((res: Record<string, unknown>) => {
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
      <p className="text-xs text-stone-500 leading-relaxed mb-4">
        Connect to Kaisho Cloud to track time from your
        phone. Clock entries sync back to this local
        instance automatically.
      </p>

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
                  {status.plan}
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

          <div className="px-4 py-3 flex items-center gap-3">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className={saveBtnCls}
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-1.5 rounded text-sm text-stone-600 hover:text-red-600 border border-border hover:border-red-300 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {disconnecting
                ? "Flushing cloud data..."
                : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Connect
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3">
                <span className="text-xs text-stone-700 w-24 shrink-0">
                  Cloud URL
                </span>
                <input
                  type="text"
                  value={url}
                  onChange={(e) =>
                    setUrl(e.target.value)
                  }
                  placeholder="https://cloud.kaisho.dev"
                  className={inputCls}
                />
              </label>
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
                connecting ||
                !url.trim() ||
                !apiKey.trim()
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
