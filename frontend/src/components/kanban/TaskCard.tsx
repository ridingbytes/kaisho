import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronRight,
  SquareArrowUp,
} from "lucide-react";
import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TagDropdown } from "../common/TagDropdown";
import {
  useUpdateTask,
  useArchiveTask,
  useSetTaskTags,
} from "../../hooks/useTasks";
import {
  useTaskClockEntries,
  useUpdateClockEntry,
} from "../../hooks/useClocks";
import { useAddTimeEntry } from "../../hooks/useCustomers";
import { useSettings } from "../../hooks/useSettings";
import type { ClockEntry, Task } from "../../types";

const CUSTOMER_PREFIX_RE = /^\[[^\]]+\]:?\s*/;

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

function fmtHours(minutes: number | null): string {
  if (!minutes) return "0h";
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")}h`;
}

function totalMinutes(entries: ClockEntry[]): number {
  return entries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Clock entries section inside a task card
// ---------------------------------------------------------------------------

interface TaskClockSectionProps {
  task: Task;
}

function TaskClockSection({ task }: TaskClockSectionProps) {
  const { data: entries = [] } = useTaskClockEntries(task.id);
  const updateEntry = useUpdateClockEntry();
  const addTimeEntry = useAddTimeEntry();
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  const total = totalMinutes(entries);

  function detach(entry: ClockEntry) {
    updateEntry.mutate({
      startIso: entry.start,
      updates: { task_id: "" },
    });
  }

  function bookAll() {
    if (!task.customer) return;
    const hours = parseFloat((total / 60).toFixed(2));
    addTimeEntry.mutate(
      {
        customerName: task.customer,
        description: task.title,
        hours,
      },
      { onSuccess: () => setOpen(false) }
    );
  }

  return (
    <div
      className="mt-2 border-t border-border-subtle pt-1.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 w-full"
      >
        {open ? (
          <ChevronDown size={10} />
        ) : (
          <ChevronRight size={10} />
        )}
        <Clock size={10} />
        <span>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
          {" · "}
          {fmtHours(total)}
        </span>
        {task.customer && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              bookAll();
            }}
            disabled={addTimeEntry.isPending}
            title="Book total to project"
            className="ml-auto p-0.5 rounded text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
          >
            <SquareArrowUp size={10} />
          </button>
        )}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          {entries.map((e) => (
            <li
              key={e.start}
              className="flex items-center gap-1.5 text-[10px] text-slate-500 group/entry"
            >
              <span className="font-mono">{fmtDate(e.start)}</span>
              <span className="flex-1 truncate">{e.description}</span>
              <span className="tabular-nums text-slate-400">
                {fmtHours(e.duration_minutes)}
              </span>
              <button
                onClick={() => detach(e)}
                disabled={updateEntry.isPending}
                title="Detach from task"
                className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded text-slate-600 hover:text-slate-300 disabled:opacity-40"
              >
                <X size={9} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function stripCustomerPrefix(title: string): string {
  return title.replace(CUSTOMER_PREFIX_RE, "");
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  return dateStr.replace(/^\[/, "").replace(/\]$/, "").slice(0, 10);
}

interface TaskCardProps {
  task: Task;
  statusColor: string;
  isDragOverlay?: boolean;
}

export function TaskCard({
  task,
  statusColor,
  isDragOverlay = false,
}: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCustomer, setEditCustomer] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const updateTask = useUpdateTask();
  const setTaskTags = useSetTaskTags();
  const archiveTask = useArchiveTask();
  const { data: settings } = useSettings();
  const allTags = settings?.tags ?? [];

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function startEdit() {
    setEditTitle(stripCustomerPrefix(task.title));
    setEditCustomer(task.customer ?? "");
    setEditTags([...task.tags]);
    setEditing(true);
  }

  function handleSave() {
    const tagsChanged =
      JSON.stringify([...editTags].sort()) !==
      JSON.stringify([...task.tags].sort());
    updateTask.mutate(
      {
        taskId: task.id,
        updates: {
          title: editTitle.trim(),
          customer: editCustomer.trim(),
        },
      },
      {
        onSuccess: () => {
          if (tagsChanged) {
            setTaskTags.mutate(
              { taskId: task.id, tags: editTags },
              { onSuccess: () => setEditing(false) }
            );
          } else {
            setEditing(false);
          }
        },
      }
    );
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={[
        "group relative rounded-lg border",
        "bg-surface-card border-border",
        "shadow-card hover:shadow-card-hover",
        "transition-all duration-150",
        isDragging ? "opacity-40" : "opacity-100",
        isDragOverlay ? "shadow-card-drag rotate-1 scale-105" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Status color stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg"
        style={{ backgroundColor: statusColor }}
      />

      <div className="flex items-stretch">
        {/* Drag handle */}
        <div
          {...listeners}
          className="flex items-center pl-3 pr-1 cursor-grab active:cursor-grabbing text-slate-700 hover:text-slate-500 shrink-0"
        >
          <GripVertical size={12} strokeWidth={2} />
        </div>

        {/* Card content */}
        <div className="flex-1 min-w-0 py-3 pr-3">
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <CustomerAutocomplete
                autoFocus
                value={editCustomer}
                onChange={setEditCustomer}
                onKeyDown={handleEditKeyDown}
                inputClassName={editInputCls}
              />
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleEditKeyDown}
                placeholder="Title"
                className={editInputCls}
              />
              <div onPointerDown={(e) => e.stopPropagation()}>
                <TagDropdown
                  selected={editTags}
                  allTags={allTags}
                  onChange={setEditTags}
                />
              </div>
              <div className="flex gap-1 justify-end">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setEditing(false)}
                  className="p-1 text-slate-600 hover:text-slate-300 rounded"
                >
                  <X size={12} />
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleSave}
                  disabled={
                    updateTask.isPending || setTaskTags.isPending
                  }
                  className="p-1 text-accent hover:bg-accent-muted rounded disabled:opacity-40"
                >
                  <Check size={12} />
                </button>
              </div>
            </div>
          ) : (
            <>
              {task.customer && (
                <div className="mb-1.5">
                  <span
                    className={[
                      "inline-flex items-center px-1.5 py-0.5 rounded",
                      "text-[10px] font-semibold tracking-wider uppercase",
                      "bg-accent-muted text-accent-hover",
                    ].join(" ")}
                  >
                    {task.customer}
                  </span>
                </div>
              )}
              <p className="text-sm font-medium text-slate-200 leading-snug mb-2">
                {stripCustomerPrefix(task.title)}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {task.tags.map((tagName) => {
                  const def = allTags.find((t) => t.name === tagName);
                  return def ? (
                    <span
                      key={tagName}
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                      style={{ backgroundColor: def.color }}
                    >
                      {tagName}
                    </span>
                  ) : (
                    <span
                      key={tagName}
                      className={[
                        "px-1.5 py-0.5 rounded text-[10px] font-medium",
                        "bg-surface-overlay text-slate-400",
                        "border border-border-subtle",
                      ].join(" ")}
                    >
                      {tagName}
                    </span>
                  );
                })}
                <span className="ml-auto text-[10px] text-slate-600 shrink-0">
                  {formatDate(task.created)}
                </span>
              </div>
              <TaskClockSection task={task} />
            </>
          )}
        </div>

        {/* Hover actions */}
        {!editing && !isDragOverlay && (
          <div className="flex flex-col items-center gap-1 px-1 py-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={startEdit}
              className="p-1 rounded text-slate-700 hover:text-accent hover:bg-accent-muted transition-colors"
              title="Edit"
            >
              <Pencil size={11} />
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => archiveTask.mutate(task.id)}
              disabled={archiveTask.isPending}
              className="p-1 rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
              title="Archive"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const editInputCls = [
  "w-full px-2 py-1 rounded text-xs",
  "bg-surface-raised border border-border",
  "text-slate-200 placeholder-slate-600",
  "focus:outline-none focus:border-accent",
].join(" ");
