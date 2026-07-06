import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Check } from "lucide-react";
import {
  SortableContext, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { BoardColumnShell } from "../board/BoardColumnShell";
import { useAddTask } from "../../hooks/useTasks";
import { useGithubSettings } from "../../hooks/useSettings";
import type { Task, TaskState } from "../../types";
import { TaskCard } from "./TaskCard";

interface KanbanColumnProps {
  state: TaskState;
  tasks: Task[];
  /** Column width in pixels. Falls back to 288 (w-72). */
  columnWidth?: number;
  /** When true, open the add-task form immediately (caller resets to false). */
  openAdd?: boolean;
  onAddOpened?: () => void;
  onTagClick?: (tag: string) => void;
  onCustomerClick?: (customer: string) => void;
  /** Collapse state, persisted per profile by the parent. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function KanbanColumn({
  state,
  tasks,
  openAdd,
  onAddOpened,
  onTagClick,
  onCustomerClick,
  columnWidth,
  collapsed = false,
  onToggleCollapsed,
}: KanbanColumnProps) {
  const { t } = useTranslation("kanban");
  const { t: tc } = useTranslation("common");

  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (openAdd) {
      setAdding(true);
      onAddOpened?.();
    }
  }, [openAdd, onAddOpened]);
  const [customer, setCustomer] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const addTask = useAddTask();
  const { data: gh } = useGithubSettings();
  const githubConfigured = !!gh?.token_set;

  function handleAdd() {
    if (!title.trim()) return;
    addTask.mutate(
      {
        customer: customer.trim(),
        title: title.trim(),
        status: state.name,
        body: body.trim() || undefined,
        github_url: githubUrl.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCustomer("");
          setTitle("");
          setBody("");
          setGithubUrl("");
          setAdding(false);
        },
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || ((e.metaKey || e.ctrlKey) && e.key === "Enter")) {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === "Escape") setAdding(false);
  }

  // The description textarea allows plain Enter for newlines;
  // only Cmd/Ctrl+Enter submits, Escape cancels.
  function handleBodyKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === "Escape") setAdding(false);
  }

  return (
    <BoardColumnShell
      id={state.name}
      label={state.label || state.name}
      color={state.color}
      count={tasks.length}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      width={columnWidth}
      headerAction={
        <button
          onClick={() => setAdding((v) => !v)}
          className={[
            "p-1 rounded-md transition-colors",
            adding
              ? "text-cta bg-cta-muted"
              : "text-fg-muted hover:text-cta hover:bg-cta-muted",
          ].join(" ")}
          title={t("addTask")}
        >
          <Plus size={13} strokeWidth={2} />
        </button>
      }
    >
      {/* Inline add form — rendered at the top so a new
          task appears where it was typed. The backend
          inserts new tasks at the top of the column, so a
          bottom form would make the saved card jump up. */}
        {adding && (
          <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-surface-overlay border border-border">
            <CustomerAutocomplete
              autoFocus
              value={customer}
              onChange={setCustomer}
              onKeyDown={handleKeyDown}
              inputClassName={inputCls}
            />
            <input
              type="text"
              placeholder={t("taskTitle")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className={inputCls}
            />
            <textarea
              placeholder={tc("descriptionOptional")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleBodyKeyDown}
              rows={2}
              className={[inputCls, "resize-y"].join(" ")}
            />
            {githubConfigured && (
              <input
                type="text"
                placeholder={t("githubUrlOptional")}
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                className={inputCls}
              />
            )}
            <div className="flex gap-1 justify-end">
              <button
                onClick={() => setAdding(false)}
                className="p-1 text-fg-muted hover:text-fg-strong rounded"
              >
                <X size={13} />
              </button>
              <button
                onClick={handleAdd}
                disabled={
                  addTask.isPending ||
                  !title.trim()
                }
                className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
              >
                <Check size={13} />
              </button>
            </div>
          </div>
        )}

        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              statusColor={state.color}
              onTagClick={onTagClick}
              onCustomerClick={onCustomerClick}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && !adding && (
          <div className="flex items-center justify-center h-16">
            <span className="text-xs text-fg-subtle">{t("empty")}</span>
          </div>
        )}
    </BoardColumnShell>
  );
}

const inputCls = [
  "w-full px-2 py-1 rounded-md text-xs",
  "bg-surface-raised border border-border",
  "text-fg-strong placeholder-fg-muted",
  "focus:outline-none focus:border-cta",
].join(" ");
