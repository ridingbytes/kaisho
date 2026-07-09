import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useKbSources } from "../../hooks/useSettings";
import { useValidateSchedule } from "../../hooks/useCron";

// Shared cron field building blocks, used by both the
// inline add-job form / job list (CronView) and the job
// edit modal (CronJobDialog). Kept in their own module so
// the dialog can reuse them without importing CronView
// (which would create an import cycle).

export const MODEL_DATALIST = "cron-model-list";

export const fieldCls =
  "px-2 py-1 rounded text-xs bg-surface-raised border border-border " +
  "text-fg-strong placeholder-fg-muted focus:outline-none " +
  "focus:border-border-strong font-mono";

export function OutputSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation("cron");
  const { data: sources = [] } = useKbSources();
  return (
    <select
      className={fieldCls}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="none">{t("outputNone")}</option>
      <option value="inbox">{t("outputInbox")}</option>
      {sources.map((s) => (
        <option key={s.label} value={s.label}>
          KB: {s.label}
        </option>
      ))}
    </select>
  );
}

/** Format an ISO fire time as a short local label. */
function fmtRun(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A cron schedule input with live, server-authoritative
 *  validation: an invalid expression (like hour 45) shows
 *  the error and marks the field red; a valid one previews
 *  its next fire times. ``onValidChange`` lets the parent
 *  block Save while the schedule is invalid -- pass a
 *  stable setter so the effect only fires on real changes.
 */
export function ScheduleField({
  value,
  onChange,
  onValidChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onValidChange?: (valid: boolean) => void;
}) {
  const { t } = useTranslation("cron");
  // Debounce so we don't validate on every keystroke.
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(id);
  }, [value]);

  const { data } = useValidateSchedule(debounced);
  const invalid = data ? !data.valid : false;

  useEffect(() => {
    // Unknown (still loading) counts as valid so we never
    // block Save on a schedule the user hasn't changed.
    onValidChange?.(data ? data.valid : true);
  }, [data, onValidChange]);

  return (
    <div className="flex flex-col gap-1">
      <input
        className={[
          fieldCls,
          "w-full",
          invalid ? "border-red-500" : "",
        ].join(" ")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0 9 * * 1-5"
      />
      {invalid && data?.error && (
        <span className="text-2xs text-red-400">{data.error}</span>
      )}
      {data?.valid && data.next_runs.length > 0 && (
        <span className="text-2xs text-fg-subtle">
          {t("nextRuns")}: {data.next_runs.map(fmtRun).join("  ·  ")}
        </span>
      )}
    </div>
  );
}
