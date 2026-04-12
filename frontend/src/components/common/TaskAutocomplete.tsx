import { useState } from "react";
import { useTasks } from "../../hooks/useTasks";
import { useAddTask } from "../../hooks/useTasks";
import { CUSTOMER_PREFIX_RE } from "../../utils/customerPrefix";
import type { Task } from "../../types";

function issueNumber(url: string): string {
  const m = url.match(/\/(\d+)\/?$/);
  return m ? `#${m[1]}` : "";
}

function taskLabel(task: Task): string {
  const title = task.title.replace(
    CUSTOMER_PREFIX_RE, "",
  );
  const num = task.github_url
    ? issueNumber(task.github_url)
    : "";
  const prefix = task.customer
    ? `[${task.customer}] `
    : "";
  return num
    ? `${prefix}${num} ${title}`
    : `${prefix}${title}`;
}

interface Props {
  /** Currently linked task ID (null = no link) */
  taskId: string | null;
  /** Text visible in the input (controlled by parent) */
  value: string;
  onChange: (text: string) => void;
  /** Called when user selects or creates a task */
  onSelect: (id: string, label: string) => void;
  /** Called when user explicitly clears the field */
  onClear: () => void;
  /** Customer used when auto-creating a new task */
  customer: string;
  className?: string;
  inputClassName?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}

const MAX_UNFILTERED = 8;

export function TaskAutocomplete({
  value,
  onChange,
  onSelect,
  onClear,
  customer,
  className,
  inputClassName = "",
  onKeyDown,
  autoFocus,
}: Props) {
  const { data: tasks = [] } = useTasks();
  const addTask = useAddTask();
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);

  const filtered: Task[] = value.trim()
    ? tasks.filter((t) => {
        const q = value.toLowerCase();
        const label = taskLabel(t).toLowerCase();
        if (label.includes(q)) return true;
        // Match #number against github_url
        if (
          q.startsWith("#")
          && t.github_url
          && issueNumber(t.github_url)
            .toLowerCase()
            .startsWith(q)
        ) {
          return true;
        }
        return false;
      })
    : tasks.slice(0, MAX_UNFILTERED);

  const showCreate =
    value.trim().length > 0 &&
    !filtered.some(
      (t) => taskLabel(t).toLowerCase() === value.trim().toLowerCase()
    );

  const itemCount = filtered.length + (showCreate ? 1 : 0);

  function selectTask(task: Task) {
    const label = taskLabel(task);
    onSelect(task.id, label);
    setOpen(false);
    setHighlightIdx(-1);
  }

  function createTask() {
    const title = value.trim();
    if (!title) return;
    addTask.mutate(
      { customer, title, status: "TODO" },
      {
        onSuccess: (task) => {
          onSelect(task.id, taskLabel(task));
          setOpen(false);
          setHighlightIdx(-1);
        },
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (itemCount > 0 && e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, itemCount - 1));
      return;
    }
    if (itemCount > 0 && e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      if (highlightIdx < filtered.length) {
        selectTask(filtered[highlightIdx]);
      } else if (showCreate) {
        createTask();
      }
      return;
    }
    if (e.key === "Escape" && open) {
      setOpen(false);
      setHighlightIdx(-1);
      return;
    }
    onKeyDown?.(e);
  }

  function handleChange(text: string) {
    onChange(text);
    setOpen(true);
    setHighlightIdx(-1);
    if (!text.trim()) onClear();
  }

  return (
    <div className={`relative${className ? ` ${className}` : ""}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        onKeyDown={handleKeyDown}
        placeholder="Task (optional)"
        autoFocus={autoFocus}
        autoComplete="off"
        className={`w-full ${inputClassName}`}
      />
      {open && itemCount > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 max-h-48 overflow-y-auto rounded-md border border-border bg-surface-raised shadow-card-hover">
          {filtered.map((task, i) => (
            <li key={task.id}>
              <button
                type="button"
                title={taskLabel(task)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectTask(task);
                }}
                className={[
                  "w-full text-left px-2 py-1.5 text-xs transition-colors leading-snug truncate",
                  i === highlightIdx
                    ? "bg-cta-muted text-stone-900"
                    : "text-stone-800 hover:bg-surface-overlay",
                ].join(" ")}
              >
                {taskLabel(task)}
              </button>
            </li>
          ))}
          {showCreate && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  createTask();
                }}
                className={[
                  "w-full text-left px-2 py-1.5 text-xs truncate",
                  "transition-colors text-cta",
                  highlightIdx === filtered.length
                    ? "bg-cta-muted"
                    : "hover:bg-surface-overlay",
                ].join(" ")}
              >
                + Create &quot;{value.trim()}&quot;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
