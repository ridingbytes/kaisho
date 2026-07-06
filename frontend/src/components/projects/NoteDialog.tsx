import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Trash2 } from "lucide-react";
import { Dialog } from "../common/Dialog";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { MarkdownEditor } from "../common/MarkdownEditor";
import {
  useDeleteNote,
  useUpdateNote,
} from "../../hooks/useNotes";
import { useSetView } from "../../context/ViewContext";
import { fieldCls, inputCls } from "../settings/styles";
import type { NoteItem } from "../../types";

interface Props {
  note: NoteItem;
  onClose: () => void;
}

/** Edit a note inline from within a project, so you stay
 * in the project instead of navigating to the Notes view. */
export function NoteDialog({ note, onClose }: Props) {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation("common");
  const update = useUpdateNote();
  const remove = useDeleteNote();
  const setView = useSetView();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body ?? "");

  function save() {
    update.mutate(
      { noteId: note.id, updates: { title, body } },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("editNote")}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <ConfirmPopover
            onConfirm={() =>
              remove.mutate(note.id, { onSuccess: onClose })
            }
          >
            <button className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-red-400">
              <Trash2 size={13} /> {tc("delete")}
            </button>
          </ConfirmPopover>
          <div className="flex gap-2">
            <button
              onClick={() => setView("notes", note.id)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm text-fg-muted hover:text-cta"
              title={t("openInNotes")}
            >
              <ExternalLink size={13} />
            </button>
            <button onClick={onClose} className={fieldCls}>
              {tc("cancel")}
            </button>
            <button
              onClick={save}
              disabled={!title.trim() || update.isPending}
              className="px-3 py-1.5 rounded text-sm bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
            >
              {tc("save")}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={tc("title")}
          className={`${inputCls} w-full`}
        />
        <MarkdownEditor
          value={body}
          onChange={setBody}
          bucketId={note.id}
          rows={12}
          defaultTab="preview"
          placeholder={t("notesPlaceholder")}
        />
      </div>
    </Dialog>
  );
}
