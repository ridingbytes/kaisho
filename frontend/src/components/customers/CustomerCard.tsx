import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pencil,
  Plus,
  X,
  Check,
} from "lucide-react";
import { useState } from "react";
import {
  useUpdateCustomer,
  useTimeEntries,
  useAddTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
} from "../../hooks/useCustomers";
import { useTodayEntries } from "../../hooks/useClocks";
import type { Customer, TimeEntry, ClockEntry } from "../../types";

function usedColor(usedPercent: number): string {
  if (usedPercent >= 100) return "#ef4444";
  if (usedPercent >= 80) return "#f59e0b";
  return "#10b981";
}

const STATUS_OPTIONS = ["active", "inactive", "archiv"];

interface Props {
  customer: Customer;
}

interface EditState {
  name: string;
  status: string;
  kontingent: string;
  repo: string;
}

function toEditState(c: Customer): EditState {
  return {
    name: c.name,
    status: c.status,
    kontingent: String(c.kontingent),
    repo: c.repo ?? "",
  };
}

function fieldClass(base = "") {
  return [
    "w-full px-2 py-1 rounded-md text-xs",
    "bg-surface-overlay border border-border",
    "text-slate-200 placeholder-slate-600",
    "focus:outline-none focus:border-accent",
    base,
  ].join(" ");
}

interface AddEntryFormProps {
  customerName: string;
  initialDescription?: string;
  initialHours?: string;
  onDone: () => void;
}

function AddEntryForm({
  customerName,
  initialDescription = "",
  initialHours = "",
  onDone,
}: AddEntryFormProps) {
  const [description, setDescription] = useState(initialDescription);
  const [hours, setHours] = useState(initialHours);
  const [entryDate, setEntryDate] = useState("");
  const addEntry = useAddTimeEntry();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const h = parseFloat(hours);
    if (!description.trim() || isNaN(h)) return;
    addEntry.mutate(
      {
        customerName,
        description: description.trim(),
        hours: h,
        date: entryDate || undefined,
      },
      { onSuccess: onDone }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-1.5 mt-2 p-2 rounded-lg bg-surface-overlay border border-border"
    >
      <input
        autoFocus
        type="text"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={fieldClass()}
      />
      <div className="flex gap-1">
        <input
          type="number"
          placeholder="Hours"
          min="0"
          step="0.25"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className={fieldClass("flex-1 tabular-nums")}
        />
        <input
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          className={fieldClass("flex-1")}
        />
      </div>
      <div className="flex gap-1 justify-end">
        <button
          type="button"
          onClick={onDone}
          className="p-1 text-slate-600 hover:text-slate-300 rounded"
        >
          <X size={12} />
        </button>
        <button
          type="submit"
          disabled={
            addEntry.isPending ||
            !description.trim() ||
            !hours.trim()
          }
          className="p-1 text-accent hover:bg-accent-muted rounded disabled:opacity-40"
        >
          <Check size={12} />
        </button>
      </div>
    </form>
  );
}

interface EntryRowProps {
  entry: TimeEntry;
  customerName: string;
  onDelete: (id: string) => void;
}

