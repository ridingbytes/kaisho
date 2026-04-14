import { useTasks, useAddTask } from "../../hooks/useTasks";
import {
  CUSTOMER_PREFIX_RE,
} from "../../utils/customerPrefix";
import type { Task } from "../../types";
import {
  Autocomplete,
  type AutocompleteItem,
} from "./Autocomplete";

/**
 * Autocomplete input for linking a clock entry or
 * note to an existing task. Also supports creating
 * a new task inline. Wraps the generic Autocomplete
 * component with task-specific filtering and labels.
 */

function issueNumber(url: string): string {
  const m = url.match(/\/(\d+)\/?$/);
  return m ? `#${m[1]}` : "";
}

/** Build a human-readable label for a task. */
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
  /** Currently linked task ID (null = no link). */
  taskId: string | null;
  /** Text visible in the input (controlled). */
  value: string;
  /** Called when input text changes. */
  onChange: (text: string) => void;
  /** Called when user selects or creates a task. */
  onSelect: (id: string, label: string) => void;
  /** Called when user explicitly clears the field. */
  onClear: () => void;
  /** Customer used when auto-creating a task. */
  customer: string;
  className?: string;
  inputClassName?: string;
  onKeyDown?: (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => void;
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

  const filtered: Task[] = value.trim()
    ? tasks.filter((t) => {
        const q = value.toLowerCase();
        const label = taskLabel(t).toLowerCase();
        if (label.includes(q)) return true;
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

  const items: AutocompleteItem<Task>[] =
    filtered.map((t) => ({
      key: t.id,
      label: taskLabel(t),
      data: t,
    }));

  const showCreate =
    value.trim().length > 0
    && !filtered.some(
      (t) =>
        taskLabel(t).toLowerCase()
        === value.trim().toLowerCase(),
    );

  function handleSelect(
    item: AutocompleteItem<Task>,
  ) {
    onSelect(item.data.id, item.label);
  }

  function handleCreate() {
    const title = value.trim();
    if (!title) return;
    addTask.mutate(
      { customer, title, status: "TODO" },
      {
        onSuccess: (task) => {
          onSelect(task.id, taskLabel(task));
        },
      },
    );
  }

  function handleChange(text: string) {
    onChange(text);
    if (!text.trim()) onClear();
  }

  return (
    <Autocomplete
      value={value}
      onChange={handleChange}
      items={items}
      onSelect={handleSelect}
      onCreate={handleCreate}
      showCreate={showCreate}
      onKeyDown={onKeyDown}
      className={className}
      inputClassName={inputClassName}
      placeholder="Task (optional)"
      autoFocus={autoFocus}
    />
  );
}
