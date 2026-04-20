/**
 * BackupSection: configure the backup directory, retention
 * and schedule; trigger ad-hoc backups and download
 * existing archives.
 */
import {
  Download, Play, RotateCcw, Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  backupDownloadUrl,
  restoreBackup,
  type BackupSettings,
} from "../../api/client";
import { ConfirmPopover } from "../common/ConfirmPopover";
import {
  useBackups,
  useBackupSettings,
  usePruneBackups,
  useRunBackup,
  useUpdateBackupSettings,
} from "../../hooks/useSettings";
import { inputCls, saveBtnCls } from "./styles";

function humanSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.replace("T", " ").slice(0, 19);
}

export function BackupSection(): JSX.Element {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { data: cfg, isLoading } = useBackupSettings();
  const { data: backups = [] } = useBackups();
  const update = useUpdateBackupSettings();
  const run = useRunBackup();
  const prune = usePruneBackups();

  const [draft, setDraft] = useState<
    Pick<BackupSettings, "directory" | "keep" | "interval_hours">
  >({
    directory: "",
    keep: 10,
    interval_hours: 24,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (cfg) {
      setDraft({
        directory: cfg.directory ?? "",
        keep: cfg.keep ?? 10,
        interval_hours: cfg.interval_hours ?? 24,
      });
    }
  }, [cfg]);

  function handleSave() {
    update.mutate(draft, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  }

  if (isLoading || !cfg) {
    return (
      <p className="text-sm text-stone-500">Loading...</p>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
            {t("storage")}
          </p>
          <label className="flex items-center gap-3">
            <span className="text-xs text-stone-700 w-32 shrink-0">
              {t("backupFolder")}
            </span>
            <input
              type="text"
              value={draft.directory}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d, directory: e.target.value,
                }))
              }
              placeholder={cfg.resolved_directory}
              className={inputCls}
            />
          </label>
          <p className="mt-2 text-[10px] text-stone-400">
            Leave empty to use the default:{" "}
            <span className="font-mono">
              {cfg.resolved_directory}
            </span>
          </p>
        </div>

        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
            {t("retention")}
          </p>
          <label className="flex items-center gap-3">
            <span className="text-xs text-stone-700 w-32 shrink-0">
              {t("keep")}
            </span>
            <input
              type="number"
              min={0}
              value={draft.keep}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  keep: Math.max(
                    0,
                    Number(e.target.value) || 0,
                  ),
                }))
              }
              className={`${inputCls} !w-32 !flex-none`}
            />
            <span className="text-xs text-stone-500">
              {t("mostRecentBackups")}
            </span>
          </label>
          <p className="mt-2 text-[10px] text-stone-400">
            {t("retentionHint")}
          </p>
        </div>

        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
            {t("schedule")}
          </p>
          <label className="flex items-center gap-3">
            <span className="text-xs text-stone-700 w-32 shrink-0">
              {t("interval")}
            </span>
            <input
              type="number"
              min={0}
              value={draft.interval_hours}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  interval_hours: Math.max(
                    0,
                    Number(e.target.value) || 0,
                  ),
                }))
              }
              className={`${inputCls} !w-32 !flex-none`}
            />
            <span className="text-xs text-stone-500">
              {t("hoursDisabled")}
            </span>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className={saveBtnCls}
        >
          {update.isPending ? tc("saving") : tc("save")}
        </button>
        {saved && (
          <span className="text-xs text-green-400">
            {tc("saved")}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => run.mutate(true)}
          disabled={run.isPending}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5",
            "rounded text-sm bg-cta-muted text-cta",
            "hover:bg-cta hover:text-white",
            "transition-colors disabled:opacity-50",
          ].join(" ")}
        >
          <Play size={12} />
          {run.isPending ? tc("running") : t("backUpNow")}
        </button>
        <button
          onClick={() => prune.mutate(undefined)}
          disabled={prune.isPending}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5",
            "rounded text-sm text-stone-600",
            "hover:text-red-400 transition-colors",
            "disabled:opacity-50",
          ].join(" ")}
        >
          <Trash2 size={12} />
          {t("pruneNow")}
        </button>
      </div>

      <p className="text-[10px] text-stone-400 leading-relaxed">
        {t("backupsHint")}
      </p>

      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            {t("existingBackups", {
              count: backups.length,
            })}
          </p>
        </div>
        {backups.length === 0 ? (
          <p className="px-4 py-4 text-xs text-stone-500">
            {t("noBackupsYet")}
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-stone-500">
                <th className="text-left px-4 py-2 font-medium">
                  {t("filename")}
                </th>
                <th className="text-left px-4 py-2 font-medium">
                  {t("created")}
                </th>
                <th className="text-right px-4 py-2 font-medium">
                  {t("size")}
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr
                  key={b.filename}
                  className="border-b border-border-subtle last:border-0"
                >
                  <td className="px-4 py-2 font-mono text-stone-700 truncate">
                    {b.filename}
                  </td>
                  <td className="px-4 py-2 text-stone-500">
                    {formatDate(b.created_at)}
                  </td>
                  <td className="px-4 py-2 text-right text-stone-500 tabular-nums">
                    {humanSize(b.size_bytes)}
                  </td>
                  <td className="px-4 py-2 text-right flex items-center justify-end gap-2">
                    <ConfirmPopover
                      label={t("restoreConfirm")}
                      onConfirm={() => {
                        restoreBackup(b.filename)
                          .then(() =>
                            window.location.reload(),
                          );
                      }}
                    >
                      <button
                        className="text-stone-500 hover:text-cta transition-colors"
                        title={t("restore")}
                      >
                        <RotateCcw size={12} />
                      </button>
                    </ConfirmPopover>
                    <a
                      href={backupDownloadUrl(b.filename)}
                      className="text-stone-600 hover:text-cta transition-colors"
                      title="Download"
                    >
                      <Download size={12} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
