import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Dialog } from "../common/Dialog";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import {
  useArchiveTask,
  useSetTaskTags,
  useUpdateTask,
} from "../../hooks/useTasks";
import { useSettings } from "../../hooks/useSettings";
import { useProjects } from "../../hooks/useProjects";
import { fieldCls, inputCls } from "../settings/styles";
import type { Task } from "../../types";

interface Props {
  task: Task;
  onClose: () => void;
}

/** Rich edit subview for a task, opened from a project. */
export function TaskDetailDialog({ task, onClose }: Props) {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation("common");
  const { data: settings } = useSettings();
  const { data: projects = [] } = useProjects(true);
  const update = useUpdateTask();
  const setTags = useSetTaskTags();
  const archive = useArchiveTask();

  const bareTitle = task.title
    .replace(/^\[[^\]]+\]:\s*/, "");
  const [title, setTitle] = useState(bareTitle);
  const [customer, setCustomer] = useState(task.customer ?? "");
  const [status, setStatus] = useState(task.status);
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [body, setBody] = useState(task.body);
  const [tags, setTags2] = useState((task.tags ?? []).join(", "));
  const [project, setProject] = useState(task.project ?? "");
  const [milestone, setMilestone] = useState(
    task.milestone ?? "",
  );

  const states = settings?.task_states ?? [];
  const milestones =
    projects.find((p) => p.id === project)?.milestones ?? [];

  function save() {
    update.mutate(
      {
        taskId: task.id,
        updates: {
          title,
          customer,
          status,
          body,
          deadline,
          project,
          // Clear the milestone when it no longer belongs
          // to the chosen project.
          milestone: milestones.some((m) => m.id === milestone)
            ? milestone
            : "",
        },
      },
      {
        onSuccess: () => {
          const parsed = tags
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const current = task.tags ?? [];
          if (parsed.join(",") !== current.join(",")) {
            setTags.mutate({ taskId: task.id, tags: parsed });
          }
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("editTask")}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <ConfirmPopover
            onConfirm={() =>
              archive.mutate(task.id, { onSuccess: onClose })
            }
          >
            <button className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-red-400">
              <Trash2 size={13} /> {t("archiveTask")}
            </button>
          </ConfirmPopover>
          <div className="flex gap-2">
            <button onClick={onClose} className={fieldCls}>
              {tc("cancel")}
            </button>
            <button
              onClick={save}
              disabled={!title.trim() || update.isPending}
              className="px-3 py-1.5 rounded text-sm bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
            >
              {tc("save")}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label={t("taskTitle")}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tc("customer")}>
            <CustomerAutocomplete
              value={customer}
              onChange={setCustomer}
              inputClassName={inputCls}
            />
          </Field>
          <Field label={t("statusLabel")}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${fieldCls} w-full`}
            >
              {states.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.label || s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("project")}>
            <select
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setMilestone("");
              }}
              className={`${fieldCls} w-full`}
            >
              <option value="">{t("noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("milestone")}>
            <select
              value={milestone}
              onChange={(e) => setMilestone(e.target.value)}
              disabled={!milestones.length}
              className={`${fieldCls} w-full`}
            >
              <option value="">{t("noMilestone")}</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("deadlineLabel")}>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={`${fieldCls} w-full`}
            />
          </Field>
          <Field label={t("tagsLabel")}>
            <input
              value={tags}
              onChange={(e) => setTags2(e.target.value)}
              placeholder={t("tagsPlaceholder")}
              className={`${inputCls} w-full`}
            />
          </Field>
        </div>
        <Field label={t("notesLabel")}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className={`${inputCls} w-full resize-y`}
            placeholder={t("notesPlaceholder")}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function Field({
  label, children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-2xs uppercase tracking-wider text-fg-muted mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
