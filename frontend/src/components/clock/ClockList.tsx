import { Check, Pencil, RotateCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import {
  useClockEntries,
  useDeleteClockEntry,
  useStartTimer,
  useUpdateClockEntry,
} from "../../hooks/useClocks";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import { useContracts } from "../../hooks/useContracts";
import { useTasks } from "../../hooks/useTasks";
import { useSetView } from "../../context/ViewContext";
import type { ClockEntry, Task } from "../../types";

const CUSTOMER_PREFIX_RE = /^\[[^\]]+\]:?\s*/;

function taskTitleById(
  tasks: Task[],
  id: string | null
): string {
  if (!id) return "";
  const t = tasks.find((t) => t.id === id);
  return t ? t.title.replace(CUSTOMER_PREFIX_RE, "") : "";
}

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

// --- Contract selector for a given customer ---

function ContractSelect({
  customer,
  value,
  onChange,
}: {
  customer: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: contracts = [] } = useContracts(customer || null);
  if (!customer || contracts.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      <option value="">— no contract —</option>
      {contracts.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
          {c.end_date ? " (closed)" : ""}
        </option>
      ))}
    </select>
  );
}

// --- Individual slot row (edit/delete per clock stamp) ---

interface SlotRowProps {
  entry: ClockEntry;
  tasks: Task[];
}

