/**
 * Main clock entries view. Composes the toolbar,
 * quick-book form, cloud triage panel, and the
 * sortable entries table.
 */
import { Download, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { BookForm } from "./BookForm";
import { CloudTriagePanel } from "./CloudTriagePanel";
import {
  SortTh,
  sortValue,
} from "./ClockTableHeader";
import { EntryRow } from "./EntryRow";
import { HelpButton } from "../common/HelpButton";
import { SearchInput } from "../common/SearchInput";
import { DOCS } from "../../docs/panelDocs";
import { useClockEntries } from "../../hooks/useClocks";
import { useInvoicedContracts } from "../../hooks/useInvoicedContracts";
import { useInvoiceExportSettings } from "../../hooks/useSettings";
import { useTasks } from "../../hooks/useTasks";
import {
  exportClocksCsv,
  exportClocksExcel,
} from "../../utils/exportClocks";
import { registerPanelAction } from "../../utils/panelActions";
import {
  usePendingSearch,
} from "../../context/ViewContext";
import { totalHours } from "../../utils/formatting";
import { smallInputCls } from "../../styles/formStyles";
import type { SortCol, SortState } from "./ClockTableHeader";

type Period = "today" | "week" | "month" | "year";

/**
 * Top-level clock entries panel with period filtering,
 * search, CSV/XLS export, quick-book, and a sortable
 * entries table.
 */
export function ClockView() {
  const [period, setPeriod] = useState<Period>("week");
  const [specificDate, setSpecificDate] = useState("");
  const [search, setSearch] = useState("");
  const [booking, setBooking] = useState(false);
  const [sort, setSort] = useState<SortState>({
    col: "date",
    dir: "desc",
  });
  const invoicedSet = useInvoicedContracts();
  const { data: exportSettings } =
    useInvoiceExportSettings();
  const exportColumns = exportSettings?.columns;

  function toggleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? {
            col,
            dir: prev.dir === "asc" ? "desc" : "asc",
          }
        : { col, dir: "desc" },
    );
  }

  const { data: entries = [], isLoading } =
    useClockEntries(
      period,
      specificDate || undefined,
    );
  const { data: tasks = [] } = useTasks(true);
  const { pendingSearch, clearPendingSearch } =
    usePendingSearch();

  useEffect(
    () =>
      registerPanelAction("clocks", () =>
        setBooking(true),
      ),
    [],
  );

  useEffect(() => {
    if (pendingSearch) {
      setSearch(pendingSearch);
      clearPendingSearch();
    }
  }, [pendingSearch, clearPendingSearch]);

  const filtered = search
    ? entries.filter(
        (e) =>
          e.customer
            .toLowerCase()
            .includes(search.toLowerCase()) ||
          e.description
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
    : entries;

  const sorted = [...filtered].sort((a, b) => {
    const av = sortValue(a, sort.col, tasks);
    const bv = sortValue(b, sort.col, tasks);
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return sort.dir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className={
        "flex items-center gap-3 px-6 py-3 " +
        "border-b border-border-subtle shrink-0 " +
        "flex-wrap"
      }>
        <h1 className={
          "text-xs font-semibold tracking-wider " +
          "uppercase text-stone-700"
        }>
          Clock Entries
        </h1>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={
            "Search customer / description…"
          }
          inputClassName={
            "px-2 py-1 rounded-lg text-xs " +
            "bg-surface-raised border border-border " +
            "text-stone-900 placeholder-stone-500 " +
            "focus:outline-none focus:border-cta " +
            "w-52 pr-6"
          }
          className="w-52"
        />
        <select
          className={`${smallInputCls} !w-28`}
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value as Period);
            setSpecificDate("");
          }}
        >
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="year">This year</option>
        </select>
        <input
          type="date"
          className={`${smallInputCls} !w-36`}
          value={specificDate}
          title="Filter by specific date"
          onChange={(e) =>
            setSpecificDate(e.target.value)
          }
        />
        {!isLoading && filtered.length > 0 && (
          <span className="text-xs text-stone-600">
            {filtered.length} entries ·{" "}
            {totalHours(filtered)}h
          </span>
        )}
        {!isLoading && sorted.length > 0 && (
          <>
            <button
              onClick={() =>
                exportClocksCsv(
                  sorted,
                  `clock-entries-${period}.csv`,
                  exportColumns,
                )
              }
              className={
                "flex items-center gap-1 px-2 py-1 " +
                "rounded text-[11px] text-stone-700 " +
                "hover:text-cta hover:bg-cta-muted " +
                "transition-colors"
              }
              title="Download CSV"
            >
              <Download size={11} />
              CSV
            </button>
            <button
              onClick={() =>
                exportClocksExcel(
                  sorted,
                  `clock-entries-${period}.xlsx`,
                  exportColumns,
                )
              }
              className={
                "flex items-center gap-1 px-2 py-1 " +
                "rounded text-[11px] text-stone-700 " +
                "hover:text-cta hover:bg-cta-muted " +
                "transition-colors"
              }
              title="Download Excel"
            >
              <Download size={11} />
              XLS
            </button>
          </>
        )}
        <button
          onClick={() => setBooking((v) => !v)}
          className={
            "ml-auto flex items-center gap-1 " +
            "px-2.5 py-1 rounded bg-cta-muted " +
            "text-cta text-xs font-semibold " +
            "hover:bg-cta hover:text-white " +
            "transition-colors"
          }
        >
          <Plus size={11} />
          Book
        </button>
        <HelpButton
          title="Clock Entries"
          doc={DOCS.clocks}
          view="clocks"
        />
      </div>

      {/* Quick-book form */}
      {booking && (
        <BookForm onClose={() => setBooking(false)} />
      )}

      {/* Cloud triage (unassigned entries) */}
      <div className="px-4 py-2">
        <CloudTriagePanel />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className={
            "text-sm text-stone-500 " +
            "text-center py-8"
          }>
            Loading…
          </p>
        )}
        {!isLoading && sorted.length === 0 && (
          <p className={
            "text-sm text-stone-500 " +
            "text-center py-8"
          }>
            No entries found.
          </p>
        )}
        {sorted.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className={
                "border-b border-border text-left " +
                "sticky top-0 bg-surface-card z-10"
              }>
                <SortTh
                  label="Date"
                  col="date"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Time"
                  col="time"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Customer"
                  col="customer"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Contract"
                  col="contract"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Task"
                  col="task"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Description"
                  col="description"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Duration"
                  col="duration"
                  sort={sort}
                  onSort={toggleSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, idx) => (
                <EntryRow
                  key={`${entry.start}-${idx}`}
                  entry={entry}
                  tasks={tasks}
                  invoicedSet={invoicedSet}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
