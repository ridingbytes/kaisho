/**
 * TimeEntryRow renders a single clock entry with a contract
 * badge and a delete action. Click the row to edit it in the
 * shared TimeEntryDialog modal.
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { NotesBubble } from "../common/NotesBubble";
import { HoverActions } from "../common/HoverActions";
import { TimeEntryDialog } from "../projects/TimeEntryDialog";
import { navigateToClockDate } from "../../utils/clockNavigation";
import {
  useDeleteClockEntry,
  useUpdateClockEntry,
} from "../../hooks/useClocks";
import {
  useInvoicedContracts,
  isInvoiced,
} from "../../hooks/useInvoicedContracts";
import { formatHours } from "../../utils/formatting";
import type { ClockEntry, Contract } from "../../types";

export interface TimeEntryRowProps {
  /** The clock entry to display. */
  entry: ClockEntry;
  /** Available contracts (unused; the dialog fetches its
   * own — kept so callers need not change). */
  contracts?: Contract[];
}

function formatEntryDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** A time entry row; click to edit in the modal. */
export function TimeEntryRow({ entry }: TimeEntryRowProps) {
  const { t: tc } = useTranslation("common");
  const [editing, setEditing] = useState(false);
  const invoicedSet = useInvoicedContracts();
  const isInv = isInvoiced(
    invoicedSet,
    entry.customer,
    entry.contract,
  );
  const deleteEntry = useDeleteClockEntry();
  const updateEntry = useUpdateClockEntry();

  return (
    <>
      <div
        className={
          "group flex items-center gap-1.5 py-1 "
          + "border-b border-border-subtle last:border-0"
        }
      >
        <span
          className={
            "text-2xs text-fg-muted tabular-nums "
            + "shrink-0 cursor-pointer hover:text-cta"
          }
          onClick={() =>
            navigateToClockDate(entry.start.slice(0, 10))
          }
        >
          {formatEntryDate(entry.start)}
        </span>
        <button
          onClick={() => setEditing(true)}
          className={
            "text-xs text-fg-strong min-w-0 flex-1 "
            + "flex items-center gap-1 overflow-hidden "
            + "text-left hover:text-cta"
          }
        >
          <span className="truncate min-w-0">
            {entry.description}
          </span>
        </button>
        <NotesBubble
          value={entry.notes ?? ""}
          title={tc("notes")}
          bucketId={entry.sync_id ?? entry.start}
          saving={updateEntry.isPending}
          onSave={(md) =>
            updateEntry.mutate({
              entry,
              updates: { notes: md },
            })
          }
        />
        {entry.contract && (
          <span
            className={[
              "text-2xs px-1 py-0.5 rounded shrink-0",
              "max-w-[6rem] truncate",
              isInv
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-surface-overlay text-fg-muted",
            ].join(" ")}
          >
            {entry.contract}
            {isInv && " ✓"}
          </span>
        )}
        <span
          className={
            "text-2xs text-fg-muted tabular-nums shrink-0"
          }
        >
          {formatHours(entry.duration_minutes)}
        </span>
        <HoverActions className="gap-0.5">
          <ConfirmPopover
            onConfirm={() => deleteEntry.mutate(entry)}
            disabled={deleteEntry.isPending}
          >
            <button
              disabled={deleteEntry.isPending}
              className={
                "p-0.5 rounded text-fg-subtle "
                + "hover:text-red-400 hover:bg-red-500/10 "
                + "transition-colors"
              }
              title={tc("delete")}
            >
              <Trash2 size={10} />
            </button>
          </ConfirmPopover>
        </HoverActions>
      </div>
      {editing && (
        <TimeEntryDialog
          entry={entry}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