function SlotRow({ entry, tasks }: SlotRowProps) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editCustomer, setEditCustomer] = useState("");
  const setView = useSetView();
  const [editContract, setEditContract] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editHours, setEditHours] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTaskId, setEditTaskId] = useState<string | null>(
    null
  );
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const updateEntry = useUpdateClockEntry();
  const deleteEntry = useDeleteClockEntry();

  function startEdit() {
    setEditCustomer(entry.customer);
    setEditContract(entry.contract ?? "");
    setEditDesc(entry.description);
    setEditDate(entry.start.slice(0, 10));
    setEditHours(minutesToHours(entry.duration_minutes));
    setEditNotes(entry.notes ?? "");
    setEditTaskId(entry.task_id ?? null);
    setEditTaskTitle(taskTitleById(tasks, entry.task_id));
    setMode("edit");
  }

  function handleSave() {
    const updates: Parameters<
      typeof updateEntry.mutate
    >[0]["updates"] = {};
    if (editCustomer.trim() !== entry.customer) {
      updates.customer = editCustomer.trim();
    }
    if (editDesc.trim() !== entry.description) {
      updates.description = editDesc.trim();
    }
    const entryDate = entry.start.slice(0, 10);
    if (editDate && editDate !== entryDate) {
      updates.new_date = editDate;
    }
    const h = parseFloat(editHours);
    if (!isNaN(h) && h > 0) {
      updates.hours = h;
    }
    if (editNotes !== (entry.notes ?? "")) {
      updates.notes = editNotes;
    }
    const currentContract = entry.contract ?? "";
    if (editContract !== currentContract) {
      updates.contract = editContract;
    }
    const currentTaskId = entry.task_id ?? null;
    if (editTaskId !== currentTaskId) {
      updates.task_id = editTaskId ?? "";
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
    if (
      e.key === "Enter" ||
      ((e.metaKey || e.ctrlKey) && e.key === "Enter")
    ) {
      handleSave();
    }
    if (e.key === "Escape") setMode("view");
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
    if (e.key === "Escape") setMode("view");
  }

  if (mode === "edit") {
    return (
      <div className="pl-3 pt-1.5 pb-2 flex flex-col gap-1">
        <CustomerAutocomplete
          autoFocus
          value={editCustomer}
          onChange={(v) => {
            setEditCustomer(v);
            setEditContract("");
          }}
          onKeyDown={handleKeyDown}
          inputClassName={inputCls}
        />
        <ContractSelect
          customer={editCustomer}
          value={editContract}
          onChange={setEditContract}
        />
        <input
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Description"
          className={inputCls}
        />
        <TaskAutocomplete
          taskId={editTaskId}
          value={editTaskTitle}
          onChange={setEditTaskTitle}
          onSelect={(id, label) => {
            setEditTaskId(id);
            setEditTaskTitle(label);
          }}
          onClear={() => {
            setEditTaskId(null);
            setEditTaskTitle("");
          }}
          customer={editCustomer}
          inputClassName={inputCls}
          onKeyDown={handleKeyDown}
        />
        <div className="flex gap-1">
          <input
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            onKeyDown={handleKeyDown}
            className={inputCls}
          />
          <input
            value={editHours}
            onChange={(e) => setEditHours(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Hours (e.g. 1.5)"
            className={inputCls}
          />
        </div>
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Notes"
          rows={2}
          className={[inputCls, "resize-none"].join(" ")}
        />
        <div className="flex gap-1 justify-end items-center">
          <span className="text-[9px] text-stone-400 mr-auto">
            ⌘↵ save
          </span>
          <button
            onClick={() => setMode("view")}
            className="p-1 rounded text-stone-500 hover:text-stone-900"
          >
            <X size={11} />
          </button>
          <button
            onClick={handleSave}
            disabled={updateEntry.isPending}
            className="p-1 rounded text-cta hover:bg-cta-muted disabled:opacity-40"
          >
            <Check size={11} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/slot flex items-center gap-2 pl-3 py-0.5">
      <span className="text-[10px] font-mono text-stone-500 tabular-nums">
        {timeLabel(entry.start)}–{timeLabel(entry.end)}
      </span>
      {entry.contract && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-surface-overlay text-stone-500 truncate max-w-[60px]">
          {entry.contract}
        </span>
      )}
      {entry.task_id && (
        <button
          onClick={() => setView(
            "board",
            taskTitleById(tasks, entry.task_id) || ""
          )}
          className="text-[9px] px-1 py-0.5 rounded bg-cta-muted text-cta/70 truncate max-w-[80px] hover:bg-cta/20 transition-colors"
          title={taskTitleById(tasks, entry.task_id) || entry.task_id}
        >
          {taskTitleById(tasks, entry.task_id) || entry.task_id}
        </button>
      )}
      <span className="text-[10px] text-stone-500 tabular-nums ml-auto">
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
  showResume: boolean;
  tasks: Task[];
  customerColors: Record<string, string>;
}

function TaskGroupRow({
  group,
  isRunning,
  tasks,
  showResume,
  customerColors,
}: TaskGroupRowProps) {
  const resumeTimer = useStartTimer();
  const setView = useSetView();
  const latest = group.entries[group.entries.length - 1];

  const isActive = group.entries.some(
    (e) => e.end === null
  );

  return (
    <div className="border-b border-border-subtle last:border-0 py-2">
      {/* Header */}
      <div className="group flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => setView("customers", group.customer)}
            className="text-xs font-medium text-stone-800 truncate max-w-full hover:text-cta transition-colors text-left inline-flex items-center gap-1.5"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background:
                  customerColors[group.customer]
                  || "#a1a1aa",
              }}
            />
            {group.customer}
          </button>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isActive && (
              <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-green-500/10">
                <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[9px] font-semibold tracking-wider uppercase text-green-600">
                  Active
                </span>
              </span>
            )}
            <p className="text-[11px] text-stone-500 truncate">
              {group.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {showResume && (
            <button
              onClick={() =>
                resumeTimer.mutate({
                  customer: group.customer,
                  description: group.description,
                  contract: latest?.contract ?? undefined,
                  taskId: latest?.task_id ?? undefined,
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
          )}
          <span className="text-[11px] font-semibold text-stone-600 tabular-nums ml-1">
            {formatDuration(group.totalMinutes)}
          </span>
        </div>
      </div>

      {/* Slots */}
      <div className="mt-0.5">
        {group.entries.map((entry) => (
          <SlotRow key={entry.start} entry={entry} tasks={tasks} />
        ))}
      </div>
    </div>
  );
}

// --- List ---

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ClockListProps {
  isRunning: boolean;
  selectedDate: string | null;
}

export function ClockList({
  isRunning,
  selectedDate,
}: ClockListProps) {
  const effectiveDate = selectedDate ?? todayIso();
  const isToday = effectiveDate === todayIso();
  const { data: entries = [], isLoading } = useClockEntries(
    "today",
    effectiveDate
  );
  const { data: allTasks = [] } = useTasks();
  const customerColors = useCustomerColors();

  const groups = groupEntries(entries);
  const totalMin = groups.reduce((sum, g) => sum + g.totalMinutes, 0);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;

  if (isLoading) {
    return (
      <p className="text-xs text-stone-400 text-center py-4">Loading…</p>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="text-xs text-stone-400 text-center py-4">
        No entries
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
          showResume={isToday}
          tasks={allTasks}
          customerColors={customerColors}
        />
      ))}
      <div className="flex justify-between pt-2 mt-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
          Total today
        </span>
        <span className="text-[11px] font-semibold text-stone-700 tabular-nums">
          {totalH}h {totalM}m
        </span>
      </div>
    </div>
  );
}

const inputCls = [
  "w-full px-2 py-1 rounded text-xs",
  "bg-surface-raised border border-border",
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
].join(" ");

const actionBtn = [
  "p-0.5 rounded text-stone-400",
  "hover:text-cta hover:bg-cta-muted",
  "transition-colors",
].join(" ");
