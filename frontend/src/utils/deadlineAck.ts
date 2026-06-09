/**
 * Per-device, per-deadline acknowledgement state.
 *
 * Deadlines are a task property that crosses the wire and
 * stays on the task forever; the *badge* on the card is a
 * local wake-up call that the user can mute without
 * losing the underlying date. Each device acknowledges
 * independently because the cue is a UI nudge, not a
 * piece of shared state.
 *
 * The ack is keyed by ``(task_id, deadline_date)`` so
 * changing the deadline re-fires the badge with the new
 * date — silently moving a deadline forward should not
 * keep the previous ack alive.
 *
 * Stored as a Set in a single localStorage key under the
 * profile-scoped helper, both for compact storage and so
 * a "clear all acks" admin action could land later in one
 * write.
 */
import {
  profileGet,
  profileSet,
} from "./profileStorage";

const STORAGE_KEY = "task_deadline_acks";

function load(): Set<string> {
  const raw = profileGet(STORAGE_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(
        parsed.filter(
          (item): item is string =>
            typeof item === "string",
        ),
      );
    }
  } catch {
    // Corrupted value — start fresh rather than crash.
  }
  return new Set();
}

function persist(state: Set<string>): void {
  profileSet(
    STORAGE_KEY, JSON.stringify(Array.from(state)),
  );
}

function key(taskId: string, deadline: string): string {
  return `${taskId}:${deadline}`;
}

export function isDeadlineAcked(
  taskId: string, deadline: string,
): boolean {
  return load().has(key(taskId, deadline));
}

export function ackDeadline(
  taskId: string, deadline: string,
): void {
  const state = load();
  state.add(key(taskId, deadline));
  persist(state);
}
