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
  "text-stone-900 placeholder-stone-500",
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
  allTags: TagDef[];
  isSaving: boolean;
  onCustomerChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onGithubUrlChange: (v: string) => void;
  onTagsChange: (tags: string[]) => void;
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
  allTags,
  isSaving,
  onCustomerChange,
  onTitleChange,
  onBodyChange,
  onGithubUrlChange,
  onTagsChange,
  onSave,
  onCancel,
}: TaskEditFormProps) {
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
        autoFocus
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
      >
        <TagDropdown
          selected={editTags}
          allTags={allTags}
          onChange={onTagsChange}
        />
      </div>
      <div className="flex gap-1 justify-end items-center">
        <span className="text-[10px] text-stone-400 mr-auto">
          {tc("cmdSaveClose")}
        </span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onCancel}
          className="p-1 text-stone-500 hover:text-stone-900 rounded"
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
