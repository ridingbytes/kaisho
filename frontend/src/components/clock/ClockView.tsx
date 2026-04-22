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
  SortTh,
  sortValue,
} from "./ClockTableHeader";
import { EntryRow } from "./EntryRow";
import { HelpButton } from "../common/HelpButton";
import { PanelToolbar } from "../common/PanelToolbar";
import { SearchInput } from "../common/SearchInput";
import { Toggle } from "../common/Toggle";
import { DOCS } from "../../docs/panelDocs";
import { useClockEntries } from "../../hooks/useClocks";
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
          "w-full px-2 py-0.5 rounded text-[11px]",
          "bg-surface-raised border",
          valid
            ? "border-border focus:border-cta"
            : "border-red-400 focus:border-red-500",
          "text-stone-900 placeholder-stone-400",
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
            "text-stone-400 hover:text-stone-700",
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

  useEffect(() => {
    profileSet(
      FILTERS_STORAGE_KEY,
      JSON.stringify(colFilters),
    );
  }, [colFilters]);

  function setFilter(key: FilterKey, value: string) {
    setColFilters((prev) => ({ ...prev, [key]: value }));
  }

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
          <input
            type="date"
            className={`${smallInputCls} !w-36`}
            value={specificDate}
            title={t("filterByDate")}
            onChange={(e) =>
              setSpecificDate(e.target.value)
            }
          />
          {!isLoading && invoiceFiltered.length > 0 && (
            <span className="text-xs text-stone-600">
              {t("entriesCount", {
                count: invoiceFiltered.length,
              })} ·{" "}
              {totalHours(invoiceFiltered)}h
            </span>
          )}
        </>}
        right={<>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-stone-600">
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
                  "rounded text-[11px] text-stone-700 " +
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
                  "rounded text-[11px] text-stone-700 " +
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
          <button
            onClick={() => setBooking((v) => !v)}
            className={
              "flex items-center gap-1 " +
              "px-2.5 py-1 rounded bg-cta-muted " +
              "text-cta text-xs font-semibold " +
              "hover:bg-cta hover:text-white " +
              "transition-colors"
            }
          >
            <Plus size={11} />
            {t("book")}
          </button>
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

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className={
            "text-sm text-stone-500 " +
            "text-center py-8"
          }>
            {tc("loading")}
          </p>
        )}
        {!isLoading && sorted.length === 0 && (
          <p className={
            "text-sm text-stone-500 " +
            "text-center py-8"
          }>
            {t("noEntriesFound")}
          </p>
        )}
        {sorted.length > 0 && (
          <table
            ref={tableRef}
            className="w-full table-fixed"
          >
            <colgroup>
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