function EntryRow({ entry, customerName, onDelete }: EntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [hours, setHours] = useState(String(entry.hours));
  const [date, setDate] = useState(entry.date);
  const updateEntry = useUpdateTimeEntry();

  function startEdit() {
    setDesc(entry.description);
    setHours(String(entry.hours));
    setDate(entry.date);
    setEditing(true);
  }

  function handleSave() {
    const h = parseFloat(hours);
    if (!desc.trim() || isNaN(h)) return;
    updateEntry.mutate(
      {
        customerName,
        entryId: entry.id,
        updates: {
          description: desc.trim(),
          hours: h,
          date: date || undefined,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 py-1.5 border-b border-border-subtle last:border-0">
        <input
          autoFocus
          type="text"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={handleKeyDown}
          className={fieldClass()}
        />
        <div className="flex gap-1">
          <input
            type="number"
            min="0"
            step="0.25"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            onKeyDown={handleKeyDown}
            className={fieldClass("flex-1 tabular-nums")}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onKeyDown={handleKeyDown}
            className={fieldClass("flex-1")}
          />
          <button
            onClick={() => setEditing(false)}
            className="p-1 text-slate-600 hover:text-slate-300 rounded shrink-0"
          >
            <X size={11} />
          </button>
          <button
            onClick={handleSave}
            disabled={updateEntry.isPending || !desc.trim()}
            className="p-1 text-accent hover:bg-accent-muted rounded shrink-0 disabled:opacity-40"
          >
            <Check size={11} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 py-1.5 border-b border-border-subtle last:border-0">
      <span className="text-[10px] text-slate-600 shrink-0 w-20 tabular-nums">
        {entry.date}
      </span>
      <span className="text-xs text-slate-300 flex-1 min-w-0 truncate">
        {entry.description}
      </span>
      <span className="text-[10px] font-semibold text-slate-400 tabular-nums shrink-0">
        {entry.hours}h
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={startEdit}
          className="p-0.5 rounded text-slate-700 hover:text-accent hover:bg-accent-muted transition-colors"
          title="Edit"
        >
          <Pencil size={10} />
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          className="p-0.5 rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete"
        >
          <X size={10} />
        </button>
      </div>
    </div>
  );
}

interface ClockPickRowProps {
  entry: ClockEntry;
  onPick: (entry: ClockEntry) => void;
}

function ClockPickRow({ entry, onPick }: ClockPickRowProps) {
  return (
    <button
      onClick={() => onPick(entry)}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-overlay text-left transition-colors"
    >
      <span className="text-xs text-slate-300 flex-1 min-w-0 truncate">
        {entry.description}
      </span>
      <span className="text-[10px] text-slate-600 shrink-0 tabular-nums">
        {entry.duration_minutes !== null
          ? `${(entry.duration_minutes / 60).toFixed(2)}h`
          : "…"}
      </span>
    </button>
  );
}

interface TimeEntriesSectionProps {
  customer: Customer;
}

function TimeEntriesSection({ customer }: TimeEntriesSectionProps) {
  const { data: entries = [] } = useTimeEntries(customer.name);
  const deleteEntry = useDeleteTimeEntry();
  const { data: todayEntries = [] } = useTodayEntries();
  const [adding, setAdding] = useState(false);
  const [showClock, setShowClock] = useState(false);
  const [prefillDescription, setPrefillDescription] = useState("");
  const [prefillHours, setPrefillHours] = useState("");

  function handleDelete(id: string) {
    deleteEntry.mutate({ customerName: customer.name, entryId: id });
  }

  function handleClockPick(entry: ClockEntry) {
    const h =
      entry.duration_minutes !== null
        ? String((entry.duration_minutes / 60).toFixed(2))
        : "";
    setPrefillDescription(entry.description);
    setPrefillHours(h);
    setShowClock(false);
    setAdding(true);
  }

  return (
    <div className="mt-2">
      {entries.map((e) => (
        <EntryRow
          key={e.id}
          entry={e}
          customerName={customer.name}
          onDelete={handleDelete}
        />
      ))}

      {adding ? (
        <AddEntryForm
          customerName={customer.name}
          initialDescription={prefillDescription}
          initialHours={prefillHours}
          onDone={() => {
            setAdding(false);
            setPrefillDescription("");
            setPrefillHours("");
          }}
        />
      ) : (
        <div className="flex gap-1 mt-1.5">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-600 hover:text-accent hover:bg-accent-muted transition-colors"
          >
            <Plus size={10} />
            Add
          </button>
          {todayEntries.length > 0 && (
            <button
              onClick={() => setShowClock((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              From clock
              {showClock ? (
                <ChevronDown size={10} />
              ) : (
                <ChevronRight size={10} />
              )}
            </button>
          )}
        </div>
      )}

      {showClock && !adding && (
        <div className="mt-1.5 p-2 rounded-lg bg-surface-overlay border border-border">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">
            Today&apos;s entries
          </p>
          {todayEntries.map((e, i) => (
            <ClockPickRow key={i} entry={e} onPick={handleClockPick} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomerCard({ customer: c }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>(toEditState(c));
  const [entriesOpen, setEntriesOpen] = useState(false);
  const update = useUpdateCustomer();
  const { data: entries = [] } = useTimeEntries(c.name);

  const hasContingent = c.kontingent > 0;
  const usedPercent = hasContingent
    ? Math.min(
        Math.round(((c.kontingent - c.rest) / c.kontingent) * 100),
        100
      )
    : 0;
  const barColor = usedColor(usedPercent);
  const isArchived = ["inactive", "archiv", "archived"].includes(
    c.status.toLowerCase()
  );

  function startEdit() {
    setForm(toEditState(c));
    setEditing(true);
  }

  function handleSave() {
    update.mutate(
      {
        name: c.name,
        updates: {
          name: form.name.trim() || c.name,
          status: form.status,
          kontingent: parseFloat(form.kontingent) || 0,
          repo: form.repo.trim() || null,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function set(key: keyof EditState) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  return (
    <div
      className={[
        "flex flex-col gap-3 p-5 rounded-xl border transition-colors",
        "bg-surface-card hover:bg-surface-raised",
        isArchived
          ? "border-border-subtle opacity-60"
          : "border-border",
      ].join(" ")}
    >
      {editing ? (
        /* Edit mode */
        <div className="flex flex-col gap-2">
          <input
            className={fieldClass("font-semibold")}
            value={form.name}
            onChange={set("name")}
            placeholder="Name"
            autoFocus
          />

          <select
            className={fieldClass()}
            value={form.status}
            onChange={set("status")}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-600 uppercase tracking-wider">
              Budget h
            </span>
            <input
              type="number"
              min="0"
              step="0.5"
              className={fieldClass("tabular-nums")}
              value={form.kontingent}
              onChange={set("kontingent")}
            />
          </label>

          <input
            className={fieldClass()}
            value={form.repo}
            onChange={set("repo")}
            placeholder="Repo URL"
          />

          <div className="flex gap-2 justify-end mt-1">
            <button
              onClick={() => setEditing(false)}
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-300 transition-colors"
              title="Cancel"
            >
              <X size={14} />
            </button>
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className="p-1.5 rounded-md text-accent hover:bg-accent-muted transition-colors disabled:opacity-40"
              title="Save"
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      ) : (
        /* View mode */
        <>
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-200 truncate">
                {c.name}
              </h3>
              {c.repo && (
                <a
                  href={c.repo}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-slate-600 hover:text-accent mt-0.5 transition-colors"
                >
                  <ExternalLink size={10} />
                  {c.repo.replace(/^https?:\/\//, "").slice(0, 30)}
                </a>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span
                className={[
                  "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                  isArchived
                    ? "bg-slate-500/10 text-slate-600"
                    : "bg-emerald-500/15 text-emerald-400",
                ].join(" ")}
              >
                {c.status}
              </span>
              <button
                onClick={startEdit}
                className="p-1 rounded-md text-slate-700 hover:text-accent hover:bg-accent-muted transition-colors"
                title="Edit"
              >
                <Pencil size={11} />
              </button>
            </div>
          </div>

          {/* Budget bar */}
          {hasContingent ? (
            <>
              <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${usedPercent}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  {c.verbraucht}h used · {c.rest}h left
                </span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: barColor }}
                >
                  {usedPercent}%
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-600">No budget configured</p>
          )}

          {/* Time entries section */}
          <div>
            <button
              onClick={() => setEntriesOpen((v) => !v)}
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-400 transition-colors"
            >
              {entriesOpen ? (
                <ChevronDown size={10} />
              ) : (
                <ChevronRight size={10} />
              )}
              Entries ({entries.length})
            </button>

            {entriesOpen && <TimeEntriesSection customer={c} />}
          </div>
        </>
      )}
    </div>
  );
}
