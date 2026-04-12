/**
 * Shared utilities for customer prefix handling.
 * Tasks/clocks store titles as "[CUSTOMER]: title".
 */
import type { Task } from "../types";

export const CUSTOMER_PREFIX_RE =
  /^\[[^\]]+\]:?\s*/;

/** Remove "[CUSTOMER]: " prefix from a title. */
export function stripCustomerPrefix(
  title: string,
): string {
  return title.replace(CUSTOMER_PREFIX_RE, "");
}

/**
 * Find a task by ID and return its title without
 * the customer prefix. Returns null if not found.
 */
export function taskTitleById(
  tasks: Task[],
  id: string | null,
): string | null {
  if (!id) return null;
  const t = tasks.find((t) => t.id === id);
  return t
    ? t.title.replace(CUSTOMER_PREFIX_RE, "")
    : null;
}
