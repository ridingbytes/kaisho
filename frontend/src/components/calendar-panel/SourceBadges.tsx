import { useTranslation } from "react-i18next";
import type {
  CalendarSource,
  CalendarSourceStatus,
} from "../../api/client";

interface Props {
  connected: CalendarSource[];
  statuses: CalendarSourceStatus[];
}

/** Thin strip under the toolbar showing which sources
 *  contributed events, their counts, and any errors so the
 *  panel never silently swallows a degraded source.
 */
export function SourceBadges({ connected, statuses }: Props) {
  const { t } = useTranslation("calendar");
  const byId = new Map(statuses.map((s) => [s.id, s]));
  const visible = connected.filter((c) => c.connected);
  if (visible.length === 0) {
    return (
      <div className="px-4 py-2 text-xs text-fg-muted bg-surface-card border-b border-border">
        {t("noSources")}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] bg-surface-card border-b border-border">
      {visible.map((src) => {
        const status = byId.get(src.id);
        const ok = !status || status.ok;
        return (
          <span
            key={src.id}
            className={
              "inline-flex items-center gap-1 "
              + (ok ? "text-fg-muted" : "text-red-600")
            }
            title={status?.error}
          >
            <span
              className={
                "w-1.5 h-1.5 rounded-full "
                + (ok ? "bg-emerald-500" : "bg-red-500")
              }
            />
            {src.label}
            {status && ` (${status.count})`}
          </span>
        );
      })}
    </div>
  );
}
