/**
 * Top-left badges on a task card for the snooze surface
 * (``scheduled``) and the deadline cue (``deadline``).
 *
 * - Scheduled badge: shown when ``task.scheduled`` is set
 *   and the date is **today or in the past**. Clicking
 *   acknowledges: the badge clears the ``scheduled`` field
 *   server-side so the marker is gone forever (the snooze
 *   served its purpose). Future-dated scheduled tasks are
 *   filtered out of the board entirely by the parent
 *   board component, so this badge only ever renders for
 *   the surfaced state.
 *
 * - Deadline badge: shown when ``task.deadline`` is set
 *   AND the day is close enough (today or within
 *   ``DEADLINE_URGENCY_DAYS``) — earlier-than-urgency
 *   dates carry no badge (the deadline still appears in
 *   the edit form). Click acknowledges **locally** via
 *   localStorage keyed by ``(task_id, deadline_date)`` —
 *   the deadline itself stays on the task. Changing the
 *   deadline re-keys the ack so the badge returns with
 *   the new date.
 */
import { useEffect, useState } from "react";
import { AlarmClock, BellRing } from "lucide-react";

import { useUpdateTask } from "../../hooks/useTasks";
import {
  isDeadlineAcked,
  ackDeadline,
} from "../../utils/deadlineAck";
import type { Task } from "../../types";

const DEADLINE_ACK_EVENT = "kaisho:deadline-acked";

const DEADLINE_URGENCY_DAYS = 3;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Inclusive day-difference between two ``YYYY-MM-DD``
 *  strings: positive when ``a`` is after ``b``. */
function daysBetween(a: string, b: string): number {
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor(
    (Date.parse(a) - Date.parse(b)) / ms,
  );
}

function isScheduledSurfaced(task: Task): boolean {
  if (!task.scheduled) return false;
  return task.scheduled <= todayIso();
}

function isDeadlineUrgent(task: Task): boolean {
  if (!task.deadline) return false;
  if (isDeadlineAcked(task.id, task.deadline)) {
    return false;
  }
  const today = todayIso();
  // Surface when the deadline is today, past, or coming
  // up within the urgency window. Earlier than that and
  // the badge would be too noisy.
  return daysBetween(task.deadline, today)
    <= DEADLINE_URGENCY_DAYS;
}

interface TaskDateBadgesProps {
  task: Task;
}

export function TaskDateBadges({
  task,
}: TaskDateBadgesProps) {
  const updateTask = useUpdateTask();
  // Local re-render trigger after a deadline ack — the
  // ack lives in localStorage, not React state, so we
  // need a nudge to recompute ``isDeadlineUrgent``.
  const [ackTick, setAckTick] = useState(0);

  useEffect(() => {
    function bump() {
      setAckTick((n) => n + 1);
    }
    window.addEventListener(DEADLINE_ACK_EVENT, bump);
    return () => {
      window.removeEventListener(
        DEADLINE_ACK_EVENT, bump,
      );
    };
  }, []);

  // ackTick is read here to make React track the dep.
  void ackTick;

  const showScheduled = isScheduledSurfaced(task);
  const showDeadline = isDeadlineUrgent(task);
  if (!showScheduled && !showDeadline) return null;

  function ackScheduled(e: React.MouseEvent) {
    e.stopPropagation();
    updateTask.mutate({
      taskId: task.id,
      // Empty string clears the field server-side
      // (PATCH convention).
      updates: { scheduled: "" },
    });
  }

  function ackDeadlineHere(e: React.MouseEvent) {
    e.stopPropagation();
    if (task.deadline) {
      ackDeadline(task.id, task.deadline);
      window.dispatchEvent(
        new CustomEvent(DEADLINE_ACK_EVENT),
      );
    }
  }

  const overdue = task.deadline
    && task.deadline < todayIso();
  const deadlineColor = overdue
    ? "text-red-500 hover:bg-red-500/10"
    : "text-amber-500 hover:bg-amber-500/10";

  return (
    <div
      className="absolute top-1.5 left-7 z-10 flex gap-0.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {showScheduled && (
        <button
          onClick={ackScheduled}
          className={
            "p-0.5 rounded "
            + "text-cta hover:bg-cta-muted "
            + "transition-colors"
          }
          title={`Scheduled: ${task.scheduled}`}
        >
          <AlarmClock size={11} strokeWidth={2.2} />
        </button>
      )}
      {showDeadline && (
        <button
          onClick={ackDeadlineHere}
          className={
            "p-0.5 rounded transition-colors "
            + deadlineColor
          }
          title={`Deadline: ${task.deadline}`}
        >
          <BellRing size={11} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
