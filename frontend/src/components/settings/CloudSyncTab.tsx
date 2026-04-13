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

  function handleDisconnect() {
    disconnectCloudSync().then(() => {
      setMsg("Disconnected");
      void qc.invalidateQueries({
        queryKey: ["settings", "cloud_sync"],
      });
      setTimeout(() => setMsg(""), 3000);
    });
  }

  function handleSyncNow() {
    setSyncing(true);
    setErr("");
    syncNow()
      .then((res) => {
        const parts = [];
        if (res.pulled > 0) {
          parts.push(
            `${res.pulled} entries pulled`,
          );
        }
        if (res.pushed) parts.push("snapshot pushed");
        if (res.error) parts.push(res.error);
        setMsg(
          parts.length
            ? parts.join(", ")
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
            {(status?.pending ?? 0) > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                {status?.pending} unassigned entries
                need triage
              </p>
            )}
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
              className="px-4 py-1.5 rounded text-sm text-stone-600 hover:text-red-600 border border-border hover:border-red-300 transition-colors"
            >
              Disconnect
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
                  placeholder="https://cloud.kaisho.app"
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
