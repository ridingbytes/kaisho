/**
 * TaskCardActions -- Hover-revealed action buttons for a task
 * card: mark done, start timer, edit, and archive.
 */
import { useTranslation } from "react-i18next";
import {
  Check,
  Clock,
  Pencil,
  Trash2,
} from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";

interface TaskCardActionsProps {
  /** Current task status. */
  status: string;
  /** Whether a timer is already running for this task. */
  isTimerRunning: boolean;
  /** Whether the task has a customer assigned. */
  hasCustomer: boolean;
  /** Whether mark-done mutation is pending. */
  isMarkDonePending: boolean;
  /** Whether start-clock mutation is pending. */
  isStartClockPending: boolean;
  /** Whether stop-clock mutation is pending. */
  isStopClockPending: boolean;
  /** Whether archive mutation is pending. */
  isArchivePending: boolean;
  onMarkDone: () => void;
  onStartTimer: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

/**
 * Renders a vertical strip of icon buttons that appear on
 * hover: complete, timer, edit, and archive (with confirm).
 */
export function TaskCardActions({
  status,
  isTimerRunning,
  hasCustomer,
  isMarkDonePending,
  isStartClockPending,
  isStopClockPending,
  isArchivePending,
  onMarkDone,
  onStartTimer,
  onEdit,
  onArchive,
}: TaskCardActionsProps) {
  const { t } = useTranslation("kanban");
  const { t: tc } = useTranslation("common");
  const { t: tClocks } = useTranslation("clocks");
  return (
    <div className="flex flex-col items-center gap-1 px-1 py-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
      {status !== "DONE" &&
        status !== "CANCELLED" && (
          <button
            onPointerDown={(e) =>
              e.stopPropagation()
            }
            onClick={onMarkDone}
            disabled={isMarkDonePending}
            className="p-1 rounded text-stone-400 hover:text-green-500 hover:bg-green-500/10 transition-colors disabled:opacity-40"
            title={t("markAsDone")}
          >
            <Check size={11} />
          </button>
        )}
      {!isTimerRunning && hasCustomer && (
        <button
          onPointerDown={(e) =>
            e.stopPropagation()
          }
          onClick={onStartTimer}
          disabled={
            isStartClockPending || isStopClockPending
          }
          className="p-1 rounded text-stone-400 hover:text-green-500 hover:bg-green-500/10 transition-colors disabled:opacity-40"
          title={tClocks("startTimer")}
        >
          <Clock size={11} />
        </button>
      )}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onEdit}
        className="p-1 rounded text-stone-400 hover:text-cta hover:bg-cta-muted transition-colors"
        title={tc("edit")}
      >
        <Pencil size={11} />
      </button>
      <ConfirmPopover
        label={t("archiveConfirm")}
        onConfirm={onArchive}
        disabled={isArchivePending}
      >
        <button
          disabled={isArchivePending}
          className="p-1 rounded text-stone-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          title={tc("archive")}
        >
          <Trash2 size={11} />
        </button>
      </ConfirmPopover>
    </div>
  );
}
