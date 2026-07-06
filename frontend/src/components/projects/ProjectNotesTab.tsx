import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, StickyNote, X } from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { NoteDialog } from "./NoteDialog";
import {
  useAddNote,
  useNotes,
  useUpdateNote,
} from "../../hooks/useNotes";
import { fieldCls, inputCls } from "../settings/styles";
import type { NoteItem } from "../../types";

interface Props {
  projectId: string;
  customer: string;
  notes: NoteItem[];
}

/** Notes assigned to a project: view, create-in-project,
 * and attach an existing note. */
export function ProjectNotesTab({
  projectId, customer, notes,
}: Props) {
  const { t } = useTranslation("projects");
  const { data: allNotes = [] } = useNotes();
  const addNote = useAddNote();
  const updateNote = useUpdateNote();
  const [title, setTitle] = useState("");
  const [openNote, setOpenNote] = useState<NoteItem | null>(
    null,
  );

  const unassigned = allNotes.filter(
    (n) => n.project !== projectId,
  );

  function createNote(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addNote.mutate(
      { title: title.trim(), customer: customer || null },
      {
        onSuccess: (note) => {
          updateNote.mutate({
            noteId: note.id,
            updates: { project: projectId },
          });
          setTitle("");
          // Open the fresh note so the user can write it.
          setOpenNote({ ...note, project: projectId });
        },
      },
    );
  }

  function assign(id: string) {
    if (!id) return;
    updateNote.mutate({
      noteId: id, updates: { project: projectId },
    });
  }

  function unassign(id: string) {
    updateNote.mutate({
      noteId: id, updates: { project: "" },
    });
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border-subtle">
        {notes.map((n) => (
          <li
            key={n.id}
            className="flex items-start gap-2 py-2 group"
          >
            <button
              onClick={() => setOpenNote(n)}
              className="flex-1 min-w-0 text-left hover:bg-surface-overlay/50 px-1 -mx-1 rounded"
            >
              <div className="flex items-center gap-2">
                <StickyNote
                  size={12}
                  className="text-fg-subtle shrink-0"
                />
                <span className="text-sm font-medium truncate">
                  {n.title}
                </span>
              </div>
              {n.body && (
                <p className="text-xs text-fg-muted line-clamp-2 mt-0.5 pl-5">
                  {n.body}
                </p>
              )}
            </button>
            <ConfirmPopover onConfirm={() => unassign(n.id)}>
              <button
                className="p-1 rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-red-400"
                title={t("unassign")}
              >
                <X size={13} />
              </button>
            </ConfirmPopover>
          </li>
        ))}
        {notes.length === 0 && (
          <li className="text-xs text-fg-muted py-1">
            {t("noNotes")}
          </li>
        )}
      </ul>
      <div className="flex items-center gap-3">
        <form onSubmit={createNote} className="flex-1 flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("newNotePlaceholder")}
            className={`${inputCls} flex-1`}
          />
          <button
            type="submit"
            disabled={!title.trim() || addNote.isPending}
            className="inline-flex items-center gap-1 px-2 rounded text-xs bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
          >
            <Plus size={13} /> {t("add")}
          </button>
        </form>
        {unassigned.length > 0 && (
          <select
            value=""
            onChange={(e) => assign(e.target.value)}
            className={fieldCls}
          >
            <option value="">{t("assignNote")}</option>
            {unassigned.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        )}
      </div>
      {openNote && (
        <NoteDialog
          note={openNote}
          onClose={() => setOpenNote(null)}
        />
      )}
    </div>
  );
}
