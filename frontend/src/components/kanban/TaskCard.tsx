import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../../types";

const CUSTOMER_PREFIX_RE = /^\[[^\]]+\]\s*/;

function stripCustomerPrefix(title: string): string {
  return title.replace(CUSTOMER_PREFIX_RE, "");
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const clean = dateStr.replace(/^\[/, "").replace(/\]$/, "");
  return clean.slice(0, 10);
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        "group relative rounded-lg border cursor-grab active:cursor-grabbing",
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

      <div className="p-3 pl-4">
        {/* Customer badge */}
        {task.customer && (
          <div className="mb-2">
            <span
              className={[
                "inline-flex items-center px-1.5 py-0.5 rounded text-[10px]",
                "font-semibold tracking-wider uppercase",
                "bg-accent-muted text-accent-hover",
              ].join(" ")}
            >
              {task.customer}
            </span>
          </div>
        )}

        {/* Title */}
        <p className="text-sm font-medium text-slate-200 leading-snug mb-2">
          {stripCustomerPrefix(task.title)}
        </p>

        {/* Footer: tags + date */}
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
      </div>
    </div>
  );
}
