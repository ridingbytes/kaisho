import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2, Check, X } from "lucide-react";
import { useState } from "react";
import { useUpdateTask, useArchiveTask } from "../../hooks/useTasks";
import type { Task } from "../../types";

const CUSTOMER_PREFIX_RE = /^\[[^\]]+\]\s*/;

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
  const updateTask = useUpdateTask();
  const archiveTask = useArchiveTask();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function startEdit() {
    setEditTitle(stripCustomerPrefix(task.title));
    setEditCustomer(task.customer ?? "");
    setEditing(true);
  }

  function handleSave() {
    updateTask.mutate(
      {
        taskId: task.id,
        updates: {
          title: editTitle.trim(),
          customer: editCustomer.trim(),
        },
      },
      { onSuccess: () => setEditing(false) }
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
              <input
                autoFocus
                value={editCustomer}
                onChange={(e) => setEditCustomer(e.target.value)}
                onKeyDown={handleEditKeyDown}
                placeholder="Customer"
                className={editInputCls}
              />
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleEditKeyDown}
                placeholder="Title"
                className={editInputCls}
              />
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
                  disabled={updateTask.isPending}
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
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className={[
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      "bg-surface-overlay text-slate-400",
                      "border border-border-subtle",
                    ].join(" ")}
                  >
                    {tag}
                  </span>
                ))}
                <span className="ml-auto text-[10px] text-slate-600 shrink-0">
                  {formatDate(task.created)}
                </span>
              </div>
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
