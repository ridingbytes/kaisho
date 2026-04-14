/**
 * A single clock entry row in the entries table.
 * Toggles between read-only view and inline
 * {@link EditForm} on edit.
 */
import { useState } from "react";
import {
  Check,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { ContentPopup } from "../common/ContentPopup";
import { EditForm } from "./EditForm";
import {
  useDeleteClockEntry,
  useQuickBook,
  useUpdateClockEntry,
} from "../../hooks/useClocks";
import { isInvoiced } from "../../hooks/useInvoicedContracts";
import { navigateToClockDate } from "../../utils/clockNavigation";
import { useSetView } from "../../context/ViewContext";
import {
  formatDate,
  formatHours,
  formatTime,
} from "../../utils/formatting";
import { taskTitleById } from "../../utils/customerPrefix";
import type { ClockEntry, Task } from "../../types";

/** Props for the {@link EntryRow} component. */
export interface EntryRowProps {
  entry: ClockEntry;
  tasks: Task[];
  invoicedSet: Set<string>;
}

/**
 * Renders a single clock entry as a table row with
 * inline actions (edit, duplicate, toggle invoiced,
 * delete). Switches to {@link EditForm} when the user
 * clicks the edit button.
 */
export function EntryRow({
  entry,
  tasks,
  invoicedSet,
}: EntryRowProps) {
  const [mode, setMode] = useState<"view" | "edit">(
    "view",
  );
  const remove = useDeleteClockEntry();
  const duplicate = useQuickBook();
  const updateEntry = useUpdateClockEntry();
  const setView = useSetView();
  const taskTitle = taskTitleById(tasks, entry.task_id);
  const isInv = isInvoiced(
    invoicedSet,
    entry.customer,
    entry.contract,
  );

  function handleDuplicate() {
    const mins = entry.duration_minutes ?? 0;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const dur =
      h > 0 && m > 0
        ? `${h}h${m}min`
        : h > 0
          ? `${h}h`
          : `${m}min`;
    duplicate.mutate({
      duration: dur,
      customer: entry.customer,
      description: entry.description,
      contract: entry.contract ?? undefined,
      taskId: entry.task_id ?? undefined,
    });
  }

  if (mode === "edit") {
    return (
      <EditForm
        entry={entry}
        onClose={() => setMode("view")}
      />
    );
  }

  return (
    <tr
      className={
        "group hover:bg-surface-raised/30 " +
        "border-b border-border-subtle last:border-0"
      }
    >
      <td
        className={
          "px-3 py-1.5 text-xs font-mono " +
          "whitespace-nowrap"
        }
      >
        <button
          onClick={() =>
            navigateToClockDate(
              entry.start.slice(0, 10),
            )
          }
          className={
            "text-stone-600 hover:text-cta " +
            "transition-colors"
          }
        >
          {formatDate(entry.start)}
        </button>
      </td>
      <td
        className={
          "px-3 py-1.5 text-xs text-stone-600 " +
          "whitespace-nowrap"
        }
      >
        {formatTime(entry.start)}–
        {formatTime(entry.end)}
      </td>
      <td className="px-3 py-1.5 text-xs whitespace-nowrap">
        <button
          onClick={() =>
            setView("customers", entry.customer)
          }
          className={
            "px-1.5 py-0.5 rounded text-[10px] " +
            "font-semibold tracking-wider uppercase " +
            "bg-cta-muted text-cta-hover " +
            "hover:bg-cta/20 transition-colors"
          }
        >
          {entry.customer}
        </button>
      </td>
      <td className={
        "px-3 py-1.5 text-xs whitespace-nowrap " +
        "max-w-28 truncate"
      }>
        {entry.contract && (
          <span
            className={[
              "px-1.5 py-0.5 rounded text-[10px]",
              isInv
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-surface-overlay text-stone-700",
            ].join(" ")}
            title={entry.contract}
          >
            {entry.contract}
            {isInv && " ✓"}
          </span>
        )}
      </td>
      <td className={
        "px-3 py-1.5 text-xs whitespace-nowrap " +
        "max-w-32 truncate"
      }>
        {taskTitle && (
          <button
            onClick={() =>
              setView("board", taskTitle ?? "")
            }
            className={
              "px-1.5 py-0.5 rounded text-[10px] " +
              "font-medium bg-cta-muted text-cta " +
              "hover:bg-cta/20 transition-colors"
            }
            title={taskTitle}
          >
            {taskTitle}
          </button>
        )}
      </td>
      <td className="px-3 py-1.5 text-xs text-stone-700 w-full">
        <span className="inline-flex items-center gap-1">
          {entry.description}
          {entry.description.length > 40 && (
            <ContentPopup
              content={entry.description}
            />
          )}
          {entry.notes && (
            <ContentPopup
              content={entry.notes}
              title="Notes"
              icon="notes"
            />
          )}
        </span>
      </td>
      <td className={
        "px-3 py-1.5 text-xs text-stone-700 " +
        "tabular-nums whitespace-nowrap text-right"
      }>
        {entry.invoiced && (
          <span
            className={
              "inline-flex items-center gap-0.5 " +
              "mr-1.5 px-1 py-0.5 rounded " +
              "text-[9px] font-semibold " +
              "bg-emerald-500/10 text-emerald-600"
            }
            title="Invoiced"
          >
            <Check size={9} /> inv
          </span>
        )}
        <span className="mr-2">
          {formatHours(entry.duration_minutes)}
        </span>
        <span className={
          "inline-flex gap-0.5 opacity-0 " +
          "group-hover:opacity-100"
        }>
          <button
            onClick={() =>
              updateEntry.mutate({
                startIso: entry.start,
                updates: {
                  invoiced: !entry.invoiced,
                },
              })
            }
            disabled={updateEntry.isPending}
            className={[
              "p-0.5 rounded transition-colors",
              entry.invoiced
                ? "text-emerald-500 " +
                  "hover:text-stone-600"
                : "text-stone-400 " +
                  "hover:text-emerald-500",
            ].join(" ")}
            title={
              entry.invoiced
                ? "Unmark invoiced"
                : "Mark as invoiced"
            }
          >
            <Check size={11} />
          </button>
          <button
            onClick={() => setMode("edit")}
            className={
              "p-0.5 rounded text-stone-600 " +
              "hover:text-stone-900"
            }
            title="Edit"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={handleDuplicate}
            disabled={duplicate.isPending}
            className={
              "p-0.5 rounded text-stone-600 " +
              "hover:text-cta disabled:opacity-40"
            }
            title="Duplicate for today"
          >
            <Copy size={11} />
          </button>
          <ConfirmPopover
            onConfirm={() =>
              remove.mutate(entry.start)
            }
            disabled={remove.isPending}
          >
            <button
              disabled={remove.isPending}
              className={
                "p-0.5 rounded text-stone-600 " +
                "hover:text-red-400 " +
                "disabled:opacity-40"
              }
              title="Delete"
            >
              <Trash2 size={11} />
            </button>
          </ConfirmPopover>
        </span>
      </td>
    </tr>
  );
}
