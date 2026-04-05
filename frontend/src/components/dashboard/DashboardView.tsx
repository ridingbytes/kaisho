import { CheckSquare, ChevronDown, ChevronRight, Clock, Inbox, Square, TrendingDown } from "lucide-react";
import { useState } from "react";
import { useActiveTimer, useStopTimer } from "../../hooks/useClocks";
import { useDashboard } from "../../hooks/useDashboard";
import { useTimeEntries } from "../../hooks/useCustomers";
import { useSetView } from "../../context/ViewContext";
import type { BudgetSummary } from "../../types";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";

function elapsed(startIso: string): string {
  const diffMs = Date.now() - new Date(startIso).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function budgetBarColor(usedPercent: number): string {
  if (usedPercent >= 100) return "#ef4444";
  if (usedPercent >= 80) return "#f59e0b";
  return "#10b981";
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={[
        "flex items-center gap-4 p-5 rounded-xl",
        "bg-surface-card border border-border-subtle",
        onClick
          ? "cursor-pointer hover:bg-surface-raised transition-colors"
          : "",
      ].join(" ")}
    >
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

function BudgetRow({
  b,
  onNameClick,
}: {
  b: BudgetSummary;
  onNameClick: () => void;
}) {
  const usedPercent = Math.min(100 - b.percent, 100);
  const color = budgetBarColor(usedPercent);
  const warning = usedPercent >= 80;
  const [open, setOpen] = useState(false);
  const { data: entries = [] } = useTimeEntries(open ? b.name : null);

  return (
    <div className="py-3 border-b border-border-subtle last:border-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-slate-600 hover:text-slate-400 transition-colors"
          >
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
          <button
            onClick={onNameClick}
            className="text-sm font-medium text-slate-300 hover:text-accent transition-colors text-left"
          >
            {b.name}
          </button>
        </div>
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
            {usedPercent}%
          </span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${usedPercent}%`,
            backgroundColor: color,
          }}
        />
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-0.5">
          {entries.length === 0 ? (
            <p className="text-[11px] text-slate-700">No entries</p>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="flex items-baseline justify-between text-[11px]"
              >
                <span className="text-slate-600 shrink-0 mr-2">{e.date}</span>
                <span className="text-slate-500 flex-1 min-w-0 truncate">
                  {e.description}
                </span>
                <span className="text-slate-500 tabular-nums shrink-0 ml-2">
                  {e.hours}h
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardView() {
  const { data } = useDashboard();
  const { data: timer } = useActiveTimer();
  const stopTimer = useStopTimer();
  const setView = useSetView();

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-slate-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
    <div className="flex items-center px-6 py-3 border-b border-border-subtle shrink-0">
      <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400 flex-1">
        Dashboard
      </h1>
      <HelpButton title="Dashboard" doc={DOCS.dashboard} view="dashboard" />
    </div>
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
            {timer.description && (
              <p className="text-xs text-slate-400 truncate">
                {timer.description}
              </p>
            )}
          </div>
          <span className="text-lg font-mono font-semibold text-slate-200 tabular-nums shrink-0">
            {elapsed(timer.start)}
          </span>
          <button
            onClick={() => stopTimer.mutate()}
            disabled={stopTimer.isPending}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            title="Stop timer"
          >
            <Square size={16} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Open tasks"
          value={data.open_task_count}
          icon={CheckSquare}
          accent="#6366f1"
          onClick={() => setView("board")}
        />
        <StatCard
          label="Inbox items"
          value={data.inbox_count}
          icon={Inbox}
          accent="#f59e0b"
          onClick={() => setView("inbox")}
        />
      </div>

      {/* Budget overview */}
      {data.budgets.length > 0 && (
        <div className="rounded-xl bg-surface-card border border-border-subtle p-5">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-4">
            Budget Status
          </h2>
          {data.budgets
            .filter((b) => b.kontingent > 0)
            .map((b) => (
              <BudgetRow
                key={b.name}
                b={b}
                onNameClick={() => setView("customers")}
              />
            ))}
        </div>
      )}
    </div>
    </div>
  );
}
