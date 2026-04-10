import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { ContentPopup } from "../common/ContentPopup";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import {
  useClockEntries,
  useDeleteClockEntry,
  useQuickBook,
  useUpdateClockEntry,
} from "../../hooks/useClocks";
import { useContracts } from "../../hooks/useContracts";
import { useTasks } from "../../hooks/useTasks";
import {
  exportClocksCsv,
  exportClocksExcel,
} from "../../utils/exportClocks";
import { navigateToClockDate } from "../../utils/clockNavigation";
import { registerPanelAction } from "../../utils/panelActions";
import { usePendingSearch, useSetView } from "../../context/ViewContext";
import { SearchInput } from "../common/SearchInput";
import type { ClockEntry, Task } from "../../types";

type Period = "today" | "week" | "month" | "year";

type SortCol =
  | "date"
  | "time"
  | "customer"
  | "contract"
  | "task"
  | "description"
  | "duration";
type SortDir = "asc" | "desc";
type SortState = { col: SortCol; dir: SortDir };

const inputCls =
  "bg-surface-raised border border-border rounded px-2 py-1 text-sm " +
  "text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta";

const smallInputCls =
  "bg-surface-raised border border-border rounded px-2 py-1 text-xs " +
  "text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CUSTOMER_PREFIX_RE = /^\[[^\]]+\]:?\s*/;

