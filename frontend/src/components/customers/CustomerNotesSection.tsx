import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, StickyNote } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { useAddNote, useNotes } from "../../hooks/useNotes";
import { useSetView } from "../../context/ViewContext";
import { fieldCls } from "../settings/styles";

interface Props {
  customerName: string;
}

/** Notes belonging to a customer, shown on the customer
 * card. Add a note inline; click one to open it in the
 * Notes view (search by title, which resolves cleanly). */
export function CustomerNotesSection({ customerName }: Props) {
  const { t } = useTranslation("customers");
  const { data: notes = [] } = useNotes();
  const addNote = useAddNote();
  const setView = useSetView();
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
    <CollapsibleSection label={t("notes")} count={mine.length}>
      <div className="ml-5 space-y-1">
        {mine.length === 0 ? (
          <p className="text-2xs text-fg-muted py-1">
            {t("noNotes")}
          </p>
        ) : (
          mine.map((n) => (
            <button
              key={n.id}
              onClick={() => setView("notes", n.title)}
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
  );
}
