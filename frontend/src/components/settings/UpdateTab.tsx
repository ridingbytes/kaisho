import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCw,
  Download,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { useVersionInfo } from "../../hooks/useSettings";
import { openWhatsNew } from "../common/WhatsNewDialog";
import { isTauri } from "../../utils/tauri";
import { parseChangelog } from "../../utils/changelog";
import { saveBtnCls } from "./styles";

export function UpdateSection(): JSX.Element {
  const { t } = useTranslation("settings");
  const { data, isLoading } = useVersionInfo();
  const inTauri = isTauri();

  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<
    string | null
  >(null);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<
    string | null
  >(null);

  const entries = data
    ? parseChangelog(data.changelog)
    : [];
  const currentVersion = data?.version ?? "...";

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
          t("versionAvailable", {
            version: update.version,
          }),
        );
      } else {
        setCheckResult(t("latestVersion"));
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
            {t("version")}
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
              {t("whatsNew")}
            </button>
          </div>
        </div>

        {/* Changelog preview */}
        {entries.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
              {t("latestChanges")}
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
                  {t("more", {
                    count:
                      entries[0].items.length - 5,
                  })}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Update controls (Tauri only) */}
      {inTauri && (
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden mb-4">
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
                ? t("checking")
                : t("checkForUpdates")}
            </button>
            {checkResult?.includes("available") && (
              <button
                onClick={handleInstallUpdate}
                disabled={updating}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Download size={13} />
                {updating
                  ? t("updating")
                  : t("installUpdate")}
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
              {t("browserModeHint")}
            </p>
            <a
              href="https://github.com/ridingbytes/kaisho/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-cta hover:underline"
            >
              <ExternalLink size={12} />
              {t("viewLatestRelease")}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
