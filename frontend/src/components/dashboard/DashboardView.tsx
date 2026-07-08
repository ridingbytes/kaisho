import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  CloudOff,
  FolderKanban,
  Inbox,
  Pencil,
  Square,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { ContentPopup } from "../common/ContentPopup";
import { HoverActions } from "../common/HoverActions";
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
} from "../../hooks/useClocks";
import { useDashboard } from "../../hooks/useDashboard";
import { useSetView } from "../../context/ViewContext";
import { navigateToClockDate } from "../../utils/clockNavigation";
import type { BudgetSummary, ClockEntry } from "../../types";
import { HelpButton } from "../common/HelpButton";
import { PanelToolbar } from "../common/PanelToolbar";
import { DOCS } from "../../docs/panelDocs";
import { TimeInsights } from "./TimeInsights";
import { TimeEntryDialog } from "../projects/TimeEntryDialog";
import {
  elapsed,
  formatDate,
  formatHours,
} from "../../utils/formatting";

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
        "flex items-center gap-4 p-5 rounded-lg",
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
            "text-2xl font-bold text-fg-strong tabular-nums"
          }
        >
          {value}
        </p>
        <p className="text-xs text-fg-muted mt-0.5">
          {label}
        </p>
      </div>
    </div>
  );
}

/* ---- Inline editable clock entry row ---- */

