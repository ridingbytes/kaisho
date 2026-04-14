/**
 * ClockEntryRow -- A single clock entry row with inline editing,
 * detach, and delete actions.
 */
import { useState } from "react";
import {
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { ContentPopup } from "../common/ContentPopup";
import { navigateToClockDate } from "../../utils/clockNavigation";
import { formatHours } from "../../utils/formatting";
import {
  useUpdateClockEntry,
  useDeleteClockEntry,
} from "../../hooks/useClocks";
import type { ClockEntry } from "../../types";

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

interface ClockEntryRowProps {
  entry: ClockEntry;
  updateEntry: ReturnType<typeof useUpdateClockEntry>;
  deleteEntry: ReturnType<typeof useDeleteClockEntry>;
}

/**
 * Renders a single clock entry with date, description,
 * duration, and inline edit/delete controls.
 */
export function ClockEntryRow({
  entry,
  updateEntry,
  deleteEntry,
}: ClockEntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [hours, setHours] = useState(
    String((entry.duration_minutes ?? 0) / 60)
  );

  function startEdit() {
    setDesc(entry.description);
    setHours(
      String((entry.duration_minutes ?? 0) / 60)
    );
    setEditing(true);
  }

  function handleSave() {
    const h = parseFloat(hours);
    if (isNaN(h)) return;
    updateEntry.mutate(
      {
        startIso: entry.start,
        updates: { description: desc, hours: h },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <li className="flex items-center gap-1 text-[10px]">
        <input
          autoFocus
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 px-1 py-0.5 rounded text-[10px] bg-surface-raised border border-border text-stone-900 focus:outline-none focus:border-cta"
        />
        <input
          type="number"
          step="0.25"
          min="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-14 px-1 py-0.5 rounded text-[10px] tabular-nums bg-surface-raised border border-border text-stone-900 focus:outline-none focus:border-cta"
        />
        <button
          onClick={() => setEditing(false)}
          className="p-0.5 rounded text-stone-500 hover:text-stone-900"
        >
          <X size={9} />
        </button>
        <button
          onClick={handleSave}
          disabled={updateEntry.isPending}
          className="p-0.5 rounded text-cta hover:bg-cta-muted disabled:opacity-40"
        >
          <Check size={9} />
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1.5 text-[10px] group/entry">
      <span
        className="font-mono text-stone-500 cursor-pointer hover:text-cta"
        onClick={() =>
          navigateToClockDate(entry.start.slice(0, 10))
        }
      >
        {fmtDate(entry.start)}
      </span>
      <span className="flex-1 truncate text-stone-600 inline-flex items-center gap-1">
        {entry.description}
        {entry.notes && (
          <ContentPopup
            content={entry.notes}
            title="Notes"
            icon="notes"
          />
        )}
      </span>
      <span className="tabular-nums text-stone-700">
        {formatHours(entry.duration_minutes)}
      </span>
      <button
        onClick={startEdit}
        title="Edit entry"
        className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded text-stone-500 hover:text-stone-900"
      >
        <Pencil size={9} />
      </button>
      <button
        onClick={() =>
          updateEntry.mutate({
            startIso: entry.start,
            updates: { task_id: "" },
          })
        }
        disabled={updateEntry.isPending}
        title="Detach from task"
        className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded text-stone-500 hover:text-stone-900 disabled:opacity-40"
      >
        <X size={9} />
      </button>
      <ConfirmPopover
        onConfirm={() =>
          deleteEntry.mutate(entry.start)
        }
        disabled={deleteEntry.isPending}
      >
        <button
          disabled={deleteEntry.isPending}
          title="Delete entry"
          className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded text-stone-500 hover:text-red-400 disabled:opacity-40"
        >
          <Trash2 size={9} />
        </button>
      </ConfirmPopover>
    </li>
  );
}
