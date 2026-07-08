/**
 * ClockEntryRow -- A single clock entry row that opens the
 * shared TimeEntryDialog to edit, plus detach and delete
 * actions.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { NotesBubble } from "../common/NotesBubble";
import { TimeEntryDialog } from "../projects/TimeEntryDialog";
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
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const [editing, setEditing] = useState(false);

  return (
    <>
    {editing && (
      <TimeEntryDialog
        entry={entry}
        onClose={() => setEditing(false)}
      />
    )}
    <li className="flex items-center gap-1.5 text-2xs group/entry">
      <span
        className="font-mono text-fg-muted cursor-pointer hover:text-cta"
        onClick={() =>
          navigateToClockDate(entry.start.slice(0, 10))
        }
      >
        {fmtDate(entry.start)}
      </span>
      <span className="flex-1 min-w-0 text-fg-muted flex items-center gap-1 overflow-hidden">
        <span className="truncate min-w-0">
          {entry.description}
        </span>
        <NotesBubble
          value={entry.notes ?? ""}
          title={tc("notes")}
          bucketId={entry.sync_id ?? entry.start}
          iconSize={9}
          saving={updateEntry.isPending}
          onSave={(md) =>
            updateEntry.mutate({
              entry,
              updates: { notes: md },
            })
          }
        />
      </span>
      <span className="tabular-nums text-fg">
        {formatHours(entry.duration_minutes)}
      </span>
      <button
        onClick={() => setEditing(true)}
        title={t("editEntry")}
        className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded text-fg-muted hover:text-fg-strong"
      >
        <Pencil size={9} />
      </button>
      <button
        onClick={() =>
          updateEntry.mutate({
            entry,
            updates: { task_id: "" },
          })
        }
        disabled={updateEntry.isPending}
        title={t("detachFromTask")}
        className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded text-fg-muted hover:text-fg-strong disabled:opacity-40"
      >
        <X size={9} />
      </button>
      <ConfirmPopover
        onConfirm={() => deleteEntry.mutate(entry)}
        disabled={deleteEntry.isPending}
      >
        <button
          disabled={deleteEntry.isPending}
          title={t("deleteEntry")}
          className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded text-fg-muted hover:text-red-400 disabled:opacity-40"
        >
          <Trash2 size={9} />
        </button>
      </ConfirmPopover>
    </li>
    </>
  );
}
