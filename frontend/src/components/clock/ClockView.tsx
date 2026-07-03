/**
 * Main clock entries view. Composes the toolbar,
 * quick-book form, cloud triage panel, and the
 * sortable entries table.
 */
import { useTranslation } from "react-i18next";
import { Download, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  profileGet,
  profileSet,
} from "../../utils/profileStorage";
import { BookForm } from "./BookForm";
import { CloudTriagePanel } from "./CloudTriagePanel";
import {
  SelectAllTh,
  SortTh,
  sortValue,
} from "./ClockTableHeader";
import { EntryRow } from "./EntryRow";
import { Button } from "../common/Button";
import { ContractSelect } from "../common/ContractSelect";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { HelpButton } from "../common/HelpButton";
import { OpenInEditorButton } from "../common/OpenInEditorButton";
import { PanelToolbar } from "../common/PanelToolbar";
import { SearchInput } from "../common/SearchInput";
import { Toggle } from "../common/Toggle";
import { DOCS } from "../../docs/panelDocs";
import {
  useBatchUpdateClockEntries,
  useClockEntries,
} from "../../hooks/useClocks";
import { useContracts } from "../../hooks/useContracts";
import { useInvoicedContracts } from "../../hooks/useInvoicedContracts";
import { useResizableColumns } from "../../hooks/useResizableColumns";
import { useInvoiceExportSettings } from "../../hooks/useSettings";
import { useTasks } from "../../hooks/useTasks";
import {
  exportClocksCsv,
  exportClocksExcel,
} from "../../utils/exportClocks";
import { taskTitleById } from "../../utils/customerPrefix";
import {
  isValidQuery,
  matchesFilter,
} from "../../utils/filterMatch";
import { registerPanelAction } from "../../utils/panelActions";
import {
  usePendingSearch,
} from "../../context/ViewContext";
import { totalHours } from "../../utils/formatting";
import { smallInputCls } from "../../styles/formStyles";
import type { SortCol, SortState } from "./ClockTableHeader";
import type { ClockEntry } from "../../types";

type Period = "today" | "week" | "month" | "year";

const PERIOD_STORAGE_KEY = "clocks_period";
const PERIOD_VALUES: Period[] = [
  "today",
  "week",
  "month",
  "year",
];

function loadPeriod(): Period {
  const raw = profileGet(PERIOD_STORAGE_KEY);
  return PERIOD_VALUES.includes(raw as Period)
    ? (raw as Period)
    : "week";
}

/** Column-filter keys (text columns only). */
const FILTER_KEYS = [
  "customer",
  "contract",
  "task",
  "description",
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type ColFilters = Record<FilterKey, string>;

const FILTERS_STORAGE_KEY = "clocks_col_filters";

const EMPTY_FILTERS: ColFilters = {
  customer: "",
  contract: "",
  task: "",
  description: "",
};

function loadFilters(): ColFilters {
  const raw = profileGet(FILTERS_STORAGE_KEY);
  if (!raw) return EMPTY_FILTERS;
  try {
    const parsed = JSON.parse(raw);
    return { ...EMPTY_FILTERS, ...parsed };
  } catch {
    return EMPTY_FILTERS;
  }
}


interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
}

/** Compact regex-aware filter input for a column header.
 *  Shows a small X to clear when non-empty and turns red
 *  on invalid regex. */
function FilterInput({
  value,
  onChange,
}: FilterInputProps) {
  const { t: tc } = useTranslation("common");
  const valid = isValidQuery(value);
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tc("filter")}
        title={
          valid
            ? tc("filterHint")
            : tc("filterInvalid")
        }
        className={[
          "w-full px-2 py-0.5 rounded text-xs",
          "bg-surface-raised border",
          valid
            ? "border-border focus:border-cta"
            : "border-red-400 focus:border-red-500",
          "text-fg-strong placeholder-fg-subtle",
          "focus:outline-none",
          value ? "pr-5" : "",
        ].join(" ")}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className={[
            "absolute right-1 top-1/2 -translate-y-1/2",
            "text-fg-subtle hover:text-fg",
            "text-xs leading-none",
          ].join(" ")}
          title="Clear filter"
        >
          ×
        </button>
      )}
    </div>
  );
}

