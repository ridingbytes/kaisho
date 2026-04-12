import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Inbox,
  Pencil,
  Trash2,
  TrendingDown,
  X,
} from "lucide-react";
import { useState } from "react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import {
  useInvoicedContracts,
  isInvoiced,
} from "../../hooks/useInvoicedContracts";
import {
  useActiveTimer,
  useCustomerClockEntries,
  useDeleteClockEntry,
  useStopTimer,
  useUpdateClockEntry,
} from "../../hooks/useClocks";
import { useContracts } from "../../hooks/useContracts";
import { useDashboard } from "../../hooks/useDashboard";
import { useSetView } from "../../context/ViewContext";
import { navigateToClockDate } from "../../utils/clockNavigation";
import type { BudgetSummary, ClockEntry } from "../../types";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import { TimeInsights } from "./TimeInsights";
import {
  elapsed,
  formatDate,
  formatHours,
} from "../../utils/formatting";
import { smallInputCls } from "../../styles/formStyles";

function budgetBarColor(usedPercent: number): string {
  if (usedPercent >= 100) return "#dc2626";
  if (usedPercent >= 80) return "#d97706";
  return "#16a34a";
}

function contractUsedPct(budget: number, used: number): number {
  if (budget <= 0) return 0;
  return Math.min(Math.round((used / budget) * 100), 100);
}

function StatCard({
  label,
  value,
  icon: Icon,
  cta,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  cta?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={[
        "flex items-center gap-4 p-5 rounded-xl",
        "bg-surface-card border border-border-subtle",
        onClick
          ? "cursor-pointer hover:bg-surface-raised " +
            "transition-colors"
          : "",
      ].join(" ")}
    >
      <div
        className={
          "flex items-center justify-center " +
          "w-10 h-10 rounded-lg"
        }
        style={{
          backgroundColor: cta
            ? `${cta}20`
            : undefined,
        }}
      >
        <Icon
          size={20}
          style={{ color: cta ?? "#64748b" }}
          strokeWidth={1.5}
        />
      </div>
      <div>
        <p
          className={
            "text-2xl font-bold text-stone-900 tabular-nums"
          }
        >
          {value}
        </p>
        <p className="text-xs text-stone-600 mt-0.5">
          {label}
        </p>
      </div>
    </div>
  );
}

/* ---- Inline editable clock entry row ---- */

