import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "./Dialog";
import { MarkdownEditor } from "./MarkdownEditor";
import { fieldCls } from "../settings/styles";

interface Props {
  title: string;
  value: string;
  /** Bucket id for drag-dropped / pasted attachments. */
  bucketId: string;
  onSave: (md: string) => void;
  onClose: () => void;
  saving?: boolean;
  /** Optional read-only mode: hides the save button. */
  readOnly?: boolean;
}

/** A dialog that shows markdown content with Preview / Write
 * tabs (Preview first). Reused for viewing/editing task
 * descriptions, note bodies, and similar rich text. */
export function MarkdownDialog({
  title, value, bucketId, onSave, onClose, saving, readOnly,
}: Props) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState(value);

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      size="lg"
      resizable
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className={fieldCls}>
            {readOnly ? t("close") : t("cancel")}
          </button>
          {!readOnly && (
            <button
              onClick={() => onSave(draft)}
              disabled={saving}
              className="px-3 py-1.5 rounded text-sm bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
            >
              {t("save")}
            </button>
          )}
        </div>
      }
    >
      <MarkdownEditor
        value={draft}
        onChange={setDraft}
        bucketId={bucketId}
        rows={14}
        defaultTab="preview"
      />
    </Dialog>
  );
}