function ClockEntryRow({
  entry,
}: {
  entry: ClockEntry;
}) {
  const { t: tc } = useTranslation("common");
  const [editing, setEditing] = useState(false);
  const deleteEntry = useDeleteClockEntry();
  const invoicedSet = useInvoicedContracts();
  const isInv = isInvoiced(
    invoicedSet, entry.customer, entry.contract,
  );

  const minutes = entry.duration_minutes ?? 0;

  function handleDelete() {
    deleteEntry.mutate(entry);
  }

  return (
    <>
    {editing && (
      <TimeEntryDialog
        entry={entry}
        onClose={() => setEditing(false)}
      />
    )}
    <div
      className={
        "group flex items-center gap-2 py-1.5 " +
        "border-b border-border-subtle last:border-0"
      }
    >
      <span
        className={
          "text-xs text-fg-muted tabular-nums shrink-0 " +
          "w-16 cursor-pointer hover:text-cta"
        }
        onClick={() =>
          navigateToClockDate(entry.start.slice(0, 10))
        }
      >
        {formatDate(entry.start)}
      </span>
      <span
        className={
          "text-xs text-fg overflow-hidden " +
          "min-w-0 flex-1 flex items-center gap-1"
        }
      >
        <span className="truncate min-w-0">
          {entry.description || (
            <em className="text-fg-muted">{tc("noDescription")}</em>
          )}
        </span>
        {entry.notes && (
          <ContentPopup
            content={entry.notes}
            title={tc("notes")}
            icon="notes"
          />
        )}
      </span>
      {entry.contract && (
        <span
          className={[
            "text-2xs px-1.5 py-0.5 rounded shrink-0",
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
          "text-xs text-fg-muted tabular-nums shrink-0"
        }
      >
        {formatHours(minutes)}
      </span>
      <HoverActions className="gap-0.5">
        <button
          onClick={() => setEditing(true)}
          className={
            "p-0.5 rounded text-fg-muted " +
            "hover:text-fg-strong transition-colors"
          }
          title={tc("edit")}
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
              "p-0.5 rounded text-fg-muted " +
              "hover:text-red-400 transition-colors"
            }
            title={tc("delete")}
          >
            <Trash2 size={12} strokeWidth={2} />
          </button>
        </ConfirmPopover>
      </HoverActions>
    </div>
    </>
  );
}

/* ---- All clock entries for one customer ---- */

function CustomerClockEntries({
  customerName,
}: {
  customerName: string;
}) {
  const { t: tClocks } = useTranslation("clocks");
  const { t: tCommon } = useTranslation("common");
  const { data: entries, isLoading } =
    useCustomerClockEntries(customerName);

  if (isLoading) {
    return (
      <p className="text-xs text-fg-muted py-2 pl-1">
        {tCommon("loading")}
      </p>
    );
  }

  const completed = (entries ?? [])
    .filter((e) => e.duration_minutes !== null)
    .sort((a, b) =>
      (b.start ?? "").localeCompare(a.start ?? ""),
    );

  if (completed.length === 0) {
    return (
      <p className="text-xs text-fg-muted py-2 pl-1">
        {tClocks("noClockEntries")}
      </p>
    );
  }

  return (
    <div className="mt-2 pl-1">
      {completed.map((entry) => (
        <ClockEntryRow
          key={entry.start}
          entry={entry}
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
  const { t: tc } = useTranslation("common");
  const hasContracts = b.contracts.length > 0;
  const activeContracts = b.contracts.filter(
    (c) => !c.invoiced,
  );
  const displayBudget = hasContracts
    ? activeContracts.reduce(
        (s, c) => s + c.budget, 0,
      )
    : b.budget;
  const displayUsed = hasContracts
    ? activeContracts.reduce(
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
              "p-0.5 rounded text-fg-muted " +
              "hover:text-fg-strong transition-colors"
            }
            aria-label={
              expanded ? tc("collapse") : tc("expand")
            }
          >
            <ChevronIcon size={14} strokeWidth={2} />
          </button>
          <button
            onClick={onNameClick}
            className={
              "text-sm font-medium text-fg-strong " +
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
              "text-xs text-fg-muted tabular-nums"
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
          {b.contracts.filter((c) => !c.invoiced).map((c) => {
            const pct = contractUsedPct(c.budget, c.used);
            const cColor = budgetBarColor(pct);
            return (
              <div key={c.name}>
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-2xs text-fg-muted truncate">
                    {c.name}
                  </span>
                  <span
                    className="text-2xs tabular-nums shrink-0 ml-2"
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
              className="text-2xs tabular-nums"
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
  const { t } = useTranslation("dashboard");
  const { t: tc } = useTranslation("common");
  const { t: tClocks } = useTranslation("clocks");
  const { data } = useDashboard();
  const { data: timer } = useActiveTimer();
  const stopTimer = useStopTimer();
  const setView = useSetView();
  const customerColors = useCustomerColors();
  const [expandedCustomers, setExpandedCustomers] =
    useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!timer?.active) return;
    const id = setInterval(
      () => setTick((n) => n + 1), 1000,
    );
    return () => clearInterval(id);
  }, [timer?.active]);

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
        <p className="text-sm text-fg-muted">
          {tc("loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PanelToolbar
        right={<>
          <HelpButton
            title="Dashboard"
            doc={DOCS.dashboard}
            view="dashboard"
          />
        </>}
      />
      <div
        className={
          "flex-1 overflow-y-auto p-5 space-y-6"
        }
      >
        {/* Active timer banner */}
        {timer?.active && timer.start && (
          <div
            className={
              "flex items-center gap-4 p-4 rounded-lg " +
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
                  "text-sm font-semibold text-fg-strong"
                }
              >
                {timer.customer || timer.description || tc("active")}
              </p>
              {timer.description && (
                <p
                  className={
                    "text-xs text-fg truncate"
                  }
                >
                  {timer.description}
                </p>
              )}
            </div>
            <span
              className={
                "text-lg font-mono font-semibold " +
                "text-fg-strong tabular-nums shrink-0"
              }
            >
              {elapsed(timer.start)}
            </span>
            <button
              onClick={() => stopTimer.mutate()}
              disabled={stopTimer.isPending}
              title={tClocks("stopTimer")}
              aria-label={tClocks("stopTimer")}
              className={[
                "inline-flex items-center justify-center",
                "w-6 h-6 rounded-full shrink-0",
                "bg-red-500 text-white",
                "border border-red-500",
                "hover:brightness-110 transition-all",
                "disabled:opacity-40 disabled:cursor-wait",
              ].join(" ")}
            >
              <Square size={10} fill="currentColor" />
            </button>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={t("openTasks")}
            value={data.open_task_count}
            icon={CheckSquare}
            cta="#18181b"
            onClick={() => setView("board")}
          />
          <StatCard
            label={t("inboxItems")}
            value={data.inbox_count}
            icon={Inbox}
            cta="#d97706"
            onClick={() => setView("inbox")}
          />
          {(data.projects?.length ?? 0) > 0 && (
            <StatCard
              label={t("activeProjects")}
              value={data.projects!.length}
              icon={FolderKanban}
              cta="#0891b2"
              onClick={() => setView("projects")}
            />
          )}
          {data.month_hours > 0 && (
            <StatCard
              label={t("hoursThisMonth")}
              value={data.month_hours}
              icon={Clock}
              cta="#16a34a"
              onClick={() => setView("clocks")}
            />
          )}
          {data.budgets_warning > 0 && (
            <StatCard
              label={t("budgetsAtRisk")}
              value={data.budgets_warning}
              icon={AlertTriangle}
              cta="#dc2626"
              onClick={() => setView("customers")}
            />
          )}
          {data.unassigned_cloud > 0 && (
            <StatCard
              label={t("unassignedEntries")}
              value={data.unassigned_cloud}
              icon={CloudOff}
              cta="#7c3aed"
              onClick={() => setView("clocks")}
            />
          )}
          {data.aging_inbox > 0 && (
            <StatCard
              label={t("inboxOlderThan7Days")}
              value={data.aging_inbox}
              icon={Inbox}
              cta="#dc2626"
              onClick={() => setView("inbox")}
            />
          )}
        </div>

        {/* Budget overview with clock entries */}
        {data.budgets.length > 0 && (
          <div
            className={
              "rounded-lg bg-surface-card " +
              "border border-border-subtle p-5"
            }
          >
            <h2
              className={
                "text-xs font-semibold tracking-wider " +
                "uppercase text-fg-muted mb-4"
              }
            >
              {t("budgetStatus")}
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

        {/* Active projects */}
        {(data.projects?.length ?? 0) > 0 && (
          <div
            className={
              "rounded-lg bg-surface-card " +
              "border border-border-subtle p-5"
            }
          >
            <h2
              className={
                "text-xs font-semibold tracking-wider " +
                "uppercase text-fg-muted mb-4"
              }
            >
              {t("activeProjects")}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.projects!.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setView("projects", p.id)}
                  style={{
                    borderLeftColor: p.color || undefined,
                  }}
                  className={
                    "text-left rounded-lg border " +
                    "border-border-subtle border-l-4 p-3 " +
                    "hover:border-cta/50 transition-colors"
                  }
                >
                  <div className="font-medium text-fg-strong truncate">
                    {p.name}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-2xs text-fg-muted">
                    {p.customer && (
                      <span className="uppercase tracking-wider">
                        {p.customer}
                      </span>
                    )}
                    {p.milestones_total > 0 && (
                      <span className="tabular-nums">
                        {p.milestones_done}/
                        {p.milestones_total} ◆
                      </span>
                    )}
                    <span className="ml-auto tabular-nums">
                      {(p.minutes / 60).toFixed(1)}h
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Time Insights */}
        <TimeInsights />
      </div>
    </div>
  );
}
