/**
 * TaskEditForm -- Inline edit form for a task card, allowing
 * edits to customer, title, description, GitHub URL, and tags.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TagDropdown } from "../common/TagDropdown";
import { GithubIssueInput } from "./GithubIssueInput";
import { uploadAttachment } from "../../api/client";

const editInputCls = [
  "w-full px-2 py-1 rounded text-xs",
  "bg-surface-raised border border-border",
  "text-fg-strong placeholder-fg-muted",
  "focus:outline-none focus:border-cta",
].join(" ");

interface TagDef {
  name: string;
  color: string;
}

interface TaskEditFormProps {
  /** Task id used to bucket dropped/pasted attachments
   *  under the right folder on disk. */
  taskId: string;
  editCustomer: string;
  editTitle: string;
  editBody: string;
  editGithubUrl: string;
  editTags: string[];
  /** Date-only ISO ``YYYY-MM-DD`` or empty string. */
  editScheduled: string;
  /** Date-only ISO ``YYYY-MM-DD`` or empty string. */
  editDeadline: string;
  allTags: TagDef[];
  isSaving: boolean;
  onCustomerChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onGithubUrlChange: (v: string) => void;
  onTagsChange: (tags: string[]) => void;
  onScheduledChange: (v: string) => void;
  onDeadlineChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Renders the inline edit form for a task card with fields
 * for customer, title, body, GitHub URL, and tags. Supports
 * Cmd+Enter to save and Escape to cancel.
 */
export function TaskEditForm({
  taskId,
  editCustomer,
  editTitle,
  editBody,
  editGithubUrl,
  editTags,
  editScheduled,
  editDeadline,
  allTags,
  isSaving,
  onCustomerChange,
  onTitleChange,
  onBodyChange,
  onGithubUrlChange,
  onTagsChange,
  onScheduledChange,
  onDeadlineChange,
  onSave,
  onCancel,
}: TaskEditFormProps) {
  const { t } = useTranslation("kanban");
  const { t: tc } = useTranslation("common");

  // Cross-field check: a snooze date past the deadline
  // is incoherent (the deadline badge would fire before
  // the snooze even surfaces). Lex compare agrees with
  // chronological order on ``YYYY-MM-DD``. The API
  // mirrors this rule and returns 400 if it slips
  // through, so this is purely instant-feedback UX.
  const datesOutOfOrder = !!(
    editScheduled
    && editDeadline
    && editDeadline < editScheduled
  );

  function handleSave() {
    if (datesOutOfOrder) return;
    onSave();
  }

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<
    string | null
  >(null);

  /** Insert markdown for a file at the caret. Images get
   *  the embed form, everything else gets a plain link so
   *  PDFs / archives stay clickable rather than rendering
   *  as broken images. */
  function insertAttachmentMarkdown(
    name: string, url: string, isImage: boolean,
  ) {
    const ta = bodyRef.current;
    const snippet = isImage
      ? `![${name}](${url})`
      : `[${name}](${url})`;
    if (!ta) {
      onBodyChange(
        editBody
          ? `${editBody}\n${snippet}\n`
          : `${snippet}\n`,
      );
      return;
    }
    const start = ta.selectionStart ?? editBody.length;
    const end = ta.selectionEnd ?? editBody.length;
    const before = editBody.slice(0, start);
    const after = editBody.slice(end);
    const needsLeadingNl = before && !before.endsWith("\n");
    const wrapped = (needsLeadingNl ? "\n" : "")
      + snippet + "\n";
    const next = before + wrapped + after;
    onBodyChange(next);
    // Restore caret after React applies the new value.
    const caret = (before + wrapped).length;
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.selectionStart = caret;
        bodyRef.current.selectionEnd = caret;
        bodyRef.current.focus();
      }
    });
  }

  async function uploadOne(file: File) {
    setUploading((n) => n + 1);
    setUploadError(null);
    try {
      const res = await uploadAttachment(file, taskId);
      const isImage = (
        file.type.startsWith("image/")
        || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(
          res.name,
        )
      );
      insertAttachmentMarkdown(
        res.name, res.url, isImage,
      );
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setUploading((n) => n - 1);
    }
  }

  function handleDrop(e: React.DragEvent) {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    e.stopPropagation();
    Array.from(e.dataTransfer.files).forEach(uploadOne);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const files = e.clipboardData?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    Array.from(files).forEach(uploadOne);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (
      (e.metaKey || e.ctrlKey) &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <CustomerAutocomplete
        value={editCustomer}
        onChange={onCustomerChange}
        onKeyDown={handleKeyDown}
        inputClassName={editInputCls}
      />
      <input
        value={editTitle}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tc("title")}
        className={editInputCls}
      />
      <textarea
        autoFocus
        ref={bodyRef}
        value={editBody}
        onChange={(e) => onBodyChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        // Default ``dragover`` blocks ``drop``; preventing
        // it tells the browser this textarea is a valid
        // drop target.
        onDragOver={(e) => e.preventDefault()}
        onPaste={handlePaste}
        placeholder={tc("descriptionOptional")}
        rows={3}
        // ``resize-y`` enables the native bottom-right
        // grip for vertical resizing. Horizontal resize is
        // intentionally blocked so dragging the corner
        // doesn't push the column's neighbours around.
        className={[editInputCls, "resize-y"].join(" ")}
      />
      {uploading > 0 && (
        <div className="text-2xs text-fg-muted px-0.5">
          {t("uploadingAttachment", { count: uploading })}
        </div>
      )}
      {uploadError && (
        <div className="text-2xs text-red-500 px-0.5">
          {uploadError}
        </div>
      )}
      <div
        onPointerDown={(e) => e.stopPropagation()}
      >
        <GithubIssueInput
          customer={editCustomer}
          value={editGithubUrl}
          onChange={onGithubUrlChange}
          inputClassName={editInputCls}
        />
      </div>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="flex gap-1.5"
      >
        <label className="flex-1 flex flex-col gap-0.5">
          <span className="text-2xs text-fg-muted px-0.5">
            {t("scheduledLabel")}
          </span>
          <input
            type="date"
            value={editScheduled}
            onChange={(e) =>
              onScheduledChange(e.target.value)
            }
            onKeyDown={handleKeyDown}
            className={editInputCls}
          />
        </label>
        <label className="flex-1 flex flex-col gap-0.5">
          <span className="text-2xs text-fg-muted px-0.5">
            {t("deadlineLabel")}
          </span>
          <input
            type="date"
            value={editDeadline}
            onChange={(e) =>
              onDeadlineChange(e.target.value)
            }
            onKeyDown={handleKeyDown}
            className={editInputCls}
          />
        </label>
      </div>
      {datesOutOfOrder && (
        <p className="text-2xs text-red-500 px-0.5">
          {t("datesOutOfOrder")}
        </p>
      )}
      <div
        onPointerDown={(e) => e.stopPropagation()}
      >
        <TagDropdown
          selected={editTags}
          allTags={allTags}
          onChange={onTagsChange}
        />
      </div>
      <div className="flex gap-1 justify-end items-center">
        <span className="text-2xs text-fg-subtle mr-auto">
          {tc("cmdSaveClose")}
        </span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onCancel}
          className="p-1 text-fg-muted hover:text-fg-strong rounded"
        >
          <X size={12} />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleSave}
          disabled={isSaving || datesOutOfOrder}
          className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
        >
          <Check size={12} />
        </button>
      </div>
    </div>
  );
}
