/**
 * BudgetBar displays a horizontal progress bar for budget
 * consumption with color-coded thresholds.
 */

export interface BudgetBarProps {
  /** Optional label displayed above the bar. */
  label?: string;
  /** Hours already consumed. */
  used: number;
  /** Total budget in hours. */
  budget: number;
  /** Remaining hours. */
  rest: number;
  /** Whether the contract is closed. */
  closed?: boolean;
}

/**
 * Returns a color hex string based on the percentage of
 * budget consumption.
 */
export function contractBarColor(pct: number): string {
  if (pct >= 100) return "#dc2626";
  if (pct >= 80) return "#d97706";
  return "#16a34a";
}

/** Horizontal budget consumption bar with label. */
export function BudgetBar({
  label,
  used,
  budget,
  rest,
  closed,
}: BudgetBarProps) {
  const pct =
    budget > 0
      ? Math.min(Math.round((used / budget) * 100), 100)
      : 0;
  const color = contractBarColor(pct);
  return (
    <div>
      <div className="h-4 flex items-end pb-1">
        {label !== undefined && (
          <span
            className={[
              "text-[10px] leading-none",
              closed
                ? "text-stone-400"
                : "text-stone-600",
            ].join(" ")}
          >
            {label}
            {closed && (
              <span className="ml-1 text-stone-400">
                (closed)
              </span>
            )}
          </span>
        )}
      </div>
      <div
        className={
          "h-1.5 rounded-full bg-surface-overlay "
          + "overflow-hidden"
        }
      >
        <div
          className={
            "h-full rounded-full transition-all"
          }
          style={{
            width: `${pct}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <div
        className={
          "flex items-center justify-between mt-0.5"
        }
      >
        <span className="text-[10px] text-stone-600">
          {used.toFixed(1)}h used
          {" · "}
          {rest.toFixed(1)}h left
        </span>
        <span
          className={
            "text-[10px] font-semibold tabular-nums"
          }
          style={{ color }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}
