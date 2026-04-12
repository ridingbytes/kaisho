import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTimeInsights } from "../../hooks/useDashboard";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import { useSetView } from "../../context/ViewContext";
import {
  useInvoicedContracts,
  isInvoiced,
} from "../../hooks/useInvoicedContracts";
import { navigateToClockDate } from "../../utils/clockNavigation";
import {
  formatDate,
  formatHours,
  formatTime,
} from "../../utils/formatting";
import type {
  TimeInsightsCustomer,
  TimeInsightsEntry,
} from "../../api/client";

type Period = "week" | "month" | "quarter" | "year";

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

// -------------------------------------------------------
// Activity Heatmap
// -------------------------------------------------------

const CELL = 11;
const GAP = 2;

function heatColor(mins: number, maxMins: number): string {
  if (mins === 0) return "var(--surface-raised)";
  const intensity = Math.min(mins / Math.max(maxMins, 1), 1);
  const alpha = 0.15 + intensity * 0.7;
  return `rgba(var(--cta-rgb, 24,24,27), ${alpha})`;
}

function ActivityHeatmap({
  daily,
  startDate,
  endDate,
  onDayClick,
  selectedDay,
}: {
  daily: { date: string; total_min: number }[];
  startDate: string;
  endDate: string;
  onDayClick: (d: string) => void;
  selectedDay: string | null;
}) {
  const dayMap = Object.fromEntries(
    daily.map((d) => [d.date, d.total_min]),
  );
  const maxMins = Math.max(
    ...daily.map((d) => d.total_min), 1,
  );

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const days: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  // Pad start to Monday
  const startDow = start.getDay();
  const padStart = startDow === 0 ? 6 : startDow - 1;

  const cells = [
    ...Array(padStart).fill(null),
    ...days,
  ];
  const weeks = Math.ceil(cells.length / 7);

  return (
    <div className="overflow-x-auto">
      <svg
        width={weeks * (CELL + GAP) + GAP}
        height={7 * (CELL + GAP) + GAP}
        className="block"
      >
        {cells.map((day, i) => {
          if (!day) return null;
          const week = Math.floor(i / 7);
          const dow = i % 7;
          const mins = dayMap[day] ?? 0;
          const isSelected = day === selectedDay;
          return (
            <rect
              key={day}
              x={week * (CELL + GAP) + GAP}
              y={dow * (CELL + GAP) + GAP}
              width={CELL}
              height={CELL}
              rx={2}
              fill={heatColor(mins, maxMins)}
              stroke={
                isSelected
                  ? "var(--cta)"
                  : "transparent"
              }
              strokeWidth={isSelected ? 1.5 : 0}
              className="cursor-pointer"
              onClick={() => onDayClick(day)}
            >
              <title>
                {formatDate(day)}: {formatHours(mins)}
              </title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

// -------------------------------------------------------
// Entry Row (drilldown item)
// -------------------------------------------------------

function EntryRow({ entry }: { entry: TimeInsightsEntry }) {
  const setView = useSetView();
  const invoicedSet = useInvoicedContracts();
  const isInv = isInvoiced(
    invoicedSet, entry.customer, entry.contract,
  );
  return (
    <div
      className={[
        "flex items-center gap-2 py-1 text-xs",
        "border-b border-border-subtle last:border-0",
      ].join(" ")}
    >
      <button
        onClick={() =>
          navigateToClockDate(entry.start.slice(0, 10))
        }
        className="text-stone-500 hover:text-cta tabular-nums shrink-0"
      >
        {formatTime(entry.start)}
      </button>
      <button
        onClick={() =>
          setView("customers", entry.customer)
        }
        className={[
          "px-1.5 py-0.5 rounded text-[10px]",
          "font-semibold uppercase tracking-wider",
          "bg-cta-muted text-cta-hover",
          "hover:bg-cta/20 transition-colors shrink-0",
        ].join(" ")}
      >
        {entry.customer}
      </button>
      <span
        className="flex-1 text-stone-700 truncate"
        title={entry.description}
      >
        {entry.description}
      </span>
      {entry.contract && (
        <span
          className={[
            "px-1 py-0.5 rounded text-[9px] shrink-0",
            isInv
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-surface-overlay text-stone-600",
          ].join(" ")}
        >
          {entry.contract}
          {isInv && " ✓"}
        </span>
      )}
      <span
        className={[
          "tabular-nums shrink-0 font-medium",
          entry.billable
            ? "text-emerald-600"
            : "text-stone-500",
        ].join(" ")}
      >
        {formatHours(entry.duration_minutes)}
      </span>
    </div>
  );
}

// -------------------------------------------------------
// Customer Bar (clickable → drilldown)
// -------------------------------------------------------

function CustomerBar({
  cust,
  maxMins,
}: {
  cust: TimeInsightsCustomer;
  maxMins: number;
}) {
  const [open, setOpen] = useState(false);
  const colors = useCustomerColors();
  const pct =
    maxMins > 0
      ? Math.round((cust.total_min / maxMins) * 100)
      : 0;
  const billPct =
    cust.total_min > 0
      ? Math.round(
          (cust.billable_min / cust.total_min) * 100,
        )
      : 0;
  const dotColor = colors[cust.name] || "#a1a1aa";

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          "w-full flex items-center gap-2 py-1",
          "text-xs text-stone-800",
          "hover:text-cta transition-colors",
        ].join(" ")}
      >
        {open ? (
          <ChevronDown size={10} className="shrink-0" />
        ) : (
          <ChevronRight size={10} className="shrink-0" />
        )}
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: dotColor }}
        />
        <span className="w-24 text-left truncate shrink-0">
          {cust.name}
        </span>
        <div
          className={[
            "flex-1 h-3 rounded-full bg-surface-raised",
            "overflow-hidden",
          ].join(" ")}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: dotColor,
              opacity: 0.7,
            }}
          />
        </div>
        <span className="tabular-nums text-stone-600 shrink-0 w-12 text-right">
          {formatHours(cust.total_min)}
        </span>
        {billPct > 0 && billPct < 100 && (
          <span className="text-[9px] text-emerald-600 shrink-0">
            {billPct}%
          </span>
        )}
      </button>
      {open && (
        <div className="ml-5 pl-3 border-l border-border-subtle">
          {cust.entries.map((e, i) => (
            <EntryRow key={`${e.start}-${i}`} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------
// Billable / Non-billable Bar
// -------------------------------------------------------

function BillableSplit({
  billableMin,
  nonBillableMin,
  byCustomer,
}: {
  billableMin: number;
  nonBillableMin: number;
  byCustomer: TimeInsightsCustomer[];
}) {
  const [expanded, setExpanded] = useState<
    "billable" | "non-billable" | null
  >(null);
  const total = billableMin + nonBillableMin;
  if (total === 0) return null;
  const billPct = Math.round(
    (billableMin / total) * 100,
  );

  const filtered = (billable: boolean) =>
    byCustomer
      .map((c) => ({
        ...c,
        entries: c.entries.filter(
          (e) => e.billable === billable,
        ),
        total_min: c.entries
          .filter((e) => e.billable === billable)
          .reduce((s, e) => s + e.duration_minutes, 0),
      }))
      .filter((c) => c.total_min > 0)
      .sort((a, b) => b.total_min - a.total_min);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] text-stone-500 uppercase tracking-wider w-16 shrink-0">
          Billable
        </span>
        <div
          className={[
            "flex-1 h-4 rounded-full",
            "bg-surface-raised overflow-hidden",
            "flex cursor-pointer",
          ].join(" ")}
        >
          {billableMin > 0 && (
            <div
              className={[
                "h-full bg-emerald-500",
                "hover:bg-emerald-400 transition-colors",
              ].join(" ")}
              style={{ width: `${billPct}%` }}
              onClick={() =>
                setExpanded((v) =>
                  v === "billable" ? null : "billable",
                )
              }
              title={`Billable: ${formatHours(billableMin)} (${billPct}%)`}
            />
          )}
          {nonBillableMin > 0 && (
            <div
              className={[
                "h-full bg-amber-400",
                "hover:bg-amber-300 transition-colors",
              ].join(" ")}
              style={{
                width: `${100 - billPct}%`,
              }}
              onClick={() =>
                setExpanded((v) =>
                  v === "non-billable"
                    ? null
                    : "non-billable",
                )
              }
              title={`Non-billable: ${formatHours(nonBillableMin)} (${100 - billPct}%)`}
            />
          )}
        </div>
        <span className="text-xs tabular-nums text-stone-600 shrink-0">
          {formatHours(total)}
        </span>
      </div>
      <div className="flex gap-3 text-[10px] text-stone-500 mb-2">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-emerald-500" />
          Billable {formatHours(billableMin)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-amber-400" />
          Non-billable {formatHours(nonBillableMin)}
        </span>
      </div>
      {expanded && (
        <div className="ml-2 mb-2">
          {filtered(expanded === "billable").map((c) => (
            <CustomerBar
              key={c.name}
              cust={c}
              maxMins={
                expanded === "billable"
                  ? billableMin
                  : nonBillableMin
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------

export function TimeInsights() {
  const [period, setPeriod] = useState<Period>("month");
  const { data, isLoading } = useTimeInsights(period);
  const [selectedDay, setSelectedDay] = useState<
    string | null
  >(null);

  if (isLoading || !data) {
    return (
      <div className="text-xs text-stone-500 py-4">
        Loading insights...
      </div>
    );
  }

  const maxCustMins = Math.max(
    ...data.by_customer.map((c) => c.total_min),
    1,
  );

  const dayEntries = selectedDay
    ? data.by_customer.flatMap((c) =>
        c.entries.filter(
          (e) => e.start.slice(0, 10) === selectedDay,
        ),
      )
    : [];

  return (
    <div
      className={[
        "rounded-xl bg-surface-card",
        "border border-border-subtle p-5",
      ].join(" ")}
    >
      {/* Header with period toggle */}
      <div className="flex items-center gap-3 mb-4">
        <h2
          className={[
            "text-xs font-semibold tracking-wider",
            "uppercase text-stone-600",
          ].join(" ")}
        >
          Time Insights
        </h2>
        <div
          className={[
            "ml-auto flex rounded-md",
            "border border-border overflow-hidden",
          ].join(" ")}
        >
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setPeriod(p.value);
                setSelectedDay(null);
              }}
              className={[
                "px-2 py-0.5 text-[10px] font-medium",
                "transition-colors",
                period === p.value
                  ? "bg-cta text-white"
                  : "text-stone-600 hover:bg-surface-raised",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity heatmap */}
      <div className="mb-4">
        <h3
          className={[
            "text-[10px] font-semibold uppercase",
            "tracking-wider text-stone-500 mb-2",
          ].join(" ")}
        >
          Activity
        </h3>
        <ActivityHeatmap
          daily={data.daily}
          startDate={data.start_date}
          endDate={data.end_date}
          onDayClick={(d) =>
            setSelectedDay((prev) =>
              prev === d ? null : d,
            )
          }
          selectedDay={selectedDay}
        />
        {selectedDay && dayEntries.length > 0 && (
          <div className="mt-2 p-2 rounded-lg bg-surface-overlay border border-border-subtle">
            <p className="text-[10px] text-stone-500 mb-1">
              {formatDate(selectedDay)} —{" "}
              {formatHours(
                dayEntries.reduce(
                  (s, e) => s + e.duration_minutes,
                  0,
                ),
              )}
            </p>
            {dayEntries.map((e, i) => (
              <EntryRow
                key={`${e.start}-${i}`}
                entry={e}
              />
            ))}
          </div>
        )}
      </div>

      {/* Billable split */}
      <div className="mb-4">
        <h3
          className={[
            "text-[10px] font-semibold uppercase",
            "tracking-wider text-stone-500 mb-2",
          ].join(" ")}
        >
          Billable Split
        </h3>
        <BillableSplit
          billableMin={data.billable_total_min}
          nonBillableMin={data.non_billable_total_min}
          byCustomer={data.by_customer}
        />
      </div>

      {/* Hours by customer */}
      <div>
        <h3
          className={[
            "text-[10px] font-semibold uppercase",
            "tracking-wider text-stone-500 mb-2",
          ].join(" ")}
        >
          By Customer
        </h3>
        {data.by_customer.map((cust) => (
          <CustomerBar
            key={cust.name}
            cust={cust}
            maxMins={maxCustMins}
          />
        ))}
      </div>
    </div>
  );
}
