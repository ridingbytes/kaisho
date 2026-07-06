/**
 * TaskEditForm -- Inline edit form for a task card, allowing
 * edits to customer, title, description, GitHub URL, and tags.
 */
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { MarkdownEditor } from "../common/MarkdownEditor";
import { TagInput } from "../common/TagInput";
import { GithubIssueInput } from "./GithubIssueInput";
import { useProjects } from "../../hooks/useProjects";

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
  editDeadline: string;
  /** Project id or empty string. */
  editProject: string;
  /** Milestone id or empty string. */
  editMilestone: string;
  allTags: TagDef[];
  isSaving: boolean;
  onCustomerChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onGithubUrlChange: (v: string) => void;
  onTagsChange: (tags: string[]) => void;
  onDeadlineChange: (v: string) => void;
  onProjectChange: (v: string) => void;
  onMilestoneChange: (v: string) => void;
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
  editDeadline,
  editProject,
  editMilestone,
  allTags,
  isSaving,
  onCustomerChange,
  onTitleChange,
  onBodyChange,
  onGithubUrlChange,
  onTagsChange,
  onDeadlineChange,
  onProjectChange,
  onMilestoneChange,
  onSave,
  onCancel,
}: TaskEditFormProps) {
  const { t } = useTranslation("kanban");
  const { t: tc } = useTranslation("common");
  const { t: tp } = useTranslation("projects");
  const { data: projects = [] } = useProjects(true);
  const milestones =
    projects.find((p) => p.id === editProject)?.milestones ?? [];

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
      <MarkdownEditor
        value={editBody}
        onChange={onBodyChange}
        bucketId={taskId}
        rows={8}
        placeholder={tc("descriptionOptional")}
        onKeyDown={handleKeyDown}
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
        className="flex gap-1.5"
      >
        <label className="flex-1 flex flex-col gap-0.5">
          <span className="text-2xs text-fg-muted px-0.5">
            {tp("project")}
          </span>
          <select
            value={editProject}
            onChange={(e) => {
              onProjectChange(e.target.value);
              onMilestoneChange("");
            }}
            className={editInputCls}
          >
            <option value="">{tp("noProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {milestones.length > 0 && (
          <label className="flex-1 flex flex-col gap-0.5">
            <span className="text-2xs text-fg-muted px-0.5">
              {tp("milestone")}
            </span>
            <select
              value={editMilestone}
              onChange={(e) =>
                onMilestoneChange(e.target.value)
              }
              className={editInputCls}
            >
              <option value="">{tp("noMilestone")}</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div
        onPointerDown={(e) => e.stopPropagation()}
      >
        <TagInput
          value={editTags}
          onChange={onTagsChange}
          suggestions={allTags}
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
