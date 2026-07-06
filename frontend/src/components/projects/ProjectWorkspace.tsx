import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Check,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { Markdown } from "../common/Markdown";
import { StateMessage } from "../common/StateMessage";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { MilestonesSection } from "./MilestonesSection";
import { ProjectFilesPanel } from "./ProjectFilesPanel";
import { ProjectNotesTab } from "./ProjectNotesTab";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { TimeEntryDialog } from "./TimeEntryDialog";
import { MarkdownEditor } from "../common/MarkdownEditor";
import { PROJECT_STATUSES, statusClasses } from "./projectStatus";
import {
  useDeleteProject,
  useProjectAggregate,
  useUpdateProject,
} from "../../hooks/useProjects";
import { useAddTask, useUpdateTask } from "../../hooks/useTasks";
import { useSettings } from "../../hooks/useSettings";
import { formatDate, formatHours } from "../../utils/formatting";
import { formatDateLabel } from "../../utils/dateLabel";
import { fieldCls, inputCls } from "../settings/styles";
import type { ClockEntry, Milestone, Task } from "../../types";

type Tab = "tasks" | "time" | "notes" | "files";

interface Props {
  projectId: string;
  onBack: () => void;
}

/** Full project workspace: description, milestones, and
 * milestone-grouped tasks / time / files with rich edit
 * subviews. */
