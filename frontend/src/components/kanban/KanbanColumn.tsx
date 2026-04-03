import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Task, TaskState } from "../../types";
import { TaskCard } from "./TaskCard";

interface KanbanColumnProps {
  state: TaskState;
  tasks: Task[];
}

export function KanbanColumn({ state, tasks }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: state.name });

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: state.color }}
        />
        <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          {state.label || state.name}
        </h2>
        <span
          className={[
            "ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold",
            "bg-surface-raised text-slate-500",
            "border border-border-subtle",
          ].join(" ")}
        >
          {tasks.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={[
          "flex flex-col gap-2 min-h-32 p-2 rounded-xl",
          "border border-dashed transition-colors duration-150",
          isOver
            ? "border-accent bg-accent-muted"
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
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-16">
            <span className="text-xs text-slate-700">Empty</span>
          </div>
        )}
      </div>
    </div>
  );
}
