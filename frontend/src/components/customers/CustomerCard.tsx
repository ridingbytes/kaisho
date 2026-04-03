import { ExternalLink } from "lucide-react";
import type { Customer } from "../../types";

function utilColor(percent: number): string {
  if (percent >= 40) return "#10b981";
  if (percent >= 15) return "#f59e0b";
  return "#ef4444";
}

interface Props {
  customer: Customer;
}

export function CustomerCard({ customer: c }: Props) {
  const hasContingent = c.kontingent > 0;
  const usedPercent = hasContingent
    ? Math.min(
        Math.round(((c.kontingent - c.rest) / c.kontingent) * 100),
        100
      )
    : 0;
  const restPercent = hasContingent
    ? Math.min(Math.round((c.rest / c.kontingent) * 100), 100)
    : 0;
  const barColor = utilColor(restPercent);
  const isArchived = ["inactive", "archiv", "archived"].includes(
    c.status.toLowerCase()
  );

  return (
    <div
      className={[
        "flex flex-col gap-3 p-5 rounded-xl border transition-colors",
        "bg-surface-card hover:bg-surface-raised",
        isArchived
          ? "border-border-subtle opacity-60"
          : "border-border",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-200 truncate">
            {c.name}
          </h3>
          {c.repo && (
            <a
              href={c.repo}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-slate-600 hover:text-accent mt-0.5 transition-colors"
            >
              <ExternalLink size={10} />
              {c.repo.replace(/^https?:\/\//, "").slice(0, 30)}
            </a>
          )}
        </div>
        <span
          className={[
            "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
            isArchived
              ? "bg-slate-500/10 text-slate-600"
              : "bg-emerald-500/15 text-emerald-400",
          ].join(" ")}
        >
          {c.status}
        </span>
      </div>

      {/* Budget bar */}
      {hasContingent ? (
        <>
          <div>
            <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${usedPercent}%`,
                  backgroundColor: barColor,
                  opacity: 0.3,
                }}
              />
            </div>
            <div
              className="h-1.5 rounded-full bg-surface-overlay overflow-hidden -mt-1.5"
              title={`${restPercent}% remaining`}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${restPercent}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
          </div>

          {/* Hours detail */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">
              {c.verbraucht}h used · {c.rest}h left
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{ color: barColor }}
            >
              {restPercent}%
            </span>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-600">No budget configured</p>
      )}
    </div>
  );
}
