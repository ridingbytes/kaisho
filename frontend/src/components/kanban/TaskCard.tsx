import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronRight,
  GitBranch,
  ListRestart,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import {
  useActiveTimer,
  useStartTimer,
  useStopTimer,
} from "../../hooks/useClocks";
import { RelDate } from "../common/RelDate";
import { navigateToClockDate } from "../../utils/clockNavigation";
import { ContentPopup } from "../common/ContentPopup";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { Markdown } from "../common/Markdown";
import { TagDropdown } from "../common/TagDropdown";
import {
  useUpdateTask,
  useArchiveTask,
  useSetTaskTags,
} from "../../hooks/useTasks";
import {
  useTaskClockEntries,
  useUpdateClockEntry,
  useDeleteClockEntry,
} from "../../hooks/useClocks";
import { useSettings } from "../../hooks/useSettings";
import type { ClockEntry, Task } from "../../types";

const CUSTOMER_PREFIX_RE = /^\[[^\]]+\]:?\s*/;

function extractIssueNumber(url: string): string {
  const m = url.match(/\/(\d+)$/);
  return m ? m[1] : "issue";
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

function fmtHours(minutes: number | null): string {
  if (!minutes) return "0h";
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")}h`;
}

function totalMinutes(entries: ClockEntry[]): number {
  return entries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Clock entries section inside a task card
// ---------------------------------------------------------------------------

interface TaskClockSectionProps {
  task: Task;
}

function ClockEntryRow({
  entry,
  updateEntry,
  deleteEntry,
}: {
  entry: ClockEntry;
  updateEntry: ReturnType<typeof useUpdateClockEntry>;
  deleteEntry: ReturnType<typeof useDeleteClockEntry>;
}) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [hours, setHours] = useState(
    String((entry.duration_minutes ?? 0) / 60)
  );

  function startEdit() {
    setDesc(entry.description);
    setHours(
      String((entry.duration_minutes ?? 0) / 60)
    );
    setEditing(true);
  }

  function handleSave() {
    const h = parseFloat(hours);
    if (isNaN(h)) return;
    updateEntry.mutate(
      {
        startIso: entry.start,
        updates: { description: desc, hours: h },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <li className="flex items-center gap-1 text-[10px]">
        <input
          autoFocus
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 px-1 py-0.5 rounded text-[10px] bg-surface-raised border border-border text-stone-900 focus:outline-none focus:border-cta"
        />
        <input
          type="number"
          step="0.25"
          min="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-14 px-1 py-0.5 rounded text-[10px] tabular-nums bg-surface-raised border border-border text-stone-900 focus:outline-none focus:border-cta"
        />
        <button
          onClick={() => setEditing(false)}
          className="p-0.5 rounded text-stone-500 hover:text-stone-900"
        >
          <X size={9} />
        </button>
        <button
          onClick={handleSave}
          disabled={updateEntry.isPending}
          className="p-0.5 rounded text-cta hover:bg-cta-muted disabled:opacity-40"
        >
          <Check size={9} />
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1.5 text-[10px] group/entry">
      <span
        className="font-mono text-stone-500 cursor-pointer hover:text-cta"
        onClick={() =>
          navigateToClockDate(entry.start.slice(0, 10))
        }
      >
        {fmtDate(entry.start)}
      </span>
      <span className="flex-1 truncate text-stone-600">
        {entry.description}
      </span>
      <span className="tabular-nums text-stone-700">
        {fmtHours(entry.duration_minutes)}
      </span>
      <button
        onClick={startEdit}
        title="Edit entry"
        className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded text-stone-500 hover:text-stone-900"
      >
        <Pencil size={9} />
      </button>
      <button
        onClick={() =>
          updateEntry.mutate({
            startIso: entry.start,
            updates: { task_id: "" },
          })
        }
        disabled={updateEntry.isPending}
        title="Detach from task"
        className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded text-stone-500 hover:text-stone-900 disabled:opacity-40"
      >
        <X size={9} />
      </button>
      <button
        onClick={() => {
          if (window.confirm("Delete this time entry?")) {
            deleteEntry.mutate(entry.start);
          }
        }}
        disabled={deleteEntry.isPending}
        title="Delete entry"
        className="opacity-0 group-hover/entry:opacity-100 p-0.5 rounded text-stone-500 hover:text-red-400 disabled:opacity-40"
      >
        <Trash2 size={9} />
      </button>
    </li>
  );
}

function TaskClockSection({ task }: TaskClockSectionProps) {
  const { data: entries = [] } = useTaskClockEntries(task.id);
  const updateEntry = useUpdateClockEntry();
  const deleteEntry = useDeleteClockEntry();
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  const totalAll = totalMinutes(entries);

  return (
    <div
      className="mt-2 border-t border-border-subtle pt-1.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 text-[10px] text-stone-600 w-full">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 hover:text-stone-900 flex-1 min-w-0"
        >
          {open ? (
            <ChevronDown size={10} />
          ) : (
            <ChevronRight size={10} />
          )}
          <Clock size={10} />
          <span className="truncate">
            {entries.length}{" "}
            {entries.length === 1 ? "entry" : "entries"}
            {" · "}
            {fmtHours(totalAll)}
          </span>
        </button>
      </div>
      {open && (
        <ul className="mt-1 ml-5 space-y-0.5">
          {entries.map((e) => (
            <ClockEntryRow
              key={e.start}
              entry={e}
              updateEntry={updateEntry}
              deleteEntry={deleteEntry}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface GithubIssueInputProps {
  customer: string;
  value: string;
  onChange: (v: string) => void;
  inputClassName: string;
}

function GithubIssueInput({
  customer,
  value,
  onChange,
  inputClassName,
}: GithubIssueInputProps) {
  const [issues, setIssues] = useState<
    Array<{ number: number; title: string; url: string }>
  >([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function fetchIssues() {
    if (!customer.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/github/issues/${encodeURIComponent(customer.trim())}?limit=50`
      );
      if (res.ok) {
        const data = await res.json() as {
          issues?: Array<{ number: number; title: string; url: string }>;
        };
        setIssues(data.issues ?? []);
        setOpen(true);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex gap-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="GitHub issue URL"
          className={[inputClassName, "flex-1"].join(" ")}
        />
        {customer.trim() && (
          <button
            type="button"
            onClick={fetchIssues}
            disabled={loading}
            title="Pick GitHub issue"
            className="px-2 rounded bg-surface-raised border border-border text-stone-600 hover:text-cta hover:border-cta transition-colors disabled:opacity-40"
          >
            <GitBranch size={11} />
          </button>
        )}
      </div>
      {open && issues.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg bg-surface-overlay border border-border shadow-lg">
          {issues.map((issue) => (
            <li key={issue.number}>
              <button
                type="button"
                onClick={() => { onChange(issue.url); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-stone-800 hover:bg-cta-muted transition-colors flex items-center gap-2"
              >
                <span className="text-stone-500 font-mono shrink-0">
                  #{issue.number}
                </span>
                <span className="truncate">{issue.title}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-1 text-[10px] text-stone-500 hover:text-stone-700"
            >
              Close
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function stripCustomerPrefix(title: string): string {
  return title.replace(CUSTOMER_PREFIX_RE, "");
}

interface TaskCardProps {
  task: Task;
  statusColor: string;
  isDragOverlay?: boolean;
  onTagClick?: (tag: string) => void;
}

export function TaskCard({
  task,
  statusColor,
  isDragOverlay = false,
  onTagClick,
}: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const customerColors = useCustomerColors();
  const startClock = useStartTimer();
  const stopClock = useStopTimer();
  const { data: activeTimer } = useActiveTimer();
  const isTimerRunning = !!(
    activeTimer?.active
    && activeTimer?.customer === task.customer
    && activeTimer?.description
      === stripCustomerPrefix(task.title)
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCustomer, setEditCustomer] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editBody, setEditBody] = useState("");
  const [editGithubUrl, setEditGithubUrl] = useState("");
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const updateTask = useUpdateTask();
  const setTaskTags = useSetTaskTags();
  const archiveTask = useArchiveTask();

  useEffect(() => {
    if (!confirmArchive) return;
    function handleClick(e: MouseEvent) {
      if (
        confirmRef.current &&
        !confirmRef.current.contains(e.target as Node)
      ) {
        setConfirmArchive(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [confirmArchive]);
  const { data: settings } = useSettings();
  const allTags = settings?.tags ?? [];

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function startEdit() {
    setEditTitle(stripCustomerPrefix(task.title));
    setEditCustomer(task.customer ?? "");
    setEditTags([...task.tags]);
    setEditBody(task.body ?? "");
    setEditGithubUrl(task.github_url ?? "");
    setEditing(true);
  }

  function handleSave() {
    const tagsChanged =
      JSON.stringify([...editTags].sort()) !==
      JSON.stringify([...task.tags].sort());
    updateTask.mutate(
      {
        taskId: task.id,
        updates: {
          title: editTitle.trim(),
          customer: editCustomer.trim(),
          body: editBody,
          github_url: editGithubUrl,
        },
      },
      {
        onSuccess: () => {
          if (tagsChanged) {
            setTaskTags.mutate(
              { taskId: task.id, tags: editTags },
              { onSuccess: () => setEditing(false) }
            );
          } else {
            setEditing(false);
          }
        },
      }
    );
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={[
        "group relative rounded-lg border",
        "bg-surface-card border-border",
        "shadow-card hover:shadow-card-hover",
        "transition-all duration-150",
        isDragging ? "opacity-40" : "opacity-100",
        isDragOverlay ? "shadow-card-drag rotate-1 scale-105" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Status color stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg"
        style={{ backgroundColor: statusColor }}
      />

      <div className="flex items-stretch">
        {/* Drag handle */}
        <div
          {...listeners}
          className="flex items-center pl-3 pr-1 cursor-grab active:cursor-grabbing text-stone-400 hover:text-stone-600 shrink-0"
        >
          <GripVertical size={12} strokeWidth={2} />
        </div>

        {/* Card content */}
        <div className="flex-1 min-w-0 py-3 pr-3">
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <CustomerAutocomplete
                autoFocus
                value={editCustomer}
                onChange={setEditCustomer}
                onKeyDown={handleEditKeyDown}
                inputClassName={editInputCls}
              />
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleEditKeyDown}
                placeholder="Title"
                className={editInputCls}
              />
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                onKeyDown={handleEditKeyDown}
                placeholder="Description (optional)"
                rows={3}
                className={[editInputCls, "resize-none"].join(" ")}
              />
              <div onPointerDown={(e) => e.stopPropagation()}>
                <GithubIssueInput
                  customer={editCustomer}
                  value={editGithubUrl}
                  onChange={setEditGithubUrl}
                  inputClassName={editInputCls}
                />
              </div>
              <div onPointerDown={(e) => e.stopPropagation()}>
                <TagDropdown
                  selected={editTags}
                  allTags={allTags}
                  onChange={setEditTags}
                />
              </div>
              <div className="flex gap-1 justify-end items-center">
                <span className="text-[10px] text-stone-400 mr-auto">
                  ⌘↵ to save
                </span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setEditing(false)}
                  className="p-1 text-stone-500 hover:text-stone-900 rounded"
                >
                  <X size={12} />
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleSave}
                  disabled={
                    updateTask.isPending || setTaskTags.isPending
                  }
                  className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
                >
                  <Check size={12} />
                </button>
              </div>
            </div>
          ) : (
            <>
              {task.customer && (
                <div className="mb-1.5">
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded",
                      "text-[10px] font-semibold tracking-wider uppercase",
                      "bg-cta-muted text-cta-hover",
                    ].join(" ")}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        background: customerColors[task.customer] || "#a1a1aa",
                      }}
                    />
                    {task.customer}
                  </span>
                </div>
              )}
              <p className="text-sm font-medium text-stone-900 leading-snug mb-1">
                {stripCustomerPrefix(task.title)}
              </p>
              {task.body && (
                <div className="mb-1.5">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setBodyExpanded((v) => !v)}
                    className="flex items-center gap-1 text-[10px] text-stone-500 hover:text-stone-700 transition-colors"
                  >
                    {bodyExpanded ? (
                      <ChevronDown size={10} />
                    ) : (
                      <ChevronRight size={10} />
                    )}
                    Description
                  </button>
                  {bodyExpanded && (
                    <div
                      className="mt-1 pl-1 border-l border-border-subtle"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <Markdown className="text-xs text-stone-700 [&_p]:mb-1 [&_p]:leading-relaxed">
                        {task.body}
                      </Markdown>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {task.tags.map((tagName) => {
                  const def = allTags.find((t) => t.name === tagName);
                  return def ? (
                    <button
                      key={tagName}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onTagClick?.(tagName)}
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: def.color }}
                    >
                      {tagName}
                    </button>
                  ) : (
                    <button
                      key={tagName}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onTagClick?.(tagName)}
                      className={[
                        "px-1.5 py-0.5 rounded text-[10px] font-medium",
                        "bg-surface-overlay text-stone-700",
                        "border border-border-subtle",
                        "hover:border-cta hover:text-cta transition-colors",
                      ].join(" ")}
                    >
                      {tagName}
                    </button>
                  );
                })}
                {task.github_url && (
                  <a
                    href={task.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onPointerDown={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-overlay border border-border-subtle text-stone-700 hover:text-cta hover:border-cta transition-colors"
                    title={task.github_url}
                  >
                    <GitBranch size={10} />
                    #{extractIssueNumber(task.github_url)}
                  </a>
                )}
                <RelDate
                  date={task.created}
                  className="ml-auto text-[10px] text-stone-500 shrink-0"
                />
              </div>
              <TaskClockSection task={task} />
            </>
          )}
        </div>

        {/* Hover actions */}
        {!editing && !isDragOverlay && (
          <div className="flex flex-col items-center gap-1 px-1 py-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {task.body && (
              <span onPointerDown={(e) => e.stopPropagation()}>
                <ContentPopup
                  content={task.body}
                  title={stripCustomerPrefix(task.title)}
                  markdown
                  iconSize={11}
                />
              </span>
            )}
            {task.state_history &&
              task.state_history.length > 0 && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setHistoryOpen(true)}
                className="p-1 rounded text-stone-400 hover:text-cta hover:bg-cta-muted transition-colors"
                title="State history"
              >
                <ListRestart size={11} />
              </button>
            )}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (isTimerRunning) {
                  stopClock.mutate();
                  return;
                }
                if (!task.customer) return;
                startClock.mutate({
                  customer: task.customer,
                  description: stripCustomerPrefix(
                    task.title,
                  ),
                  taskId: task.id,
                });
              }}
              disabled={
                startClock.isPending
                || stopClock.isPending
              }
              className={[
                "p-1 rounded transition-colors",
                "disabled:opacity-40",
                isTimerRunning
                  ? "text-green-500 animate-pulse"
                  : "text-stone-400 hover:text-green-500 hover:bg-green-500/10 opacity-0 group-hover:opacity-100",
              ].join(" ")}
              title={
                isTimerRunning
                  ? "Stop timer"
                  : "Start timer"
              }
            >
              <Clock size={11} />
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={startEdit}
              className="p-1 rounded text-stone-400 hover:text-cta hover:bg-cta-muted transition-colors"
              title="Edit"
            >
              <Pencil size={11} />
            </button>
            <div className="relative" ref={confirmRef}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmArchive(true);
                }}
                disabled={archiveTask.isPending}
                className="p-1 rounded text-stone-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                title="Archive"
              >
                <Trash2 size={11} />
              </button>
              {confirmArchive && (
                <div className="absolute right-0 top-full mt-1 z-50 flex items-center gap-1 px-2 py-1 rounded bg-surface-overlay border border-border shadow-lg whitespace-nowrap">
                  <span className="text-[10px] text-stone-700">
                    Archive?
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      archiveTask.mutate(task.id);
                      setConfirmArchive(false);
                    }}
                    className="p-0.5 rounded text-red-400 hover:bg-red-500/10"
                  >
                    <Check size={10} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmArchive(false);
                    }}
                    className="p-0.5 rounded text-stone-600 hover:text-stone-900"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* State history popup */}
      {historyOpen && task.state_history && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setHistoryOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-surface-card rounded-xl shadow-lg border border-border p-5 w-80 max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
                State History
              </h3>
              <button
                onClick={() => setHistoryOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-stone-900"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {task.state_history.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-[11px] py-1"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-stone-400" />
                  <span className="font-medium text-stone-800">
                    {h.to}
                  </span>
                  <span className="text-stone-500">
                    from {h.from}
                  </span>
                  <RelDate
                    date={h.timestamp}
                    className="ml-auto text-stone-400 text-[10px]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const editInputCls = [
  "w-full px-2 py-1 rounded text-xs",
  "bg-surface-raised border border-border",
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
].join(" ");
