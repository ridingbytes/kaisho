/**
 * TasksSection renders a collapsible list of tasks
 * linked to a customer with pagination.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SquareCheck } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { TaskDetailDialog } from "../projects/TaskDetailDialog";
import { useTasks } from "../../hooks/useTasks";
import { CUSTOMER_PREFIX_RE } from "../../utils/customerPrefix";
import type { Task } from "../../types";

const PAGE_SIZE = 5;

export interface TasksSectionProps {
  /** Customer name to filter tasks by. */
  customerName: string;
}

/** Collapsible customer tasks list with pagination. */
export function TasksSection({
  customerName,
}: TasksSectionProps) {
  const { t } = useTranslation("customers");
  const { t: tc } = useTranslation("common");
  const { data: allTasks = [] } = useTasks(true);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const tasks = allTasks.filter(
    (t) =>
      (t.customer || "").toLowerCase()
      === customerName.toLowerCase(),
  );

  const visible = tasks.slice(0, limit);
  const hasMore = tasks.length > limit;

  return (
    <>
    <CollapsibleSection
      label={t("tasks")}
      count={tasks.length}
      icon={<SquareCheck size={12} />}
    >
      <div className="ml-5">
        {tasks.length === 0 ? (
          <p
            className={
              "text-2xs text-fg-muted py-1"
            }
          >
            {t("noTasks")}
          </p>
        ) : (
          <>
            {visible.map((t) => (
              <button
                key={t.id}
                onClick={() => setOpenTask(t)}
                className={[
                  "w-full text-left flex",
                  "items-center gap-2 py-1.5 text-xs",
                  "border-b border-border-subtle",
                  "last:border-0",
                  "hover:bg-surface-raised",
                  "transition-colors rounded px-1",
                  t.status === "DONE"
                    ? "opacity-50"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span
                  className={[
                    "px-1 py-0.5 rounded text-2xs",
                    "font-bold uppercase",
                    "tracking-wider shrink-0",
                    t.status === "DONE"
                      ? "bg-emerald-500/10"
                        + " text-emerald-600"
                      : t.status === "IN-PROGRESS"
                        ? "bg-blue-500/10"
                          + " text-blue-600"
                        : t.status === "NEXT"
                          ? "bg-amber-500/10"
                            + " text-amber-600"
                          : "bg-surface-overlay"
                            + " text-fg-muted",
                  ].join(" ")}
                >
                  {t.status}
                </span>
                <span
                  className={
                    "truncate text-fg-strong"
                  }
                >
                  {t.title.replace(
                    CUSTOMER_PREFIX_RE,
                    "",
                  )}
                </span>
              </button>
            ))}
            {hasMore && (
              <button
                onClick={() =>
                  setLimit((l) => l + PAGE_SIZE)
                }
                className={[
                  "w-full text-center py-1.5",
                  "text-2xs text-fg-muted",
                  "hover:text-cta transition-colors",
                ].join(" ")}
              >
                {tc("showMore", { count: Math.min(PAGE_SIZE, tasks.length - limit) })}
              </button>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
    {openTask && (
      <TaskDetailDialog
        task={openTask}
        onClose={() => setOpenTask(null)}
      />
    )}
    </>
  );
}
