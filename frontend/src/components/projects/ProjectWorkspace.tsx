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
import { PROJECT_STATUSES, statusClasses } from "./projectStatus";
import {
  useDeleteProject,
  useProjectAggregate,
  useUpdateProject,
} from "../../hooks/useProjects";
import { useUpdateTask } from "../../hooks/useTasks";
import { useSetView } from "../../context/ViewContext";
import { formatDate, formatHours } from "../../utils/formatting";
import { fieldCls, inputCls } from "../settings/styles";
import type { Task } from "../../types";

type Tab = "tasks" | "time" | "files";

interface Props {
  projectId: string;
  onBack: () => void;
}

/** Full project workspace: description, milestones, and
 * assigned tasks / time / files. */
export function ProjectWorkspace({ projectId, onBack }: Props) {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation("common");
  const { data, isLoading } = useProjectAggregate(projectId);
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const updateTask = useUpdateTask();
  const setView = useSetView();

  const [tab, setTab] = useState<Tab>("tasks");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignTitle, setAssignTitle] = useState("");

  if (isLoading || !data) {
    return (
      <StateMessage kind="loading">{t("loading")}</StateMessage>
    );
  }
  const { project, tasks, entries, total_minutes } = data;

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

  function assign(taskId: string) {
    updateTask.mutate(
      { taskId, updates: { project: projectId } },
      { onSuccess: () => { setAssignTitle(""); setAssigning(false); } },
    );
  }

  function unassign(taskId: string) {
    updateTask.mutate({ taskId, updates: { project: "" } });
  }

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "tasks", label: t("tabTasks"), count: tasks.length },
    { id: "time", label: t("tabTime"), count: entries.length },
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
              <button
                onClick={() =>
                  setView("customers", project.customer ?? "")
                }
                className="px-1.5 py-0.5 rounded text-2xs font-semibold uppercase tracking-wider bg-cta-muted text-cta-hover hover:bg-cta/20"
              >
                {project.customer}
              </button>
            )}
            {project.contract && (
              <span className="px-1.5 py-0.5 rounded text-2xs bg-surface-overlay text-fg">
                {project.contract}
              </span>
            )}
            {(project.start || project.due) && (
              <span className="text-2xs text-fg-muted">
                {project.start || "…"} → {project.due || "…"}
              </span>
            )}
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
            <textarea
              autoFocus
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              rows={5}
              className={`${inputCls} w-full resize-y`}
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

      {/* Milestones */}
      <section className="rounded-lg border border-border bg-surface-card p-4">
        <h2 className="text-2xs uppercase tracking-wider text-fg-muted mb-2">
          {t("milestones")}
        </h2>
        <MilestonesSection
          projectId={projectId}
          milestones={project.milestones}
        />
      </section>

      {/* Aggregated tabs */}
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
            <TasksTab
              tasks={tasks}
              assigning={assigning}
              assignTitle={assignTitle}
              setAssignTitle={setAssignTitle}
              onStartAssign={() => setAssigning(true)}
              onCancelAssign={() => setAssigning(false)}
              onAssign={assign}
              onUnassign={unassign}
              onOpenTask={(title) => setView("board", title)}
              t={t}
            />
          )}
          {tab === "time" && (
            <TimeTab
              entries={entries}
              totalMinutes={total_minutes}
              t={t}
            />
          )}
          {tab === "files" && (
            <ProjectFilesPanel projectId={projectId} />
          )}
        </div>
      </section>
    </div>
  );
}

function TasksTab({
  tasks, assigning, assignTitle, setAssignTitle,
  onStartAssign, onCancelAssign, onAssign, onUnassign,
  onOpenTask, t,
}: {
  tasks: Task[];
  assigning: boolean;
  assignTitle: string;
  setAssignTitle: (v: string) => void;
  onStartAssign: () => void;
  onCancelAssign: () => void;
  onAssign: (taskId: string) => void;
  onUnassign: (taskId: string) => void;
  onOpenTask: (title: string) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border-subtle">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center gap-2 py-2 group"
          >
            <span className="px-1.5 py-0.5 rounded text-2xs font-medium bg-surface-overlay text-fg-muted uppercase">
              {task.status}
            </span>
            <button
              onClick={() => onOpenTask(task.title)}
              className="flex-1 text-left text-sm truncate hover:text-cta"
            >
              {task.title}
            </button>
            <ConfirmPopover onConfirm={() => onUnassign(task.id)}>
              <button
                className="p-1 rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-red-400"
                title={t("unassign")}
              >
                <X size={13} />
              </button>
            </ConfirmPopover>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="text-xs text-fg-muted py-1">
            {t("noTasks")}
          </li>
        )}
      </ul>
      {assigning ? (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <TaskAutocomplete
              taskId={null}
              value={assignTitle}
              onChange={setAssignTitle}
              onSelect={(id) => onAssign(id)}
              onClear={() => setAssignTitle("")}
              customer=""
              inputClassName={inputCls}
            />
          </div>
          <button
            onClick={onCancelAssign}
            className="p-1 text-fg-muted hover:text-fg-strong"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <button
          onClick={onStartAssign}
          className="inline-flex items-center gap-1 text-xs text-cta hover:underline"
        >
          <Plus size={13} /> {t("assignTask")}
        </button>
      )}
    </div>
  );
}

function TimeTab({
  entries, totalMinutes, t,
}: {
  entries: import("../../types").ClockEntry[];
  totalMinutes: number;
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
          <li
            key={e.sync_id || `${e.start}-${i}`}
            className="flex items-center gap-2 py-1.5 text-xs"
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
