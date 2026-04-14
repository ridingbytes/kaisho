/**
 * Sortable table header and sorting utilities for
 * the clock entries table.
 */
import { ArrowDown, ArrowUp } from "lucide-react";
import { taskTitleById } from "../../utils/customerPrefix";
import type { ClockEntry, Task } from "../../types";

export type SortCol =
  | "date"
  | "time"
  | "customer"
  | "contract"
  | "task"
  | "description"
  | "duration";

export type SortDir = "asc" | "desc";
export type SortState = { col: SortCol; dir: SortDir };

// -----------------------------------------------------------------
// Sortable column header
// -----------------------------------------------------------------

const thCls = [
  "px-3 py-2 text-[10px] font-semibold uppercase",
  "tracking-wider text-stone-600 select-none",
  "cursor-pointer hover:text-stone-900 transition-colors",
].join(" ");

/** Props for the {@link SortTh} component. */
interface SortThProps {
  label: string;
  col: SortCol;
  sort: SortState;
  onSort: (col: SortCol) => void;
  align?: "right";
}

/**
 * A clickable table header cell that toggles sort
 * direction and highlights the active column.
 */
export function SortTh({
  label,
  col,
  sort,
  onSort,
  align,
}: SortThProps) {
  const active = sort.col === col;
  const Icon = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`${thCls}${
        align === "right" ? " text-right" : ""
      }`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && (
          <Icon
            size={10}
            className="text-cta"
            strokeWidth={2.5}
          />
        )}
      </span>
    </th>
  );
}

/**
 * Return a comparable value for the given column so
 * that entries can be sorted generically.
 */
export function sortValue(
  entry: ClockEntry,
  col: SortCol,
  tasks: Task[],
): string | number {
  switch (col) {
    case "date":
      return entry.start;
    case "time":
      return entry.start;
    case "customer":
      return entry.customer.toLowerCase();
    case "contract":
      return (entry.contract ?? "").toLowerCase();
    case "task":
      return (
        taskTitleById(tasks, entry.task_id) ?? ""
      ).toLowerCase();
    case "description":
      return entry.description.toLowerCase();
    case "duration":
      return entry.duration_minutes ?? 0;
  }
}
