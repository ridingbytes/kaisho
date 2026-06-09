/**
 * TaskEditForm -- Inline edit form for a task card, allowing
 * edits to customer, title, description, GitHub URL, and tags.
 */
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TagDropdown } from "../common/TagDropdown";
import { GithubIssueInput } from "./GithubIssueInput";

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (
      (e.metaKey || e.ctrlKey) &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      onSave();
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
        value={editBody}
        onChange={(e) => onBodyChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tc("descriptionOptional")}
        rows={3}
        className={[editInputCls, "resize-none"].join(
          " ",
        )}
      />
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
          onClick={onSave}
          disabled={isSaving}
          className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
        >
          <Check size={12} />
        </button>
      </div>
    </div>
  );
}
