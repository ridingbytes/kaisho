import { CheckSquare, Clock, Inbox, TrendingDown } from "lucide-react";
import { useActiveTimer } from "../../hooks/useClocks";
import { useDashboard } from "../../hooks/useDashboard";
import type { BudgetSummary } from "../../types";

function elapsed(startIso: string): string {
  const diffMs = Date.now() - new Date(startIso).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function budgetBarColor(percent: number): string {
  if (percent >= 40) return "#10b981";
  if (percent >= 15) return "#f59e0b";
  return "#ef4444";
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-4 p-5 rounded-xl bg-surface-card border border-border-subtle">
      <div
        className="flex items-center justify-center w-10 h-10 rounded-lg"
        style={{ backgroundColor: accent ? `${accent}20` : undefined }}
      >
        <Icon
          size={20}
          style={{ color: accent ?? "#64748b" }}
          strokeWidth={1.5}
        />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-100 tabular-nums">
          {value}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function BudgetRow({ b }: { b: BudgetSummary }) {
  const color = budgetBarColor(b.percent);
  const warning = b.percent < 15;

  return (
    <div className="py-3 border-b border-border-subtle last:border-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium text-slate-300">
          {b.name}
        </span>
        <div className="flex items-center gap-2">
          {warning && (
            <TrendingDown
              size={12}
              className="text-red-400"
              strokeWidth={2}
            />
          )}
          <span className="text-xs text-slate-500 tabular-nums">
            {b.rest}h / {b.kontingent}h
          </span>
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color }}
          >
            {b.percent}%
          </span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(b.percent, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

export function DashboardView() {
  const { data } = useDashboard();
  const { data: timer } = useActiveTimer();

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-slate-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Active timer banner */}
      {timer?.active && timer.start && (
        <div className="flex items-center gap-4 p-4 rounded-xl bg-accent-muted border border-accent/30">
          <Clock
            size={18}
            className="text-accent shrink-0"
            strokeWidth={1.5}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-200">
              {timer.customer}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {timer.description}
            </p>
          </div>
          <span className="text-lg font-mono font-semibold text-slate-200 tabular-nums shrink-0">
            {elapsed(timer.start)}
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Open tasks"
          value={data.open_task_count}
          icon={CheckSquare}
          accent="#6366f1"
        />
        <StatCard
          label="Inbox items"
          value={data.inbox_count}
          icon={Inbox}
          accent="#f59e0b"
        />
      </div>

      {/* Budget overview */}
      {data.budgets.length > 0 && (
        <div className="rounded-xl bg-surface-card border border-border-subtle p-5">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-4">
            Budget Status
          </h2>
          {data.budgets.map((b) => (
            <BudgetRow key={b.name} b={b} />
          ))}
        </div>
      )}
    </div>
  );
}
