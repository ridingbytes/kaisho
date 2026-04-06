import {
  Check,
  Download,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { registerPanelAction } from "../../utils/panelActions";
import { useSetView } from "../../context/ViewContext";
import type { ClockEntry, Task } from "../../types";

type Period = "today" | "week" | "month";

const inputCls =
  "bg-surface-raised border border-border rounded px-2 py-1 text-sm " +
  "text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent";

const smallInputCls =
  "bg-surface-raised border border-border rounded px-2 py-1 text-xs " +
  "text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent";

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
  return iso.slice(0, 10);
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(11, 16);
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
  const { data: contracts = [] } = useContracts(customer || null);
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
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
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
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
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
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">
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
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
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
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
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
          className="px-3 py-1.5 rounded bg-accent text-white text-xs font-semibold disabled:opacity-40"
        >
          {book.isPending ? "Booking…" : "Book"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded bg-surface-raised text-slate-400 text-xs"
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
  const [entryDate, setEntryDate] = useState(formatDate(entry.start));
  const [startTime, setStartTime] = useState(
    entry.start ? entry.start.slice(11, 16) : ""
  );
  const [customer, setCustomer] = useState(entry.customer);
  const [contract, setContract] = useState(entry.contract ?? "");
  const [description, setDescription] = useState(entry.description);
  const [hours, setHours] = useState(minutesToDecimal(entry.duration_minutes));
  const [taskId, setTaskId] = useState<string | null>(entry.task_id);
  const { data: tasks = [] } = useTasks();
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
    const origDate = formatDate(entry.start);
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
    <tr className="bg-surface-raised/40 border-b border-border-subtle">
      <td colSpan={7} className="px-3 py-2">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            autoFocus
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`${smallInputCls} w-32`}
          />
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`${smallInputCls} w-24`}
            title="Start time"
          />
          <CustomerAutocomplete
            value={customer}
            onChange={(v) => {
              setCustomer(v);
              setContract("");
            }}
            onKeyDown={handleKeyDown}
            inputClassName={smallInputCls}
            className="w-44"
          />
          {contracts.length > 0 && (
            <select
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              className={`${smallInputCls} w-36`}
            >
              <option value="">— no contract —</option>
              {contracts.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}{c.end_date ? " (closed)" : ""}
                </option>
              ))}
            </select>
          )}
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Description"
            className={`${smallInputCls} flex-1 min-w-32`}
          />
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Hours"
            className={`${smallInputCls} w-20`}
            type="number"
            step="0.25"
            min="0"
          />
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
            className="w-48"
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-300"
          >
            <X size={13} />
          </button>
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="p-1 rounded text-accent hover:bg-accent-muted disabled:opacity-40"
          >
            <Check size={13} />
          </button>
        </div>
      </td>
    </tr>
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
  const setView = useSetView();
  const taskTitle = taskTitleById(tasks, entry.task_id);

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
          "text-slate-500 whitespace-nowrap"
        }
      >
        {formatDate(entry.start)}
      </td>
      <td
        className={
          "px-3 py-1.5 text-xs text-slate-500 " +
          "whitespace-nowrap"
        }
      >
        {formatTime(entry.start)}–
        {formatTime(entry.end)}
      </td>
      <td className="px-3 py-1.5 text-xs whitespace-nowrap">
        <button
          onClick={() => setView("customers")}
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-accent-muted text-accent-hover hover:bg-accent/20 transition-colors"
        >
          {entry.customer}
        </button>
      </td>
      <td className="px-3 py-1.5 text-xs whitespace-nowrap max-w-28 truncate">
        {entry.contract && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] bg-surface-overlay text-slate-400"
            title={entry.contract}
          >
            {entry.contract}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 text-xs whitespace-nowrap max-w-32 truncate">
        {taskTitle && (
          <button
            onClick={() => setView("board")}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-muted text-accent hover:bg-accent/20 transition-colors"
            title={taskTitle}
          >
            {taskTitle}
          </button>
        )}
      </td>
      <td className="px-3 py-1.5 text-xs text-slate-400 w-full">
        <span className="inline-flex items-center gap-1">
          {entry.description}
          {entry.description.length > 40 && (
            <ContentPopup
              content={entry.description}
            />
          )}
        </span>
      </td>
      <td className="px-3 py-1.5 text-xs text-slate-400 tabular-nums whitespace-nowrap text-right">
        <span className="mr-2">{formatHours(entry.duration_minutes)}</span>
        <span className="inline-flex gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={() => setMode("edit")}
            className="p-0.5 rounded text-slate-500 hover:text-slate-200"
            title="Edit"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={() => remove.mutate(entry.start)}
            disabled={remove.isPending}
            className="p-0.5 rounded text-slate-500 hover:text-red-400 disabled:opacity-40"
            title="Delete"
          >
            <Trash2 size={11} />
          </button>
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function ClockView() {
  const [period, setPeriod] = useState<Period>("week");
  const [specificDate, setSpecificDate] = useState("");
  const [search, setSearch] = useState("");
  const [booking, setBooking] = useState(false);
  const { data: entries = [], isLoading } = useClockEntries(
    period,
    specificDate || undefined
  );
  const { data: tasks = [] } = useTasks();

  useEffect(
    () => registerPanelAction("clocks", () => setBooking(true)),
    []
  );

  const filtered = search
    ? entries.filter(
        (e) =>
          e.customer.toLowerCase().includes(search.toLowerCase()) ||
          e.description.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  const sorted = [...filtered].sort(
    (a, b) => b.start.localeCompare(a.start)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border-subtle shrink-0 flex-wrap">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Clock Entries
        </h1>
        <input
          className={`${inputCls} w-52`}
          placeholder="Search customer / description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
        </select>
        <input
          type="date"
          className={`${inputCls} w-36`}
          value={specificDate}
          title="Filter by specific date"
          onChange={(e) => setSpecificDate(e.target.value)}
        />
        {!isLoading && filtered.length > 0 && (
          <span className="text-xs text-slate-500">
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
                "rounded text-[11px] text-slate-400 " +
                "hover:text-accent hover:bg-accent-muted " +
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
                "rounded text-[11px] text-slate-400 " +
                "hover:text-accent hover:bg-accent-muted " +
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
          className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded bg-accent-muted text-accent text-xs font-semibold hover:bg-accent hover:text-white transition-colors"
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
          <p className="text-sm text-slate-600 text-center py-8">Loading…</p>
        )}
        {!isLoading && sorted.length === 0 && (
          <p className="text-sm text-slate-600 text-center py-8">
            No entries found.
          </p>
        )}
        {sorted.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left sticky top-0 bg-surface-card z-10">
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Date
                </th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Time
                </th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Customer
                </th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Contract
                </th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Task
                </th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Description
                </th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <EntryRow
                  key={entry.start}
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
