import { useState } from "react";
import {
  RefreshCw,
  Download,
  Sparkles,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { useVersionInfo } from "../../hooks/useSettings";
import { openWhatsNew } from "../common/WhatsNewDialog";
import { isTauri } from "../../utils/tauri";
import {
  parseChangelog,
} from "../../utils/changelog";
import { saveBtnCls } from "./styles";

type Channel = "stable" | "develop";

const CHANNEL_KEY = "kaisho_update_channel";

function getChannel(): Channel {
  const stored = localStorage.getItem(CHANNEL_KEY);
  if (stored === "develop") return "develop";
  return "stable";
}

export function UpdateSection(): JSX.Element {
  const { data, isLoading } = useVersionInfo();
  const inTauri = isTauri();

  const [channel, setChannel] = useState<Channel>(
    getChannel,
  );
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<
    string | null
  >(null);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<
    string | null
  >(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingChannel, setPendingChannel] =
    useState<Channel | null>(null);

  const entries = data
    ? parseChangelog(data.changelog)
    : [];
  const currentVersion = data?.version ?? "...";

  function handleChannelChange(
    newChannel: Channel,
  ) {
    if (newChannel === channel) return;
    if (newChannel === "develop") {
      setPendingChannel(newChannel);
      setShowConfirm(true);
    } else {
      applyChannel(newChannel);
    }
  }

  function applyChannel(ch: Channel) {
    setChannel(ch);
    localStorage.setItem(CHANNEL_KEY, ch);
    setShowConfirm(false);
    setPendingChannel(null);
    setCheckResult(null);
  }

  async function handleCheckUpdate() {
    if (!inTauri) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const { check } = await import(
        "@tauri-apps/plugin-updater"
      );
      const update = await check();
      if (update) {
        setCheckResult(
          `Version ${update.version} available`,
        );
      } else {
        setCheckResult("You're on the latest version");
      }
    } catch (err) {
      setCheckResult(
        `Check failed: ${
          err instanceof Error
            ? err.message
            : String(err)
        }`,
      );
    } finally {
      setChecking(false);
    }
  }

  async function handleInstallUpdate() {
    if (!inTauri) return;
    setUpdating(true);
    setUpdateProgress("Checking for updates...");
    try {
      const { check } = await import(
        "@tauri-apps/plugin-updater"
      );
      const update = await check();
      if (!update) {
        setUpdateProgress("Already up to date");
        setUpdating(false);
        return;
      }
      setUpdateProgress(
        `Downloading v${update.version}...`,
      );

      let downloaded = 0;
      let total = 0;

      await update.downloadAndInstall(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (event: any) => {
          if (event.event === "Started") {
            total =
              event.data?.contentLength ?? 0;
            setUpdateProgress(
              "Starting download...",
            );
          } else if (event.event === "Progress") {
            downloaded +=
              event.data?.chunkLength ?? 0;
            if (total > 0) {
              const pct = Math.round(
                (downloaded / total) * 100,
              );
              setUpdateProgress(
                `Downloading... ${pct}%`,
              );
            }
          } else if (event.event === "Finished") {
            setUpdateProgress(
              "Installing... Restarting app.",
            );
          }
        },
      );

      const { relaunch } = await import(
        "@tauri-apps/plugin-process"
      );
      await relaunch();
    } catch (err) {
      setUpdateProgress(
        `Update failed: ${
          err instanceof Error
            ? err.message
            : String(err)
        }`,
      );
      setUpdating(false);
    }
  }

  if (isLoading) {
    return (
      <p className="text-sm text-stone-500">
        Loading...
      </p>
    );
  }

  return (
    <section>
      {/* Current version */}
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
            Version
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono font-semibold text-stone-800">
              v{currentVersion}
            </span>
            <button
              onClick={openWhatsNew}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-cta hover:bg-surface-raised border border-border-subtle transition-colors"
            >
              <Sparkles size={11} />
              What's New
            </button>
          </div>
        </div>

        {/* Changelog preview */}
        {entries.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Latest Changes
            </p>
            <ul className="space-y-1">
              {entries[0].items
                .slice(0, 5)
                .map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-stone-600 leading-relaxed"
                  >
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-stone-400 shrink-0" />
                    {item}
                  </li>
                ))}
              {entries[0].items.length > 5 && (
                <li className="text-xs text-stone-400 pl-3">
                  +{entries[0].items.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Update controls (Tauri only) */}
      {inTauri && (
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Update Channel
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  handleChannelChange("stable")
                }
                className={[
                  "px-3 py-1 rounded text-xs font-medium transition-colors",
                  channel === "stable"
                    ? "bg-cta text-white"
                    : "bg-surface-raised text-stone-600 hover:text-stone-800 border border-border",
                ].join(" ")}
              >
                Stable
              </button>
              <button
                onClick={() =>
                  handleChannelChange("develop")
                }
                className={[
                  "px-3 py-1 rounded text-xs font-medium transition-colors",
                  channel === "develop"
                    ? "bg-amber-500 text-white"
                    : "bg-surface-raised text-stone-600 hover:text-stone-800 border border-border",
                ].join(" ")}
              >
                Develop
              </button>
            </div>
            {channel === "develop" && (
              <p className="mt-2 flex items-center gap-1 text-[10px] text-amber-600">
                <AlertTriangle size={10} />
                Development builds may contain
                untested features
              </p>
            )}
          </div>

          <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleCheckUpdate}
              disabled={checking || updating}
              className={[
                "flex items-center gap-1.5",
                saveBtnCls,
              ].join(" ")}
            >
              <RefreshCw
                size={13}
                className={
                  checking ? "animate-spin" : ""
                }
              />
              {checking
                ? "Checking..."
                : "Check for Updates"}
            </button>
            {checkResult?.includes("available") && (
              <button
                onClick={handleInstallUpdate}
                disabled={updating}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Download size={13} />
                {updating
                  ? "Updating..."
                  : "Install Update"}
              </button>
            )}
          </div>

          {checkResult && (
            <div className="px-4 pb-3">
              <p
                className={[
                  "text-xs",
                  checkResult.includes("failed")
                    ? "text-red-400"
                    : checkResult.includes(
                          "available",
                        )
                      ? "text-green-500"
                      : "text-stone-500",
                ].join(" ")}
              >
                {checkResult}
              </p>
            </div>
          )}

          {updateProgress && (
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw
                  size={12}
                  className="animate-spin text-cta"
                />
                <p className="text-xs text-cta font-medium">
                  {updateProgress}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Non-Tauri: link to GitHub */}
      {!inTauri && (
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden mb-4">
          <div className="px-4 py-3">
            <p className="text-xs text-stone-500 mb-2">
              Running in browser mode. Download the
              desktop app for automatic updates.
            </p>
            <a
              href="https://github.com/ridingbytes/kaisho/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-cta hover:underline"
            >
              <ExternalLink size={12} />
              View latest release on GitHub
            </a>
          </div>
        </div>
      )}

      {/* Channel switch confirmation */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
          onClick={() => {
            setShowConfirm(false);
            setPendingChannel(null);
          }}
        >
          <div
            className="bg-surface-card rounded-xl border border-border shadow-2xl w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border-subtle">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle
                  size={16}
                  className="text-amber-500"
                />
                <h3 className="text-sm font-semibold text-stone-800">
                  Switch to Develop Channel?
                </h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Development builds include
                unreleased features that may be
                unstable or incomplete. You can
                switch back to stable at any time.
              </p>
            </div>
            <div className="px-5 py-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setPendingChannel(null);
                }}
                className="px-3 py-1.5 rounded text-xs text-stone-600 hover:text-stone-800 border border-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (pendingChannel) {
                    applyChannel(pendingChannel);
                  }
                }}
                className="px-3 py-1.5 rounded text-xs bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                Switch to Develop
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
