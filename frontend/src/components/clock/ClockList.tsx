import { Check, Pencil, RotateCw, SquareArrowUp, Trash2, X } from "lucide-react";
import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import {
  useDeleteClockEntry,
  useStartTimer,
  useTodayEntries,
  useUpdateClockEntry,
} from "../../hooks/useClocks";
import { useAddTimeEntry } from "../../hooks/useCustomers";
import type { ClockEntry } from "../../types";

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function minutesToHours(minutes: number | null): string {
  if (minutes === null) return "";
  return (minutes / 60).toFixed(2).replace(/\.?0+$/, "");
}

function timeLabel(iso: string | null): string {
  if (!iso) return "…";
  return iso.slice(11, 16);
}

interface TaskGroup {
  customer: string;
  description: string;
  entries: ClockEntry[];
  totalMinutes: number;
}

function groupEntries(entries: ClockEntry[]): TaskGroup[] {
  const map = new Map<string, TaskGroup>();
  for (const entry of entries) {
    const key = `${entry.customer}|${entry.description}`;
    if (!map.has(key)) {
      map.set(key, {
        customer: entry.customer,
        description: entry.description,
        entries: [],
        totalMinutes: 0,
      });
    }
    const group = map.get(key)!;
    group.entries.push(entry);
    group.totalMinutes += entry.duration_minutes ?? 0;
  }
  return Array.from(map.values());
}

// --- Individual slot row (edit/delete per clock stamp) ---

interface SlotRowProps {
  entry: ClockEntry;
}

function SlotRow({ entry }: SlotRowProps) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editDesc, setEditDesc] = useState("");
  const [editHours, setEditHours] = useState("");
  const updateEntry = useUpdateClockEntry();
  const deleteEntry = useDeleteClockEntry();

  function startEdit() {
    setEditDesc(entry.description);
    setEditHours(minutesToHours(entry.duration_minutes));
    setMode("edit");
  }

  function handleSave() {
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setMode("view");
  }

  if (mode === "edit") {
    return (
      <div className="pl-3 pt-1 pb-1.5 flex flex-col gap-1">
        <input
          autoFocus
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Description"
          className={inputCls}
        />
        <input
          value={editHours}
          onChange={(e) => setEditHours(e.target.value)}
          onKeyDown={handleKeyDown}
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
            onClick={handleSave}
            disabled={updateEntry.isPending}
            className="p-1 rounded text-accent hover:bg-accent-muted disabled:opacity-40"
          >
            <Check size={11} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/slot flex items-center gap-2 pl-3 py-0.5">
      <span className="text-[10px] font-mono text-slate-600 tabular-nums">
        {timeLabel(entry.start)}–{timeLabel(entry.end)}
      </span>
      <span className="text-[10px] text-slate-600 tabular-nums ml-auto">
        {entry.duration_minutes !== null
          ? formatDuration(entry.duration_minutes)
          : "…"}
      </span>
      <button
        onClick={startEdit}
        className={actionBtn}
        title="Edit"
      >
        <Pencil size={10} />
      </button>
      <button
        onClick={() => deleteEntry.mutate(entry.start)}
        disabled={deleteEntry.isPending}
        className={[actionBtn, "hover:text-red-400 hover:bg-red-500/10"].join(" ")}
        title="Delete"
      >
        <Trash2 size={10} />
      </button>
    </div>
  );
}

// --- Group row (resume/book per task) ---

interface TaskGroupRowProps {
  group: TaskGroup;
  isRunning: boolean;
}

function TaskGroupRow({ group, isRunning }: TaskGroupRowProps) {
  const [mode, setMode] = useState<"view" | "book">("view");
  const [bookCustomer, setBookCustomer] = useState("");
  const [bookDesc, setBookDesc] = useState("");
  const [bookHours, setBookHours] = useState("");
  const resumeTimer = useStartTimer();
  const addTimeEntry = useAddTimeEntry();

  function startBook() {
    setBookCustomer(group.customer);
    setBookDesc(group.description);
    setBookHours(minutesToHours(group.totalMinutes));
    setMode("book");
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

  function handleBookKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleBook();
    if (e.key === "Escape") setMode("view");
  }

  return (
    <div className="border-b border-border-subtle last:border-0 py-2">
      {/* Header */}
      <div className="group flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-300 truncate">
            {group.customer}
          </p>
          <p className="text-[11px] text-slate-600 truncate mt-0.5">
            {group.description}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() =>
              resumeTimer.mutate({
                customer: group.customer,
                description: group.description,
              })
            }
            disabled={isRunning || resumeTimer.isPending}
            className={[
              actionBtn,
              "opacity-0 group-hover:opacity-100",
              "disabled:cursor-not-allowed",
            ].join(" ")}
            title="Resume"
          >
            <RotateCw size={10} />
          </button>
          <button
            onClick={startBook}
            className={[
              actionBtn,
              "hover:text-emerald-400 hover:bg-emerald-500/10",
              "opacity-0 group-hover:opacity-100",
            ].join(" ")}
            title="Book to project"
          >
            <SquareArrowUp size={10} />
          </button>
          <span className="text-[11px] font-semibold text-slate-500 tabular-nums ml-1">
            {formatDuration(group.totalMinutes)}
          </span>
        </div>
      </div>

      {/* Slots */}
      <div className="mt-0.5">
        {group.entries.map((entry) => (
          <SlotRow key={entry.start} entry={entry} />
        ))}
      </div>

      {/* Book form */}
      {mode === "book" && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            Book to project
          </p>
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
      )}
    </div>
  );
}

// --- List ---

interface ClockListProps {
  isRunning: boolean;
}

export function ClockList({ isRunning }: ClockListProps) {
  const { data: entries = [], isLoading } = useTodayEntries();

  const groups = groupEntries(entries);
  const totalMin = groups.reduce((sum, g) => sum + g.totalMinutes, 0);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;

  if (isLoading) {
    return (
      <p className="text-xs text-slate-700 text-center py-4">Loading…</p>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="text-xs text-slate-700 text-center py-4">
        No entries today
      </p>
    );
  }

  return (
    <div>
      {groups.map((group) => (
        <TaskGroupRow
          key={`${group.customer}|${group.description}`}
          group={group}
          isRunning={isRunning}
        />
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

const actionBtn = [
  "p-0.5 rounded text-slate-700",
  "hover:text-accent hover:bg-accent-muted",
  "transition-colors",
].join(" ");