const CLOCK_COLUMNS = [
  { key: "date", defaultPct: 8 },
  { key: "time", defaultPct: 10 },
  { key: "customer", defaultPct: 10 },
  { key: "contract", defaultPct: 10 },
  { key: "task", defaultPct: 14 },
  { key: "description", defaultPct: 36 },
  { key: "duration", defaultPct: 12 },
];

/**
 * Top-level clock entries panel with period filtering,
 * search, CSV/XLS export, quick-book, and a sortable
 * entries table.
 */
export function ClockView() {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const [period, setPeriod] = useState<Period>(loadPeriod);
  const [specificDate, setSpecificDate] = useState("");
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] =
    useState<ColFilters>(loadFilters);
  const [booking, setBooking] = useState(false);
  const [hideInvoiced, setHideInvoiced] = useState(
    () => profileGet(
      "clocks_hide_invoiced",
    ) === "true",
  );
  const [sort, setSort] = useState<SortState>({
    col: "date",
    dir: "desc",
  });
  const [selected, setSelected] = useState<Set<string>>(
    new Set(),
  );
  const [bulkCustomer, setBulkCustomer] = useState("");
  const [bulkContract, setBulkContract] = useState("");
  const batchUpdate = useBatchUpdateClockEntries();
  const invoicedSet = useInvoicedContracts();
  const { data: exportSettings } =
    useInvoiceExportSettings();
  const exportColumns = exportSettings?.columns;
  const { widths, tableRef, startResize } =
    useResizableColumns("clocks", CLOCK_COLUMNS);

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

  // In range mode the from/to inputs drive the query; in
  // single mode the one date input does (from == to).
  const effectiveFrom = rangeMode ? rangeFrom : specificDate;
  const effectiveTo = rangeMode ? rangeTo : specificDate;
  const { data: entries = [], isLoading } =
    useClockEntries(
      period,
      effectiveFrom || undefined,
      effectiveTo || undefined,
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

  useEffect(() => {
    profileSet(
      FILTERS_STORAGE_KEY,
      JSON.stringify(colFilters),
    );
  }, [colFilters]);

  function setFilter(key: FilterKey, value: string) {
    setColFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearAllFilters() {
    setColFilters(EMPTY_FILTERS);
  }

  const hasActiveFilters = FILTER_KEYS.some(
    (k) => colFilters[k] !== "",
  );

  const searchFiltered = search
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

  const filtered = searchFiltered.filter((e) => {
    const taskTitle =
      taskTitleById(tasks, e.task_id) ?? "";
    try {
      return (
        matchesFilter(
          e.customer ?? "", colFilters.customer,
        ) &&
        matchesFilter(
          e.contract ?? "", colFilters.contract,
        ) &&
        matchesFilter(
          taskTitle, colFilters.task,
        ) &&
        matchesFilter(
          e.description ?? "",
          colFilters.description,
        )
      );
    } catch {
      return true;
    }
  });

  const invoiceFiltered = hideInvoiced
    ? filtered.filter((e) => !e.invoiced)
    : filtered;

  const sorted = [...invoiceFiltered].sort((a, b) => {
    const av = sortValue(a, sort.col, tasks);
    const bv = sortValue(b, sort.col, tasks);
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return sort.dir === "asc" ? cmp : -cmp;
  });

  // ---------------------------------------------------------
  // Bulk selection
  // ---------------------------------------------------------
  const entryKey = (e: ClockEntry) => e.sync_id || e.start;

  function toggleOne(entry: ClockEntry) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = entryKey(entry);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allSelected =
    sorted.length > 0 &&
    sorted.every((e) => selected.has(entryKey(e)));

  function toggleSelectAll() {
    setSelected(
      allSelected
        ? new Set()
        : new Set(sorted.map(entryKey)),
    );
  }

  const selectedEntries = sorted.filter((e) =>
    selected.has(entryKey(e)),
  );
  const selectedCustomers = Array.from(
    new Set(selectedEntries.map((e) => e.customer)),
  );
  const singleCustomer =
    selectedCustomers.length === 1
      ? selectedCustomers[0]
      : null;
  const { data: bulkContracts = [] } =
    useContracts(singleCustomer);

  function clearSelection() {
    setSelected(new Set());
  }

  function applyBulk(updates: {
    invoiced?: boolean;
    contract?: string;
    customer?: string;
  }) {
    if (selectedEntries.length === 0) return;
    batchUpdate.mutate(
      { entries: selectedEntries, updates },
      { onSuccess: clearSelection },
    );
  }

  // Drop a stale selection when the visible entry set
  // changes underneath it (period / date / range filters),
  // so a bulk action never targets rows from another view.
  useEffect(() => {
    setSelected(new Set());
  }, [period, specificDate, rangeFrom, rangeTo, rangeMode]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <PanelToolbar
        left={<>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              t("searchCustomerDescription")
            }
            className="w-52"
          />
          <select
            className={`${smallInputCls} !w-28`}
            value={period}
            onChange={(e) => {
              const next = e.target.value as Period;
              setPeriod(next);
              setSpecificDate("");
              setRangeFrom("");
              setRangeTo("");
              profileSet(
                PERIOD_STORAGE_KEY,
                next,
              );
            }}
          >
            <option value="today">{t("periodToday")}</option>
            <option value="week">{t("periodWeek")}</option>
            <option value="month">{t("periodMonth")}</option>
            <option value="year">{t("periodYear")}</option>
          </select>
          <label
            className="flex items-center gap-1 text-xs text-fg-muted select-none"
            title={t("dateRangeHint")}
          >
            <input
              type="checkbox"
              checked={rangeMode}
              onChange={(e) => {
                const on = e.target.checked;
                setRangeMode(on);
                // Carry the picked day across the toggle so
                // switching modes doesn't lose the filter.
                if (on) {
                  setRangeFrom(specificDate);
                  setRangeTo("");
                } else {
                  setSpecificDate(rangeFrom);
                }
              }}
            />
            {t("dateRange")}
          </label>
          {rangeMode ? (
            <>
              <input
                type="date"
                className={`${smallInputCls} !w-36`}
                value={rangeFrom}
                title={t("fromDate")}
                onChange={(e) =>
                  setRangeFrom(e.target.value)
                }
              />
              <span className="text-xs text-fg-muted">
                –
              </span>
              <input
                type="date"
                className={`${smallInputCls} !w-36`}
                value={rangeTo}
                title={t("toDate")}
                onChange={(e) =>
                  setRangeTo(e.target.value)
                }
              />
            </>
          ) : (
            <input
              type="date"
              className={`${smallInputCls} !w-36`}
              value={specificDate}
              title={t("filterByDate")}
              onChange={(e) =>
                setSpecificDate(e.target.value)
              }
            />
          )}
          {!isLoading && invoiceFiltered.length > 0 && (
            <span className="text-xs text-fg-muted">
              {t("entriesCount", {
                count: invoiceFiltered.length,
              })} ·{" "}
              {totalHours(invoiceFiltered)}h
            </span>
          )}
        </>}
        right={<>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-fg-muted">
              {t("hideInvoiced")}
            </span>
            <Toggle
              checked={hideInvoiced}
              onChange={(v) => {
                setHideInvoiced(v);
                profileSet(
                  "clocks_hide_invoiced",
                  String(v),
                );
              }}
            />
          </label>
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
                  "rounded text-xs text-fg " +
                  "hover:text-cta hover:bg-cta-muted " +
                  "transition-colors"
                }
                title={t("downloadCsv")}
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
                  "rounded text-xs text-fg " +
                  "hover:text-cta hover:bg-cta-muted " +
                  "transition-colors"
                }
                title={t("downloadExcel")}
              >
                <Download size={11} />
                XLS
              </button>
            </>
          )}
          <Button
            variant="tonal"
            size="sm"
            icon={<Plus size={12} />}
            onClick={() => setBooking((v) => !v)}
          >
            {t("book")}
          </Button>
          <OpenInEditorButton kind="clocks" />
          <HelpButton
            title="Clock Entries"
            doc={DOCS.clocks}
            view="clocks"
          />
        </>}
      />

      {/* Quick-book form */}
      {booking && (
        <BookForm onClose={() => setBooking(false)} />
      )}

      {/* Cloud triage (unassigned entries) */}
      <div className="px-4 py-2">
        <CloudTriagePanel />
      </div>

      {/* Bulk-action bar */}
      {selected.size > 0 && (
        <div
          className={
            "flex flex-wrap items-center gap-2 " +
            "px-4 py-2 border-y border-border " +
            "bg-surface-raised/60"
          }
        >
          <span className="text-xs text-fg-strong">
            {t("bulkSelected", { count: selected.size })}
          </span>
          <button
            onClick={clearSelection}
            className={
              "px-2 py-1 rounded text-xs text-fg " +
              "hover:text-cta hover:bg-cta-muted " +
              "transition-colors"
            }
          >
            {t("bulkClear")}
          </button>
          <span className="text-border">|</span>
          <button
            onClick={() =>
              applyBulk({ invoiced: true })
            }
            disabled={batchUpdate.isPending}
            className={
              "px-2 py-1 rounded text-xs text-fg " +
              "hover:text-emerald-600 " +
              "hover:bg-emerald-500/10 " +
              "transition-colors disabled:opacity-40"
            }
          >
            {t("bulkMarkInvoiced")}
          </button>
          <button
            onClick={() =>
              applyBulk({ invoiced: false })
            }
            disabled={batchUpdate.isPending}
            className={
              "px-2 py-1 rounded text-xs text-fg " +
              "hover:text-cta hover:bg-cta-muted " +
              "transition-colors disabled:opacity-40"
            }
          >
            {t("bulkUnmarkInvoiced")}
          </button>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1">
            <CustomerAutocomplete
              value={bulkCustomer}
              onChange={setBulkCustomer}
              inputClassName={`${smallInputCls} !w-40`}
              placeholder={t("bulkSetCustomer")}
            />
            <button
              onClick={() => {
                applyBulk({
                  customer: bulkCustomer.trim(),
                });
                setBulkCustomer("");
              }}
              disabled={
                batchUpdate.isPending ||
                !bulkCustomer.trim()
              }
              className={
                "px-2 py-1 rounded text-xs text-fg " +
                "hover:text-cta hover:bg-cta-muted " +
                "transition-colors disabled:opacity-40"
              }
            >
              {t("bulkSetCustomer")}
            </button>
          </div>
          <span className="text-border">|</span>
          <div
            className="flex items-center gap-1"
            title={
              singleCustomer
                ? undefined
                : t("bulkContractMixedCustomers")
            }
          >
            <ContractSelect
              contracts={bulkContracts}
              value={bulkContract}
              onChange={setBulkContract}
              className={`${smallInputCls} !w-40`}
            />
            <button
              onClick={() => {
                applyBulk({ contract: bulkContract });
                setBulkContract("");
              }}
              disabled={
                batchUpdate.isPending ||
                !singleCustomer ||
                !bulkContract
              }
              className={
                "px-2 py-1 rounded text-xs text-fg " +
                "hover:text-cta hover:bg-cta-muted " +
                "transition-colors disabled:opacity-40"
              }
            >
              {t("bulkSetContract")}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className={
            "text-sm text-fg-muted " +
            "text-center py-8"
          }>
            {tc("loading")}
          </p>
        )}
        {!isLoading && entries.length === 0 && (
          <p className={
            "text-sm text-fg-muted " +
            "text-center py-8"
          }>
            {t("noEntriesFound")}
          </p>
        )}
        {!isLoading && entries.length > 0 && (
          <table
            ref={tableRef}
            className="w-full table-fixed"
          >
            <colgroup>
              <col style={{ width: 36 }} />
              {widths.map((w, i) => (
                <col
                  key={CLOCK_COLUMNS[i].key}
                  style={{ width: `${w}%` }}
                />
              ))}
            </colgroup>
            <thead className="group/thead">
              <tr className={
                "border-b border-border text-left " +
                "sticky top-0 bg-surface-card z-10"
              }>
                <SelectAllTh
                  allSelected={allSelected}
                  onToggleSelectAll={toggleSelectAll}
                />
                <SortTh
                  label={tc("date")}
                  col="date"
                  sort={sort}
                  onSort={toggleSort}
                  onResizeStart={(e) => startResize(0, e)}
                />
                <SortTh
                  label={tc("time")}
                  col="time"
                  sort={sort}
                  onSort={toggleSort}
                  onResizeStart={(e) => startResize(1, e)}
                />
                <SortTh
                  label={tc("customer")}
                  col="customer"
                  sort={sort}
                  onSort={toggleSort}
                  onResizeStart={(e) => startResize(2, e)}
                />
                <SortTh
                  label={tc("contract")}
                  col="contract"
                  sort={sort}
                  onSort={toggleSort}
                  onResizeStart={(e) => startResize(3, e)}
                />
                <SortTh
                  label={tc("task")}
                  col="task"
                  sort={sort}
                  onSort={toggleSort}
                  onResizeStart={(e) => startResize(4, e)}
                />
                <SortTh
                  label={tc("description")}
                  col="description"
                  sort={sort}
                  onSort={toggleSort}
                  onResizeStart={(e) => startResize(5, e)}
                />
                <SortTh
                  label={tc("duration")}
                  col="duration"
                  sort={sort}
                  onSort={toggleSort}
                  align="right"
                />
              </tr>
              <tr className={
                "border-b border-border-subtle " +
                "bg-surface-card"
              }>
                <th />
                <th />
                <th />
                <th className="px-2 py-1">
                  <FilterInput
                    value={colFilters.customer}
                    onChange={(v) =>
                      setFilter("customer", v)
                    }
                  />
                </th>
                <th className="px-2 py-1">
                  <FilterInput
                    value={colFilters.contract}
                    onChange={(v) =>
                      setFilter("contract", v)
                    }
                  />
                </th>
                <th className="px-2 py-1">
                  <FilterInput
                    value={colFilters.task}
                    onChange={(v) =>
                      setFilter("task", v)
                    }
                  />
                </th>
                <th className="px-2 py-1">
                  <FilterInput
                    value={colFilters.description}
                    onChange={(v) =>
                      setFilter("description", v)
                    }
                  />
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className={
                      "text-center py-8 " +
                      "text-sm text-fg-muted"
                    }
                  >
                    {t("noEntriesMatchFilter")}
                    {hasActiveFilters && (
                      <>
                        {" "}
                        <button
                          onClick={clearAllFilters}
                          className={
                            "underline hover:text-cta"
                          }
                        >
                          {tc("clearFilter")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                sorted.map((entry, idx) => (
                  <EntryRow
                    key={`${entry.start}-${idx}`}
                    entry={entry}
                    tasks={tasks}
                    invoicedSet={invoicedSet}
                    selected={selected.has(entryKey(entry))}
                    onToggleSelect={() => toggleOne(entry)}
                  />
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