export function ProjectWorkspace({ projectId, onBack }: Props) {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation("common");
  const { data, isLoading } = useProjectAggregate(projectId);
  const update = useUpdateProject();
  const remove = useDeleteProject();

  const [tab, setTab] = useState<Tab>("tasks");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [openEntry, setOpenEntry] =
    useState<ClockEntry | null>(null);
  const [tagDraft, setTagDraft] = useState("");

  function addTag(e: React.FormEvent) {
    e.preventDefault();
    const tag = tagDraft.trim();
    setTagDraft("");
    if (!data || !tag || data.project.tags.includes(tag)) return;
    update.mutate({
      id: projectId,
      updates: { tags: [...data.project.tags, tag] },
    });
  }

  function removeTag(tag: string) {
    if (!data) return;
    update.mutate({
      id: projectId,
      updates: {
        tags: data.project.tags.filter((x) => x !== tag),
      },
    });
  }

  if (isLoading || !data) {
    return (
      <StateMessage kind="loading">{t("loading")}</StateMessage>
    );
  }
  const {
    project, tasks, entries, notes, total_minutes,
  } = data;

  function saveName() {
    if (nameDraft.trim()) {
      update.mutate({
        id: projectId, updates: { name: nameDraft.trim() },
      });
    }
    setEditingName(false);
  }

  function saveDesc() {
    update.mutate({
      id: projectId, updates: { description: descDraft },
    });
    setEditingDesc(false);
  }

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "tasks", label: t("tabTasks"), count: tasks.length },
    { id: "time", label: t("tabTime"), count: entries.length },
    {
      id: "notes",
      label: t("tabNotes"),
      count: notes.length,
    },
    { id: "files", label: t("tabFiles"), count: 0 },
  ];

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded text-fg-muted hover:text-fg-strong hover:bg-surface-overlay"
          title={tc("back")}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className={`${inputCls} text-lg`}
              />
              <button onClick={saveName} className="p-1 text-cta">
                <Check size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-xl font-semibold text-fg-strong truncate">
                {project.name}
              </h1>
              <button
                onClick={() => {
                  setNameDraft(project.name);
                  setEditingName(true);
                }}
                className="p-1 rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-fg"
              >
                <Pencil size={13} />
              </button>
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {project.customer && (
              <span className="px-1.5 py-0.5 rounded text-2xs font-semibold uppercase tracking-wider bg-cta-muted text-cta-hover">
                {project.customer}
              </span>
            )}
            {project.contract && (
              <span className="px-1.5 py-0.5 rounded text-2xs bg-surface-overlay text-fg">
                {project.contract}
              </span>
            )}
            {(project.start || project.due) && (
              <span className="text-2xs text-fg-muted">
                {formatDateLabel(project.start) || "…"} →{" "}
                {formatDateLabel(project.due) || "…"}
              </span>
            )}
            <span className="text-2xs text-fg-muted">
              · {formatHours(total_minutes)} {t("logged")}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-surface-overlay text-fg-muted"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="hover:text-red-400"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <form onSubmit={addTag}>
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder={t("addTag")}
                className="text-2xs bg-transparent border-b border-border-subtle focus:outline-none focus:border-cta w-20 px-1 py-0.5"
              />
            </form>
          </div>
        </div>
        <select
          value={project.status}
          onChange={(e) =>
            update.mutate({
              id: projectId,
              updates: { status: e.target.value },
            })
          }
          className={[
            fieldCls, "font-semibold uppercase tracking-wider",
            statusClasses(project.status),
          ].join(" ")}
        >
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status_${s}`, s)}
            </option>
          ))}
        </select>
        <ConfirmPopover
          label={t("deleteProjectConfirm")}
          onConfirm={() =>
            remove.mutate(projectId, { onSuccess: onBack })
          }
        >
          <button className="p-1.5 rounded text-fg-muted hover:text-red-400">
            <Trash2 size={15} />
          </button>
        </ConfirmPopover>
      </div>

      {/* Description */}
      <section className="rounded-lg border border-border bg-surface-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xs uppercase tracking-wider text-fg-muted">
            {t("description")}
          </h2>
          {!editingDesc && (
            <button
              onClick={() => {
                setDescDraft(project.description);
                setEditingDesc(true);
              }}
              className="text-2xs text-cta hover:underline"
            >
              {tc("edit")}
            </button>
          )}
        </div>
        {editingDesc ? (
          <div className="space-y-2">
            <MarkdownEditor
              value={descDraft}
              onChange={setDescDraft}
              bucketId={projectId}
              rows={5}
              placeholder={t("descriptionPlaceholder")}
            />
            <div className="flex gap-2">
              <button
                onClick={saveDesc}
                className="px-3 py-1 rounded text-xs bg-cta text-white hover:bg-cta-hover"
              >
                {tc("save")}
              </button>
              <button
                onClick={() => setEditingDesc(false)}
                className={fieldCls}
              >
                {tc("cancel")}
              </button>
            </div>
          </div>
        ) : project.description ? (
          <Markdown compact>{project.description}</Markdown>
        ) : (
          <p className="text-xs text-fg-muted">
            {t("noDescription")}
          </p>
        )}
      </section>

      {/* Milestone management */}
      <section className="rounded-lg border border-border bg-surface-card p-4">
        <h2 className="text-2xs uppercase tracking-wider text-fg-muted mb-2">
          {t("milestones")}
        </h2>
        <MilestonesSection
          projectId={projectId}
          milestones={project.milestones}
        />
      </section>

      {/* Tabs */}
      <section className="rounded-lg border border-border bg-surface-card">
        <div className="flex gap-1 border-b border-border-subtle px-2">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={[
                "px-3 py-2 text-sm font-medium transition-colors",
                tab === tb.id
                  ? "text-cta border-b-2 border-cta -mb-px"
                  : "text-fg-muted hover:text-fg-strong",
              ].join(" ")}
            >
              {tb.label}
              {tb.count > 0 && (
                <span className="ml-1 text-2xs text-fg-subtle">
                  {tb.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === "tasks" && (
            <MilestoneTasks
              projectId={projectId}
              customer={project.customer ?? ""}
              milestones={project.milestones}
              tasks={tasks}
              onOpenTask={setOpenTask}
            />
          )}
          {tab === "time" && (
            <TimeTab
              entries={entries}
              totalMinutes={total_minutes}
              onOpenEntry={setOpenEntry}
              t={t}
            />
          )}
          {tab === "notes" && (
            <ProjectNotesTab
              projectId={projectId}
              customer={project.customer ?? ""}
              notes={notes}
            />
          )}
          {tab === "files" && (
            <ProjectFilesPanel projectId={projectId} />
          )}
        </div>
      </section>

      {openTask && (
        <TaskDetailDialog
          task={openTask}
          onClose={() => setOpenTask(null)}
        />
      )}
      {openEntry && (
        <TimeEntryDialog
          entry={openEntry}
          onClose={() => setOpenEntry(null)}
        />
      )}
    </div>
  );
}

/** Tasks grouped under their milestone, plus an
 * "unassigned" bucket. Each group can create a task
 * (pre-filled with customer + project + milestone) or
 * attach an existing one. */
function MilestoneTasks({
  projectId, customer, milestones, tasks, onOpenTask,
}: {
  projectId: string;
  customer: string;
  milestones: Milestone[];
  tasks: Task[];
  onOpenTask: (task: Task) => void;
}) {
  const { t } = useTranslation("projects");
  const validIds = new Set(milestones.map((m) => m.id));
  const groups: { milestone: Milestone | null; tasks: Task[] }[] =
    [
      ...milestones.map((m) => ({
        milestone: m,
        tasks: tasks.filter((task) => task.milestone === m.id),
      })),
      {
        milestone: null,
        tasks: tasks.filter(
          (task) => !task.milestone || !validIds.has(task.milestone),
        ),
      },
    ];

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <TaskGroup
          key={g.milestone?.id ?? "_unassigned"}
          projectId={projectId}
          customer={customer}
          milestone={g.milestone}
          tasks={g.tasks}
          onOpenTask={onOpenTask}
        />
      ))}
      {tasks.length === 0 && milestones.length === 0 && (
        <p className="text-xs text-fg-muted">{t("noTasks")}</p>
      )}
    </div>
  );
}

function TaskGroup({
  projectId, customer, milestone, tasks, onOpenTask,
}: {
  projectId: string;
  customer: string;
  milestone: Milestone | null;
  tasks: Task[];
  onOpenTask: (task: Task) => void;
}) {
  const { t } = useTranslation("projects");
  const add = useAddTask();
  const updateTask = useUpdateTask();
  const { data: settings } = useSettings();
  const [newTitle, setNewTitle] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignVal, setAssignVal] = useState("");

  // Derive "done" from the configured task states rather
  // than guessing from the status name.
  const doneStates = new Set(
    (settings?.task_states ?? [])
      .filter((s) => s.done)
      .map((s) => s.name),
  );

  // The unassigned bucket is only shown when it holds
  // tasks or there are no milestones to file under.
  if (milestone === null && tasks.length === 0) return null;

  function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    add.mutate(
      {
        customer,
        title: newTitle.trim(),
        status: "TODO",
        project: projectId,
        milestone: milestone?.id,
      },
      { onSuccess: () => setNewTitle("") },
    );
  }

  function assignExisting(taskId: string) {
    updateTask.mutate(
      {
        taskId,
        updates: {
          project: projectId,
          milestone: milestone?.id ?? "",
        },
      },
      { onSuccess: () => { setAssignVal(""); setAssigning(false); } },
    );
  }

  const done = tasks.filter((task) =>
    doneStates.has(task.status),
  ).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-xs font-semibold text-fg-strong">
          {milestone ? milestone.title : t("unassignedGroup")}
        </h3>
        {tasks.length > 0 && (
          <span className="text-2xs text-fg-muted tabular-nums">
            {done}/{tasks.length}
          </span>
        )}
        {milestone?.due && (
          <span className="text-2xs text-fg-muted">
            {formatDateLabel(milestone.due)}
          </span>
        )}
      </div>
      <ul className="divide-y divide-border-subtle border-y border-border-subtle">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              onClick={() => onOpenTask(task)}
              className="flex items-center gap-2 py-1.5 w-full text-left hover:bg-surface-overlay/50 px-1 -mx-1 rounded"
            >
              <span className="px-1.5 py-0.5 rounded text-2xs font-medium bg-surface-overlay text-fg-muted uppercase">
                {task.status}
              </span>
              <span className="flex-1 text-sm truncate">
                {task.title.replace(/^\[[^\]]+\]:\s*/, "")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/* The add row is indented and rule-bordered so it
          visually belongs to this milestone group, making
          "which group does this task go to" unambiguous. */}
      <div className="flex items-center gap-3 mt-1.5 pl-3 border-l-2 border-cta-muted">
        <form onSubmit={createTask} className="flex-1 flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={
              milestone
                ? t("addToMilestone", { name: milestone.title })
                : t("addUnassigned")
            }
            className={`${inputCls} flex-1`}
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || add.isPending}
            className="inline-flex items-center gap-1 px-2 rounded text-xs bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
          >
            <Plus size={13} /> {t("add")}
          </button>
        </form>
        {assigning ? (
          <div className="w-52">
            <TaskAutocomplete
              taskId={null}
              value={assignVal}
              onChange={setAssignVal}
              onSelect={(id) => assignExisting(id)}
              onClear={() => setAssignVal("")}
              customer={customer}
              inputClassName={inputCls}
            />
          </div>
        ) : (
          <button
            onClick={() => setAssigning(true)}
            className="text-2xs text-cta hover:underline whitespace-nowrap"
          >
            {t("assignExisting")}
          </button>
        )}
      </div>
    </div>
  );
}

function TimeTab({
  entries, totalMinutes, onOpenEntry, t,
}: {
  entries: ClockEntry[];
  totalMinutes: number;
  onOpenEntry: (e: ClockEntry) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-fg-muted">{t("totalTime")}</span>
        <span className="font-semibold tabular-nums">
          {formatHours(totalMinutes)}
        </span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {entries.map((e, i) => (
          <li key={e.sync_id || `${e.start}-${i}`}>
            <button
              onClick={() => onOpenEntry(e)}
              className="flex items-center gap-2 py-1.5 w-full text-left text-xs hover:bg-surface-overlay/50 px-1 -mx-1 rounded"
            >
              <span className="text-fg-muted tabular-nums">
                {formatDate(e.start)}
              </span>
              <span className="flex-1 truncate">
                {e.description || e.customer}
              </span>
              <span className="tabular-nums">
                {formatHours(e.duration_minutes)}
              </span>
            </button>
          </li>
        ))}
        {entries.length === 0 && (
          <li className="text-xs text-fg-muted py-1">
            {t("noTime")}
          </li>
        )}
      </ul>
    </div>
  );
}
