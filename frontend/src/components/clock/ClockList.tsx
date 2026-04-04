import { Pencil, Play, SquareArrowUp, Trash2, X, Check } from "lucide-react";
import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { useTodayEntries, useUpdateClockEntry, useDeleteClockEntry } from "../../hooks/useClocks";
import { useAddTimeEntry } from "../../hooks/useCustomers";
import type { ClockEntry } from "../../types";

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "…";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function minutesToHours(minutes: number | null): string {
  if (minutes === null) return "";
  return (minutes / 60).toFixed(2).replace(/\.?0+$/, "");
}

type Mode = "view" | "edit" | "book";

interface EntryRowProps {
  entry: ClockEntry;
  onReuse?: (entry: ClockEntry) => void;
}

function EntryRow({ entry, onReuse }: EntryRowProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [editDesc, setEditDesc] = useState("");
  const [editHours, setEditHours] = useState("");
  const [bookCustomer, setBookCustomer] = useState("");
  const [bookDesc, setBookDesc] = useState("");
  const [bookHours, setBookHours] = useState("");
  const updateEntry = useUpdateClockEntry();
  const deleteEntry = useDeleteClockEntry();
  const addTimeEntry = useAddTimeEntry();

  function startEdit() {
    setEditDesc(entry.description);
    setEditHours(minutesToHours(entry.duration_minutes));
    setMode("edit");
  }

  function startBook() {
    setBookCustomer(entry.customer);
    setBookDesc(entry.description);
    setBookHours(minutesToHours(entry.duration_minutes));
    setMode("book");
  }

  function handleSaveEdit() {
    const updates: { description?: string; hours?: number } = {};
    if (editDesc.trim() !== entry.description) {
      updates.description = editDesc.trim();
    }
    const h = parseFloat(editHours);
    if (!isNaN(h) && h > 0) {
      updates.hours = h;
    }
    if (Object.keys(updates).length === 0) {
      setMode("view");
      return;
    }
    updateEntry.mutate(
      { startIso: entry.start, updates },
      { onSuccess: () => setMode("view") }
    );
  }

  function handleBook() {
    const h = parseFloat(bookHours);
    if (!bookCustomer.trim() || isNaN(h) || h <= 0) return;
    addTimeEntry.mutate(
      {
        customerName: bookCustomer.trim(),
        description: bookDesc.trim(),
        hours: h,
      },
      { onSuccess: () => setMode("view") }
    );
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSaveEdit();
    if (e.key === "Escape") setMode("view");
  }

  function handleBookKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleBook();
    if (e.key === "Escape") setMode("view");
  }

  if (mode === "edit") {
    return (
      <div className="py-2.5 border-b border-border-subtle last:border-0">
        <div className="flex flex-col gap-1.5">
          <input
            autoFocus
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            onKeyDown={handleEditKeyDown}
            placeholder="Description"
            className={inputCls}
          />
          <input
            value={editHours}
            onChange={(e) => setEditHours(e.target.value)}
            onKeyDown={handleEditKeyDown}
            placeholder="Hours (e.g. 1.5)"
            className={inputCls}
          />
          <div className="flex gap-1 justify-end">
            <button
              onClick={() => setMode("view")}
              className="p-1 rounded text-slate-600 hover:text-slate-300"
            >
              <X size={11} />
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={updateEntry.isPending}
              className="p-1 rounded text-accent hover:bg-accent-muted disabled:opacity-40"
            >
              <Check size={11} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "book") {
    return (
      <div className="py-2.5 border-b border-border-subtle last:border-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
          Book to project
        </p>
        <div className="flex flex-col gap-1.5">
          <CustomerAutocomplete
            autoFocus
            value={bookCustomer}
            onChange={setBookCustomer}
            onKeyDown={handleBookKeyDown}
            inputClassName={inputCls}
          />
          <input
            value={bookDesc}
            onChange={(e) => setBookDesc(e.target.value)}
            onKeyDown={handleBookKeyDown}
            placeholder="Description"
            className={inputCls}
          />
          <input
            value={bookHours}
            onChange={(e) => setBookHours(e.target.value)}
            onKeyDown={handleBookKeyDown}
            placeholder="Hours (e.g. 1.5)"
            className={inputCls}
          />
          <div className="flex gap-1 justify-end">
            <button
              onClick={() => setMode("view")}
              className="p-1 rounded text-slate-600 hover:text-slate-300"
            >
              <X size={11} />
            </button>
            <button
              onClick={handleBook}
              disabled={
                addTimeEntry.isPending ||
                !bookCustomer.trim() ||
                isNaN(parseFloat(bookHours)) ||
                parseFloat(bookHours) <= 0
              }
              className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
            >
              <Check size={11} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-300 truncate">
          {entry.customer}
        </p>
        <p className="text-[11px] text-slate-600 truncate mt-0.5">
          {entry.description}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {onReuse && (
          <button
            onClick={() => onReuse(entry)}
            className="p-0.5 rounded text-slate-700 hover:text-accent hover:bg-accent-muted transition-colors opacity-0 group-hover:opacity-100"
            title="Reuse"
          >
            <Play size={10} />
          </button>
        )}
        <button
          onClick={startBook}
          className="p-0.5 rounded text-slate-700 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors opacity-0 group-hover:opacity-100"
          title="Book to project"
        >
          <SquareArrowUp size={10} />
        </button>
        <button
          onClick={startEdit}
          className="p-0.5 rounded text-slate-700 hover:text-accent hover:bg-accent-muted transition-colors opacity-0 group-hover:opacity-100"
          title="Edit"
        >
          <Pencil size={10} />
        </button>
        <button
          onClick={() => deleteEntry.mutate(entry.start)}
          disabled={deleteEntry.isPending}
          className="p-0.5 rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
          title="Delete"
        >
          <Trash2 size={10} />
        </button>
        <span className="text-[11px] font-semibold text-slate-500 tabular-nums ml-1">
          {formatDuration(entry.duration_minutes)}
        </span>
      </div>
    </div>
  );
}

interface ClockListProps {
  onReuse?: (entry: ClockEntry) => void;
}

export function ClockList({ onReuse }: ClockListProps) {
  const { data: entries = [], isLoading } = useTodayEntries();

  const totalMin = entries.reduce(
    (sum, e) => sum + (e.duration_minutes ?? 0),
    0
  );
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;

  if (isLoading) {
    return (
      <p className="text-xs text-slate-700 text-center py-4">
        Loading…
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-xs text-slate-700 text-center py-4">
        No entries today
      </p>
    );
  }

  return (
    <div>
      {entries.map((entry, i) => (
        <EntryRow key={i} entry={entry} onReuse={onReuse} />
      ))}
      <div className="flex justify-between pt-2 mt-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          Total today
        </span>
        <span className="text-[11px] font-semibold text-slate-400 tabular-nums">
          {totalH}h {totalM}m
        </span>
      </div>
    </div>
  );
}

const inputCls = [
  "w-full px-2 py-1 rounded text-xs",
  "bg-surface-raised border border-border",
  "text-slate-200 placeholder-slate-600",
  "focus:outline-none focus:border-accent",
].join(" ");
