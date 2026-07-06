import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Width of a collapsed column in px — must match the
 * value the parent board uses to compute layout. */
export const COLLAPSED_WIDTH = 40;

interface Props {
  /** Sortable id — the column reorders by this id. */
  id: string;
  label: string;
  color: string;
  count: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Explicit pixel width; falls back to w-72. */
  width?: number;
  /** Action rendered in the header (e.g. an add button). */
  headerAction?: React.ReactNode;
  /** Cards / add-form rendered inside the drop zone. */
  children: React.ReactNode;
}

/** The reusable kanban column: a drag-to-reorder handle, a
 * status dot, label and count, an optional header action,
 * a collapse toggle, and a droppable body. Shared by the
 * task board and the projects board so both look and behave
 * identically. */
export function BoardColumnShell({
  id, label, color, count, collapsed = false,
  onToggleCollapsed, width, headerAction, children,
}: Props) {
  const { t } = useTranslation("kanban");
  const {
    setNodeRef, attributes, listeners, transform,
    transition, isDragging, isOver,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={{
          ...style,
          width: COLLAPSED_WIDTH,
          minWidth: COLLAPSED_WIDTH,
        }}
        className={[
          "flex flex-col shrink-0 h-full min-h-0",
          isDragging ? "opacity-40" : "",
        ].filter(Boolean).join(" ")}
      >
        <div className="flex items-center justify-center mb-3 px-1">
          <button
            onClick={onToggleCollapsed}
            className="p-1 rounded-md text-fg-muted hover:text-fg hover:bg-surface-raised transition-colors"
            title={t("expandColumn")}
          >
            <ChevronRight size={13} strokeWidth={2} />
          </button>
        </div>
        <div
          className={[
            "flex flex-col items-center gap-3 p-2",
            "rounded-lg border border-dashed",
            "transition-colors duration-150 flex-1 min-h-0",
            isOver
              ? "border-cta bg-cta-muted"
              : "border-border-subtle bg-surface-card/30",
          ].join(" ")}
        >
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="px-1.5 py-0.5 rounded text-2xs font-semibold bg-surface-raised text-fg-muted border border-border-subtle">
            {count}
          </span>
          <div
            {...attributes}
            {...listeners}
            className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold tracking-wider uppercase text-fg cursor-grab active:cursor-grabbing select-none"
            title={t("dragToReorder")}
          >
            {label}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        ...(width ? { width, minWidth: width } : {}),
      }}
      className={[
        "flex flex-col shrink-0 h-full min-h-0",
        !width && "w-72",
        isDragging ? "opacity-40" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-fg-subtle hover:text-fg-muted shrink-0 touch-none"
          title={t("dragToReorder")}
        >
          <GripVertical size={12} />
        </div>
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <h2 className="text-xs font-semibold tracking-wider uppercase text-fg">
          {label}
        </h2>
        <span className="ml-auto px-1.5 py-0.5 rounded text-2xs font-semibold bg-surface-raised text-fg-muted border border-border-subtle">
          {count}
        </span>
        {headerAction}
        <button
          onClick={onToggleCollapsed}
          className="p-1 rounded-md text-fg-muted hover:text-fg hover:bg-surface-raised transition-colors"
          title={t("collapseColumn")}
        >
          <ChevronLeft size={13} strokeWidth={2} />
        </button>
      </div>

      <div
        className={[
          "flex flex-col gap-2 min-h-32 p-2 rounded-lg flex-1",
          "overflow-y-auto min-h-0 border border-dashed",
          "transition-colors duration-150",
          isOver
            ? "border-cta bg-cta-muted"
            : "border-border-subtle bg-surface-card/30",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
