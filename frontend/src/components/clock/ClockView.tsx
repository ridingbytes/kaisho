import { Check, Pencil, Plus, SquareArrowUp, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import {
  useClockEntries,
  useDeleteClockEntry,
  useQuickBook,
  useUpdateClockEntry,
} from "../../hooks/useClocks";
import { useAddTimeEntry } from "../../hooks/useCustomers";
import { registerPanelAction } from "../../utils/panelActions";
import type { ClockEntry } from "../../types";

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
  const [description, setDescription] = useState("");
  const book = useQuickBook();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!duration.trim() || !customer.trim() || !description.trim()) return;
    book.mutate(
      {
        duration: duration.trim(),
        customer: customer.trim(),
        description: description.trim(),
      },
      {
        onSuccess: () => {
          setDuration("");
          setCustomer("");
          setDescription("");
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
          onChange={setCustomer}
          inputClassName={inputCls}
          className="w-44"
        />
      </div>
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
// Book-to-project inline form (copy clock time to customer time entry)
// ---------------------------------------------------------------------------

interface BookProjectFormProps {
  entry: ClockEntry;
  onClose: () => void;
}

function BookProjectForm({ entry, onClose }: BookProjectFormProps) {
  const [customer, setCustomer] = useState(entry.customer);
  const [description, setDescription] = useState(entry.description);
  const [hours, setHours] = useState(minutesToDecimal(entry.duration_minutes));
  const addTimeEntry = useAddTimeEntry();

  function handleBook() {
    const h = parseFloat(hours);
    if (!customer.trim() || isNaN(h) || h <= 0) return;
    addTimeEntry.mutate(
      {
        customerName: customer.trim(),
        description: description.trim(),
        hours: h,
      },
      { onSuccess: onClose }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleBook();
    if (e.key === "Escape") onClose();
  }

  const valid =
    customer.trim() && !isNaN(parseFloat(hours)) && parseFloat(hours) > 0;

  return (
    <tr className="bg-emerald-950/20 border-b border-border-subtle">
      <td colSpan={5} className="px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1.5">
          Book to project
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <CustomerAutocomplete
            autoFocus
            value={customer}
            onChange={setCustomer}
            onKeyDown={handleKeyDown}
            inputClassName={smallInputCls}
            className="w-44"
          />
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
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-300"
          >
            <X size={13} />
          </button>
          <button
            onClick={handleBook}
            disabled={addTimeEntry.isPending || !valid}
            className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
            title="Book to project"
          >
            <Check size={13} />
          </button>
        </div>
        {addTimeEntry.isError && (
          <p className="text-xs text-red-400 mt-1">
            {(addTimeEntry.error as Error).message}
          </p>
        )}
      </td>
    </tr>
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
  const [customer, setCustomer] = useState(entry.customer);
  const [description, setDescription] = useState(entry.description);
  const [hours, setHours] = useState(minutesToDecimal(entry.duration_minutes));
  const update = useUpdateClockEntry();

  function handleSave() {
    const updates: {
      customer?: string;
      description?: string;
      hours?: number;
      new_date?: string;
    } = {};
    if (entryDate !== formatDate(entry.start)) updates.new_date = entryDate;
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
    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }
    update.mutate({ startIso: entry.start, updates }, { onSuccess: onClose });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onClose();
  }

  return (
    <tr className="bg-surface-raised/40 border-b border-border-subtle">
      <td colSpan={5} className="px-3 py-2">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            autoFocus
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`${smallInputCls} w-32`}
          />
          <CustomerAutocomplete
            value={customer}
            onChange={setCustomer}
            onKeyDown={handleKeyDown}
            inputClassName={smallInputCls}
            className="w-44"
          />
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
}

function EntryRow({ entry }: EntryRowProps) {
  const [mode, setMode] = useState<"view" | "edit" | "book">("view");
  const remove = useDeleteClockEntry();

  if (mode === "edit") {
    return <EditForm entry={entry} onClose={() => setMode("view")} />;
  }

  if (mode === "book") {
    return <BookProjectForm entry={entry} onClose={() => setMode("view")} />;
  }

  return (
    <tr className="group hover:bg-surface-raised/30 border-b border-border-subtle last:border-0">
      <td className="px-3 py-1.5 text-xs font-mono text-slate-500 whitespace-nowrap">
        {formatDate(entry.start)}
      </td>
      <td className="px-3 py-1.5 text-xs text-slate-500 whitespace-nowrap">
        {formatTime(entry.start)}–{formatTime(entry.end)}
      </td>
      <td className="px-3 py-1.5 text-xs text-slate-300 font-medium whitespace-nowrap">
        {entry.customer}
      </td>
      <td className="px-3 py-1.5 text-xs text-slate-400 w-full">
        {entry.description}
      </td>
      <td className="px-3 py-1.5 text-xs text-slate-400 tabular-nums whitespace-nowrap text-right">
        <span className="mr-2">{formatHours(entry.duration_minutes)}</span>
        <span className="inline-flex gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={() => setMode("book")}
            className="p-0.5 rounded text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10"
            title="Book to project"
          >
            <SquareArrowUp size={11} />
          </button>
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
  const [search, setSearch] = useState("");
  const [booking, setBooking] = useState(false);
  const { data: entries = [], isLoading } = useClockEntries(period);

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
          onChange={(e) => setPeriod(e.target.value as Period)}
        >
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>
        {!isLoading && filtered.length > 0 && (
          <span className="text-xs text-slate-500">
            {filtered.length} entries · {totalHours(filtered)}h
          </span>
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
                  Description
                </th>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <EntryRow key={entry.start} entry={entry} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
