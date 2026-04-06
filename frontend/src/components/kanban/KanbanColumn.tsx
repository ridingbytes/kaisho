import { useEffect, useState } from "react";
import { Plus, X, Check, GripVertical } from "lucide-react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { useAddTask } from "../../hooks/useTasks";
import type { Task, TaskState } from "../../types";
import { TaskCard } from "./TaskCard";

interface KanbanColumnProps {
  state: TaskState;
  tasks: Task[];
  /** When true, open the add-task form immediately (caller resets to false). */
  openAdd?: boolean;
  onAddOpened?: () => void;
  onTagClick?: (tag: string) => void;
}

export function KanbanColumn({
  state,
  tasks,
  openAdd,
  onAddOpened,
  onTagClick,
}: KanbanColumnProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: state.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (openAdd) {
      setAdding(true);
      onAddOpened?.();
    }
  }, [openAdd, onAddOpened]);
  const [customer, setCustomer] = useState("");
  const [title, setTitle] = useState("");
  const addTask = useAddTask();

  function handleAdd() {
    if (!customer.trim() || !title.trim()) return;
    addTask.mutate(
      {
        customer: customer.trim(),
        title: title.trim(),
        status: state.name,
      },
      {
        onSuccess: () => {
          setCustomer("");
          setTitle("");
          setAdding(false);
        },
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || ((e.metaKey || e.ctrlKey) && e.key === "Enter")) {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === "Escape") setAdding(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex flex-col w-72 shrink-0",
        isDragging ? "opacity-40" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-stone-400 hover:text-stone-600 shrink-0 touch-none"
          title="Drag to reorder column"
        >
          <GripVertical size={12} />
        </div>
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: state.color }}
        />
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-700">
          {state.label || state.name}
        </h2>
        <span
          className={[
            "ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold",
            "bg-surface-raised text-stone-600 border border-border-subtle",
          ].join(" ")}
        >
          {tasks.length}
        </span>
        <button
          onClick={() => setAdding((v) => !v)}
          className={[
            "p-1 rounded-md transition-colors",
            adding
              ? "text-cta bg-cta-muted"
              : "text-stone-500 hover:text-cta hover:bg-cta-muted",
          ].join(" ")}
          title="Add task"
        >
          <Plus size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Drop zone */}
      <div
        className={[
          "flex flex-col gap-2 min-h-32 p-2 rounded-xl",
          "border border-dashed transition-colors duration-150",
          isOver
            ? "border-cta bg-cta-muted"
            : "border-border-subtle bg-surface-card/30",
        ].join(" ")}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              statusColor={state.color}
              onTagClick={onTagClick}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && !adding && (
          <div className="flex items-center justify-center h-16">
            <span className="text-xs text-stone-400">Empty</span>
          </div>
        )}

        {/* Inline add form */}
        {adding && (
          <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-surface-overlay border border-border">
            <CustomerAutocomplete
              autoFocus
              value={customer}
              onChange={setCustomer}
              onKeyDown={handleKeyDown}
              inputClassName={inputCls}
            />
            <input
              type="text"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className={inputCls}
            />
            <div className="flex gap-1 justify-end">
              <button
                onClick={() => setAdding(false)}
                className="p-1 text-stone-500 hover:text-stone-900 rounded"
              >
                <X size={13} />
              </button>
              <button
                onClick={handleAdd}
                disabled={
                  addTask.isPending ||
                  !customer.trim() ||
                  !title.trim()
                }
                className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
              >
                <Check size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = [
  "w-full px-2 py-1 rounded-md text-xs",
  "bg-surface-raised border border-border",
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
].join(" ");
