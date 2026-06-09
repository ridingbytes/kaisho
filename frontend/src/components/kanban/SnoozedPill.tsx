/**
 * Toolbar pill listing tasks that are snoozed to a future
 * date. Clicking the pill opens a small popover with one
 * row per snoozed task; the per-row "Wake" button clears
 * the ``scheduled`` field so the card returns to the
 * board immediately.
 *
 * The pill is hidden when no tasks are snoozed so the
 * toolbar stays clean in the common case.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlarmClock, X } from "lucide-react";

import { stripCustomerPrefix } from "../../utils/customerPrefix";
import { useUpdateTask } from "../../hooks/useTasks";
import type { Task } from "../../types";

interface SnoozedPillProps {
  snoozed: Task[];
}

export function SnoozedPill({ snoozed }: SnoozedPillProps) {
  const { t } = useTranslation("kanban");
  const updateTask = useUpdateTask();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      window.addEventListener("click", onDocClick);
      return () => {
        window.removeEventListener(
          "click", onDocClick,
        );
      };
    }
  }, [open]);

  if (snoozed.length === 0) return null;

  const ordered = [...snoozed].sort((a, b) => {
    const sa = a.scheduled ?? "";
    const sb = b.scheduled ?? "";
    return sa.localeCompare(sb);
  });

  function wake(task: Task) {
    updateTask.mutate({
      taskId: task.id,
      updates: { scheduled: "" },
    });
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex items-center gap-1 px-2 py-1 rounded-md",
          "text-2xs font-medium",
          "text-fg-muted hover:text-fg-strong",
          "bg-surface-raised hover:bg-surface-card",
          "border border-border-subtle",
          "transition-colors",
        ].join(" ")}
        title={t("snoozedTooltip")}
      >
        <AlarmClock size={11} strokeWidth={2.2} />
        <span>
          {t(
            "snoozedCount", { count: snoozed.length },
          )}
        </span>
      </button>
      {open && (
        <div
          className={[
            "absolute right-0 mt-1 z-30",
            "w-72 max-h-80 overflow-y-auto",
            "bg-surface-overlay border border-border",
            "rounded-lg shadow-card-hover p-1",
          ].join(" ")}
        >
          {ordered.map((task) => (
            <div
              key={task.id}
              className={[
                "flex items-center gap-2 px-2 py-1.5",
                "rounded hover:bg-surface-raised",
                "group",
              ].join(" ")}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs text-fg-strong truncate">
                  {stripCustomerPrefix(task.title)}
                </div>
                <div className="text-2xs text-fg-muted">
                  {task.customer
                    ? `${task.customer} · `
                    : ""}
                  {task.scheduled}
                </div>
              </div>
              <button
                onClick={() => wake(task)}
                className={[
                  "px-2 py-0.5 rounded text-2xs",
                  "text-cta hover:bg-cta-muted",
                  "transition-colors",
                ].join(" ")}
                title={t("wake")}
              >
                {t("wake")}
              </button>
            </div>
          ))}
          <button
            onClick={() => setOpen(false)}
            className={[
              "w-full mt-1 px-2 py-1 rounded",
              "text-2xs text-fg-muted",
              "hover:text-fg hover:bg-surface-raised",
              "flex items-center justify-center gap-1",
            ].join(" ")}
          >
            <X size={10} />
            {t("close")}
          </button>
        </div>
      )}
    </div>
  );
}