function ClockEntryRow({
  entry,
  customerName,
}: {
  entry: ClockEntry;
  customerName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [hours, setHours] = useState(
    ((entry.duration_minutes ?? 0) / 60).toFixed(2)
  );
  const [contract, setContract] = useState(
    entry.contract ?? ""
  );
  const updateEntry = useUpdateClockEntry();
  const deleteEntry = useDeleteClockEntry();
  const { data: contracts } = useContracts(
    editing ? customerName : null
  );
  const invoicedSet = useInvoicedContracts();
  const isInv = isInvoiced(
    invoicedSet, entry.customer, entry.contract,
  );

  const minutes = entry.duration_minutes ?? 0;

  function handleSave() {
    updateEntry.mutate(
      {
        startIso: entry.start,
        updates: {
          description: desc,
          hours: parseFloat(hours) || minutes / 60,
          contract,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function handleDelete() {
    deleteEntry.mutate(entry.start);
  }

  if (editing) {
    return (
      <div
        className={
          "flex items-center gap-2 py-1.5 " +
          "border-b border-border-subtle last:border-0"
        }
      >
        <span
          className={
            "text-xs text-stone-500 tabular-nums shrink-0 " +
            "w-10"
          }
        >
          {formatDate(entry.start)}
        </span>
        <input
          className={smallInputCls + " flex-1 min-w-0"}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description"
        />
        <input
          className={smallInputCls + " w-14 text-right"}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          type="number"
          step="0.25"
          min="0"
        />
        <select
          className={smallInputCls + " w-24"}
          value={contract}
          onChange={(e) => setContract(e.target.value)}
        >
          <option value="">--</option>
          {(contracts ?? []).map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={updateEntry.isPending}
          className={
            "p-0.5 rounded text-green-400 " +
            "hover:text-green-300 transition-colors"
          }
          title="Save"
        >
          <Check size={13} strokeWidth={2} />
        </button>
        <button
          onClick={() => setEditing(false)}
          className={
            "p-0.5 rounded text-stone-600 " +
            "hover:text-stone-900 transition-colors"
          }
          title="Cancel"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        "group flex items-center gap-2 py-1.5 " +
        "border-b border-border-subtle last:border-0"
      }
    >
      <span
        className={
          "text-xs text-stone-500 tabular-nums shrink-0 " +
          "w-10 cursor-pointer hover:text-cta"
        }
        onClick={() =>
          navigateToClockDate(entry.start.slice(0, 10))
        }
      >
        {formatDate(entry.start)}
      </span>
      <span
        className={
          "text-xs text-stone-700 truncate " +
          "min-w-0 flex-1"
        }
      >
        {entry.description || (
          <em className="text-stone-500">no description</em>
        )}
      </span>
      {entry.contract && (
        <span
          className={[
            "text-[10px] px-1.5 py-0.5 rounded shrink-0",
            isInv
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-cta/10 text-cta",
          ].join(" ")}
        >
          {entry.contract}
          {isInv && " ✓"}
        </span>
      )}
      <span
        className={
          "text-xs text-stone-600 tabular-nums shrink-0"
        }
      >
        {formatHours(minutes)}
      </span>
      <div
        className={
          "flex items-center gap-0.5 " +
          "opacity-0 group-hover:opacity-100 " +
          "transition-opacity shrink-0"
        }
      >
        <button
          onClick={() => setEditing(true)}
          className={
            "p-0.5 rounded text-stone-500 " +
            "hover:text-stone-900 transition-colors"
          }
          title="Edit"
        >
          <Pencil size={12} strokeWidth={2} />
        </button>
        <ConfirmPopover
          onConfirm={handleDelete}
          disabled={deleteEntry.isPending}
        >
          <button
            disabled={deleteEntry.isPending}
            className={
              "p-0.5 rounded text-stone-500 " +
              "hover:text-red-400 transition-colors"
            }
            title="Delete"
          >
            <Trash2 size={12} strokeWidth={2} />
          </button>
        </ConfirmPopover>
      </div>
    </div>
  );
}

/* ---- All clock entries for one customer ---- */

function CustomerClockEntries({
  customerName,
}: {
  customerName: string;
}) {
  const { data: entries, isLoading } =
    useCustomerClockEntries(customerName);

  if (isLoading) {
    return (
      <p className="text-xs text-stone-500 py-2 pl-1">
        Loading...
      </p>
    );
  }

  const completed = (entries ?? []).filter(
    (e) => e.duration_minutes !== null
  );

  if (completed.length === 0) {
    return (
      <p className="text-xs text-stone-500 py-2 pl-1">
        No clock entries
      </p>
    );
  }

  return (
    <div className="mt-2 pl-1">
      {completed.map((entry) => (
        <ClockEntryRow
          key={entry.start}
          entry={entry}
          customerName={customerName}
        />
      ))}
    </div>
  );
}

/* ---- Budget row with expand/collapse ---- */

function BudgetRow({
  b,
  onNameClick,
  expanded,
  onToggle,
  dotColor,
}: {
  b: BudgetSummary;
  onNameClick: () => void;
  expanded: boolean;
  onToggle: () => void;
  dotColor?: string;
}) {
  const hasContracts = b.contracts.length > 0;
  const displayBudget = hasContracts
    ? b.contracts.reduce((s, c) => s + c.budget, 0)
    : b.budget;
  const displayUsed = hasContracts
    ? b.contracts.reduce(
        (s, c) => s + (c.used ?? 0), 0,
      )
    : (b.budget ?? 0) - (b.rest ?? 0);
  const usedPercent = hasContracts
    ? contractUsedPct(displayBudget, displayUsed)
    : Math.min(100 - b.percent, 100);
  const color = budgetBarColor(usedPercent);
  const warning = usedPercent >= 80;
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={
        "py-3 border-b border-border-subtle last:border-0"
      }
    >
      <div
        className={
          "flex items-baseline justify-between mb-1.5"
        }
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggle}
            className={
              "p-0.5 rounded text-stone-600 " +
              "hover:text-stone-900 transition-colors"
            }
            aria-label={
              expanded ? "Collapse" : "Expand"
            }
          >
            <ChevronIcon size={14} strokeWidth={2} />
          </button>
          <button
            onClick={onNameClick}
            className={
              "text-sm font-medium text-stone-800 " +
              "hover:text-cta transition-colors " +
              "text-left inline-flex items-center " +
              "gap-1.5"
            }
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background: dotColor || "#a1a1aa",
              }}
            />
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
          <span
            className={
              "text-xs text-stone-600 tabular-nums"
            }
          >
            {displayUsed.toFixed(1)}h / {displayBudget.toFixed(0)}h
          </span>
          <span
            className={
              "text-xs font-semibold tabular-nums"
            }
            style={{ color }}
          >
            {usedPercent}%
          </span>
        </div>
      </div>
      {b.contracts.length > 0 ? (
        <div className="flex flex-col gap-1.5 mt-1">
          {b.contracts.map((c) => {
            const pct = contractUsedPct(c.budget, c.used);
            const cColor = budgetBarColor(pct);
            return (
              <div key={c.name}>
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-[9px] text-stone-500 truncate">
                    {c.name}
                  </span>
                  <span
                    className="text-[9px] tabular-nums shrink-0 ml-2"
                    style={{ color: cColor }}
                  >
                    {(c.used ?? 0).toFixed(1)}h used · {(c.rest ?? 0).toFixed(1)}h left · {pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: cColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <div className="flex justify-end mb-0.5">
            <span
              className="text-[9px] tabular-nums"
              style={{ color }}
            >
              {displayUsed.toFixed(1)}h used · {(displayBudget - displayUsed).toFixed(1)}h left · {usedPercent}%
            </span>
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
        </div>
      )}
      {expanded && (
        <CustomerClockEntries customerName={b.name} />
      )}
    </div>
  );
}

/* ---- Main dashboard ---- */

export function DashboardView() {
  const { data } = useDashboard();
  const { data: timer } = useActiveTimer();
  const stopTimer = useStopTimer();
  const setView = useSetView();
  const customerColors = useCustomerColors();
  const [expandedCustomers, setExpandedCustomers] =
    useState<Set<string>>(new Set());

  function toggleCustomer(name: string) {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  if (!data) {
    return (
      <div
        className={
          "flex items-center justify-center h-full"
        }
      >
        <p className="text-sm text-stone-500">
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className={
          "flex items-center px-6 py-3 " +
          "border-b border-border-subtle shrink-0"
        }
      >
        <h1
          className={
            "text-xs font-semibold tracking-wider " +
            "uppercase text-stone-700 flex-1"
          }
        >
          Dashboard
        </h1>
        <HelpButton
          title="Dashboard"
          doc={DOCS.dashboard}
          view="dashboard"
        />
      </div>
      <div
        className={
          "flex-1 overflow-y-auto p-6 space-y-6"
        }
      >
        {/* Active timer banner */}
        {timer?.active && timer.start && (
          <div
            className={
              "flex items-center gap-4 p-4 rounded-xl " +
              "bg-cta-muted border border-cta/30"
            }
          >
            <Clock
              size={18}
              className="text-cta shrink-0"
              strokeWidth={1.5}
            />
            <div className="min-w-0 flex-1">
              <p
                className={
                  "text-sm font-semibold text-stone-900"
                }
              >
                {timer.customer}
              </p>
              {timer.description && (
                <p
                  className={
                    "text-xs text-stone-700 truncate"
                  }
                >
                  {timer.description}
                </p>
              )}
            </div>
            <span
              className={
                "text-lg font-mono font-semibold " +
                "text-stone-900 tabular-nums shrink-0"
              }
            >
              {elapsed(timer.start)}
            </span>
            <button
              onClick={() => stopTimer.mutate()}
              disabled={stopTimer.isPending}
              className={
                "p-1.5 rounded-lg " +
                "hover:bg-red-500/10 " +
                "transition-colors disabled:opacity-40"
              }
              title="Stop timer"
            >
              <span className="block w-3.5 h-3.5 rounded-sm bg-red-500" />
            </button>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Open tasks"
            value={data.open_task_count}
            icon={CheckSquare}
            cta="#18181b"
            onClick={() => setView("board")}
          />
          <StatCard
            label="Inbox items"
            value={data.inbox_count}
            icon={Inbox}
            cta="#d97706"
            onClick={() => setView("inbox")}
          />
        </div>

        {/* Budget overview with clock entries */}
        {data.budgets.length > 0 && (
          <div
            className={
              "rounded-xl bg-surface-card " +
              "border border-border-subtle p-5"
            }
          >
            <h2
              className={
                "text-xs font-semibold tracking-wider " +
                "uppercase text-stone-600 mb-4"
              }
            >
              Budget Status
            </h2>
            {data.budgets
              .filter((b) => b.budget > 0)
              .map((b) => (
                <BudgetRow
                  key={b.name}
                  b={b}
                  dotColor={
                    customerColors[b.name]
                  }
                  onNameClick={() =>
                    setView("customers", b.name)
                  }
                  expanded={expandedCustomers.has(
                    b.name
                  )}
                  onToggle={() =>
                    toggleCustomer(b.name)
                  }
                />
              ))}
          </div>
        )}

        {/* Time Insights */}
        <TimeInsights />
      </div>
    </div>
  );
}
