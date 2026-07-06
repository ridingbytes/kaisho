import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, StickyNote } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { NoteDialog } from "../projects/NoteDialog";
import { useAddNote, useNotes } from "../../hooks/useNotes";
import { fieldCls } from "../settings/styles";
import type { NoteItem } from "../../types";

interface Props {
  customerName: string;
}

/** Notes belonging to a customer, shown on the customer
 * card. Add a note inline; click one to edit it in a
 * modal. */
export function CustomerNotesSection({ customerName }: Props) {
  const { t } = useTranslation("customers");
  const { data: notes = [] } = useNotes();
  const addNote = useAddNote();
  const [openNote, setOpenNote] = useState<NoteItem | null>(
    null,
  );
  const [title, setTitle] = useState("");

  const mine = notes.filter(
    (n) =>
      (n.customer || "").toLowerCase()
      === customerName.toLowerCase(),
  );

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addNote.mutate(
      { title: title.trim(), customer: customerName },
      { onSuccess: () => setTitle("") },
    );
  }

  return (
    <>
    <CollapsibleSection
      label={t("notes")}
      count={mine.length}
      icon={<StickyNote size={12} />}
    >
      <div className="ml-5 space-y-1">
        {mine.length === 0 ? (
          <p className="text-2xs text-fg-muted py-1">
            {t("noNotes")}
          </p>
        ) : (
          mine.map((n) => (
            <button
              key={n.id}
              onClick={() => setOpenNote(n)}
              className="flex items-center gap-2 w-full text-left py-1 px-1 rounded hover:bg-surface-overlay/40"
            >
              <StickyNote
                size={12}
                className="text-fg-subtle shrink-0"
              />
              <span className="flex-1 text-xs truncate">
                {n.title}
              </span>
            </button>
          ))
        )}
        <form onSubmit={create} className="flex gap-1 pt-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("addNotePlaceholder", "New note…")}
            className={`${fieldCls} flex-1`}
          />
          <button
            type="submit"
            disabled={!title.trim() || addNote.isPending}
            className="inline-flex items-center gap-1 px-2 rounded text-xs bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
          >
            <Plus size={12} />
          </button>
        </form>
      </div>
    </CollapsibleSection>
    {openNote && (
      <NoteDialog
        note={openNote}
        onClose={() => setOpenNote(null)}
      />
    )}
    </>
  );
}