function taskTitleById(tasks: Task[], id: string | null): string | null {
  if (!id) return null;
  const t = tasks.find((t) => t.id === id);
  return t ? t.title.replace(CUSTOMER_PREFIX_RE, "") : null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString();
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(11, 16);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHours(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = (minutes / 60).toFixed(2).replace(/\.?0+$/, "");
  return `${h}h`;
}

function minutesToDecimal(minutes: number | null): string {
  if (minutes === null) return "";
  return (minutes / 60).toFixed(2).replace(/\.?0+$/, "");
}

function totalHours(entries: ClockEntry[]): string {
  const mins = entries.reduce(
    (acc, e) => acc + (e.duration_minutes ?? 0),
    0
  );
  return (mins / 60).toFixed(2).replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// Quick-book form (book a new clock entry without starting a timer)
// ---------------------------------------------------------------------------

function BookForm({ onClose }: { onClose: () => void }) {
  const [duration, setDuration] = useState("");
  const [customer, setCustomer] = useState("");
  const [contract, setContract] = useState("");
  const [description, setDescription] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const { data: allContracts = [] } = useContracts(
    customer || null,
  );
  const contracts = allContracts.filter(
    (c) => c.bookable !== false,
  );
  const book = useQuickBook();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!duration.trim() || !customer.trim() || !description.trim()) return;
    book.mutate(
      {
        duration: duration.trim(),
        customer: customer.trim(),
        description: description.trim(),
        contract: contract || undefined,
        taskId: taskId ?? undefined,
      },
      {
        onSuccess: () => {
          setDuration("");
          setCustomer("");
          setContract("");
          setDescription("");
          setTaskId(null);
          setTaskTitle("");
          onClose();
        },
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="flex flex-wrap items-end gap-3 px-6 py-3 border-b border-border-subtle bg-surface-card/60"
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          Duration *
        </label>
        <input
          autoFocus
          className={`${inputCls} w-28`}
          placeholder="e.g. 2h, 30min"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          Customer *
        </label>
        <CustomerAutocomplete
          value={customer}
          onChange={(v) => {
            setCustomer(v);
            setContract("");
          }}
          inputClassName={inputCls}
          className="w-44"
        />
      </div>
      {contracts.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-stone-600 uppercase tracking-wider">
            Contract
          </label>
          <select
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            className={`${inputCls} w-36`}
          >
            <option value="">— none —</option>
            {contracts.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}{c.end_date ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1 flex-1 min-w-40">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          Description *
        </label>
        <input
          className={inputCls}
          placeholder="What did you work on?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          Task
        </label>
        <TaskAutocomplete
          taskId={taskId}
          value={taskTitle}
          onChange={setTaskTitle}
          onSelect={(id, label) => {
            setTaskId(id);
            setTaskTitle(label);
          }}
          onClear={() => {
            setTaskId(null);
            setTaskTitle("");
          }}
          customer={customer}
          inputClassName={inputCls}
          className="w-48"
        />
      </div>
      <div className="flex gap-2 pb-0.5">
        <button
          type="submit"
          disabled={
            book.isPending ||
            !duration.trim() ||
            !customer.trim() ||
            !description.trim()
          }
          className="px-3 py-1.5 rounded bg-cta text-white text-xs font-semibold disabled:opacity-40"
        >
          {book.isPending ? "Booking…" : "Book"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded bg-surface-raised text-stone-700 text-xs"
        >
          Cancel
        </button>
      </div>
      {book.isError && (
        <p className="w-full text-xs text-red-400">
          {(book.error as Error).message}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Edit inline form
// ---------------------------------------------------------------------------

interface EditFormProps {
  entry: ClockEntry;
  onClose: () => void;
}

function EditForm({ entry, onClose }: EditFormProps) {
  const [entryDate, setEntryDate] = useState(entry.start.slice(0, 10));
  const [startTime, setStartTime] = useState(
    entry.start ? entry.start.slice(11, 16) : ""
  );
  const [customer, setCustomer] = useState(entry.customer);
  const [contract, setContract] = useState(entry.contract ?? "");
  const [description, setDescription] = useState(entry.description);
  const [hours, setHours] = useState(minutesToDecimal(entry.duration_minutes));
  const [taskId, setTaskId] = useState<string | null>(entry.task_id);
  const { data: tasks = [] } = useTasks(true);
  const { data: contracts = [] } = useContracts(customer || null);
  const initialTitle = entry.task_id
    ? (taskTitleById(tasks, entry.task_id) ?? "")
    : "";
  const [taskTitle, setTaskTitle] = useState(initialTitle);
  const update = useUpdateClockEntry();

  function handleSave() {
    const updates: {
      customer?: string;
      description?: string;
      hours?: number;
      new_date?: string;
      start_time?: string;
      task_id?: string;
      contract?: string;
    } = {};
    const origDate = entry.start.slice(0, 10);
    const origTime = entry.start.slice(11, 16);
    if (entryDate !== origDate || startTime !== origTime) {
      updates.new_date = entryDate;
      updates.start_time = startTime;
    }
    if (customer.trim() !== entry.customer) {
      updates.customer = customer.trim();
    }
    if (description.trim() !== entry.description) {
      updates.description = description.trim();
    }
    const h = parseFloat(hours);
    if (!isNaN(h) && h > 0 && h !== (entry.duration_minutes ?? 0) / 60) {
      updates.hours = h;
    }
    const newTaskId = taskId ?? "";
    const oldTaskId = entry.task_id ?? "";
    if (newTaskId !== oldTaskId) {
      updates.task_id = newTaskId;
    }
    if (contract !== (entry.contract ?? "")) {
      updates.contract = contract;
    }
    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }
    update.mutate({ startIso: entry.start, updates }, { onSuccess: onClose });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || (e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleSave();
    }
    if (e.key === "Escape") onClose();
  }

  return (
    <>
    <tr className="bg-surface-raised/40">
      {/* Date */}
      <td className="px-3 py-2">
        <input
          autoFocus
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          onKeyDown={handleKeyDown}
          className={smallInputCls}
        />
      </td>
      {/* Time */}
      <td className="px-3 py-2">
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          onKeyDown={handleKeyDown}
          className={smallInputCls}
          title="Start time"
        />
      </td>
      {/* Customer */}
      <td className="px-3 py-2">
        <CustomerAutocomplete
          value={customer}
          onChange={(v) => {
            setCustomer(v);
            setContract("");
          }}
          onKeyDown={handleKeyDown}
          inputClassName={smallInputCls}
        />
      </td>
      {/* Contract */}
      <td className="px-3 py-2">
        {contracts.length > 0 && (
          <select
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            className={smallInputCls}
          >
            <option value="">---</option>
            {contracts.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </td>
      {/* Task */}
      <td className="px-3 py-2">
        <TaskAutocomplete
          taskId={taskId}
          value={taskTitle}
          onChange={setTaskTitle}
          onSelect={(id, label) => {
            setTaskId(id);
            setTaskTitle(label);
          }}
          onClear={() => {
            setTaskId(null);
            setTaskTitle("");
          }}
          customer={customer}
          inputClassName={smallInputCls}
          onKeyDown={handleKeyDown}
        />
      </td>
      {/* Description (placeholder) */}
      <td></td>
      {/* Duration + actions */}
      <td className="px-3 py-2 text-right">
        <div className="flex items-center gap-1 justify-end">
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="h"
            className={`${smallInputCls} w-16 tabular-nums`}
            type="number"
            step="0.25"
            min="0"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-stone-600 hover:text-stone-900"
          >
            <X size={13} />
          </button>
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="p-1 rounded text-cta hover:bg-cta-muted disabled:opacity-40"
          >
            <Check size={13} />
          </button>
        </div>
      </td>
    </tr>
    {/* Description row */}
    <tr className="bg-surface-raised/40 border-b border-border-subtle">
      <td colSpan={7} className="px-3 pb-2">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.metaKey || e.ctrlKey)
            ) {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Description"
          rows={2}
          className={`${smallInputCls} w-full resize-y`}
        />
      </td>
    </tr>
    </>
  );
}

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

interface EntryRowProps {
  entry: ClockEntry;
  tasks: Task[];
}

function EntryRow({ entry, tasks }: EntryRowProps) {
  const [mode, setMode] = useState<"view" | "edit">(
    "view"
  );
  const remove = useDeleteClockEntry();
  const duplicate = useQuickBook();
  const setView = useSetView();
  const taskTitle = taskTitleById(tasks, entry.task_id);

  function handleDuplicate() {
    const mins = entry.duration_minutes ?? 0;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const dur = h > 0 && m > 0
      ? `${h}h${m}min`
      : h > 0 ? `${h}h` : `${m}min`;
    duplicate.mutate({
      duration: dur,
      customer: entry.customer,
      description: entry.description,
      contract: entry.contract ?? undefined,
      taskId: entry.task_id ?? undefined,
    });
  }

  if (mode === "edit") {
    return (
      <EditForm
        entry={entry}
        onClose={() => setMode("view")}
      />
    );
  }

  return (
    <tr
      className={
        "group hover:bg-surface-raised/30 " +
        "border-b border-border-subtle last:border-0"
      }
    >
      <td
        className={
          "px-3 py-1.5 text-xs font-mono " +
          "whitespace-nowrap"
        }
      >
        <button
          onClick={() =>
            navigateToClockDate(entry.start.slice(0, 10))
          }
          className="text-stone-600 hover:text-cta transition-colors"
        >
          {formatDate(entry.start)}
        </button>
      </td>
      <td
        className={
          "px-3 py-1.5 text-xs text-stone-600 " +
          "whitespace-nowrap"
        }
      >
        {formatTime(entry.start)}–
        {formatTime(entry.end)}
      </td>
      <td className="px-3 py-1.5 text-xs whitespace-nowrap">
        <button
          onClick={() => setView("customers", entry.customer)}
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-cta-muted text-cta-hover hover:bg-cta/20 transition-colors"
        >
          {entry.customer}
        </button>
      </td>
      <td className="px-3 py-1.5 text-xs whitespace-nowrap max-w-28 truncate">
        {entry.contract && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] bg-surface-overlay text-stone-700"
            title={entry.contract}
          >
            {entry.contract}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 text-xs whitespace-nowrap max-w-32 truncate">
        {taskTitle && (
          <button
            onClick={() => setView("board", taskTitle ?? "")}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cta-muted text-cta hover:bg-cta/20 transition-colors"
            title={taskTitle}
          >
            {taskTitle}
          </button>
        )}
      </td>
      <td className="px-3 py-1.5 text-xs text-stone-700 w-full">
        <span className="inline-flex items-center gap-1">
          {entry.description}
          {entry.description.length > 40 && (
            <ContentPopup
              content={entry.description}
            />
          )}
        </span>
      </td>
      <td className="px-3 py-1.5 text-xs text-stone-700 tabular-nums whitespace-nowrap text-right">
        <span className="mr-2">{formatHours(entry.duration_minutes)}</span>
        <span className="inline-flex gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={() => setMode("edit")}
            className="p-0.5 rounded text-stone-600 hover:text-stone-900"
            title="Edit"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={handleDuplicate}
            disabled={duplicate.isPending}
            className="p-0.5 rounded text-stone-600 hover:text-cta disabled:opacity-40"
            title="Duplicate for today"
          >
            <Copy size={11} />
          </button>
          <ConfirmPopover
            onConfirm={() => remove.mutate(entry.start)}
            disabled={remove.isPending}
          >
            <button
              disabled={remove.isPending}
              className="p-0.5 rounded text-stone-600 hover:text-red-400 disabled:opacity-40"
              title="Delete"
            >
              <Trash2 size={11} />
            </button>
          </ConfirmPopover>
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Sortable column header
// ---------------------------------------------------------------------------

const thCls = [
  "px-3 py-2 text-[10px] font-semibold uppercase",
  "tracking-wider text-stone-600 select-none",
  "cursor-pointer hover:text-stone-900 transition-colors",
].join(" ");

function SortTh({
  label,
  col,
  sort,
  onSort,
  align,
}: {
  label: string;
  col: SortCol;
  sort: SortState;
  onSort: (col: SortCol) => void;
  align?: "right";
}) {
  const active = sort.col === col;
  const Icon = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`${thCls}${
        align === "right" ? " text-right" : ""
      }`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && (
          <Icon
            size={10}
            className="text-cta"
            strokeWidth={2.5}
          />
        )}
      </span>
    </th>
  );
}

function sortValue(
  entry: ClockEntry,
  col: SortCol,
  tasks: Task[],
): string | number {
  switch (col) {
    case "date":
      return entry.start;
    case "time":
      return entry.start;
    case "customer":
      return entry.customer.toLowerCase();
    case "contract":
      return (entry.contract ?? "").toLowerCase();
    case "task":
      return (
        taskTitleById(tasks, entry.task_id) ?? ""
      ).toLowerCase();
    case "description":
      return entry.description.toLowerCase();
    case "duration":
      return entry.duration_minutes ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function ClockView() {
  const [period, setPeriod] = useState<Period>("week");
  const [specificDate, setSpecificDate] = useState("");
  const [search, setSearch] = useState("");
  const [booking, setBooking] = useState(false);
  const [sort, setSort] = useState<SortState>({
    col: "date",
    dir: "desc",
  });

  function toggleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "desc" },
    );
  }
  const { data: entries = [], isLoading } = useClockEntries(
    period,
    specificDate || undefined
  );
  const { data: tasks = [] } = useTasks(true);
  const { pendingSearch, clearPendingSearch } = usePendingSearch();

  useEffect(
    () => registerPanelAction("clocks", () => setBooking(true)),
    []
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
          e.customer.toLowerCase().includes(search.toLowerCase()) ||
          e.description.toLowerCase().includes(search.toLowerCase())
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
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border-subtle shrink-0 flex-wrap">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-700">
          Clock Entries
        </h1>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search customer / description…"
          inputClassName={`${inputCls} w-52 pr-6`}
          className="w-52"
        />
        <select
          className={`${inputCls} w-28`}
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
          className={`${inputCls} w-36`}
          value={specificDate}
          title="Filter by specific date"
          onChange={(e) => setSpecificDate(e.target.value)}
        />
        {!isLoading && filtered.length > 0 && (
          <span className="text-xs text-stone-600">
            {filtered.length} entries · {totalHours(filtered)}h
          </span>
        )}
        {!isLoading && sorted.length > 0 && (
          <>
            <button
              onClick={() =>
                exportClocksCsv(
                  sorted,
                  `clock-entries-${period}.csv`
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
                  `clock-entries-${period}.xls`
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
          className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded bg-cta-muted text-cta text-xs font-semibold hover:bg-cta hover:text-white transition-colors"
        >
          <Plus size={11} />
          Book
        </button>
        <HelpButton title="Clock Entries" doc={DOCS.clocks} view="clocks" />
      </div>

      {/* Quick-book form */}
      {booking && <BookForm onClose={() => setBooking(false)} />}

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-sm text-stone-500 text-center py-8">Loading…</p>
        )}
        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-stone-500 text-center py-8">
            No entries found.
          </p>
        )}
        {sorted.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left sticky top-0 bg-surface-card z-10">
                <SortTh label="Date" col="date"
                  sort={sort} onSort={toggleSort} />
                <SortTh label="Time" col="time"
                  sort={sort} onSort={toggleSort} />
                <SortTh label="Customer" col="customer"
                  sort={sort} onSort={toggleSort} />
                <SortTh label="Contract" col="contract"
                  sort={sort} onSort={toggleSort} />
                <SortTh label="Task" col="task"
                  sort={sort} onSort={toggleSort} />
                <SortTh label="Description"
                  col="description"
                  sort={sort} onSort={toggleSort} />
                <SortTh label="Duration" col="duration"
                  sort={sort} onSort={toggleSort}
                  align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, idx) => (
                <EntryRow
                  key={`${entry.start}-${idx}`}
                  entry={entry}
                  tasks={tasks}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
