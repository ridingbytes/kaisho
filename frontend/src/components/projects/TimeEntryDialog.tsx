import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../common/Dialog";
import { MarkdownEditor } from "../common/MarkdownEditor";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { ContractSelect } from "../common/ContractSelect";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { useUpdateClockEntry } from "../../hooks/useClocks";
import { useContracts } from "../../hooks/useContracts";
import { useProjects } from "../../hooks/useProjects";
import { useTasks } from "../../hooks/useTasks";
import { taskTitleById } from "../../utils/customerPrefix";
import { fieldCls, inputCls } from "../settings/styles";
import type { ClockEntry } from "../../types";

interface Props {
  entry: ClockEntry;
  onClose: () => void;
}

/** Rich edit subview for a clock entry. */
export function TimeEntryDialog({ entry, onClose }: Props) {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation("common");
  const update = useUpdateClockEntry();
  const { data: projects = [] } = useProjects(true);
  const { data: tasks = [] } = useTasks(true);

  const [description, setDescription] = useState(
    entry.description,
  );
  const [customer, setCustomer] = useState(entry.customer);
  const [hours, setHours] = useState(
    ((entry.duration_minutes ?? 0) / 60).toFixed(2),
  );
  const [contract, setContract] = useState(entry.contract ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [invoiced, setInvoiced] = useState(entry.invoiced);
  const [project, setProject] = useState(entry.project ?? "");
  const [entryDate, setEntryDate] = useState(
    entry.start.slice(0, 10),
  );
  const [startTime, setStartTime] = useState(
    entry.start ? entry.start.slice(11, 16) : "",
  );
  const [taskId, setTaskId] = useState<string | null>(
    entry.task_id,
  );
  const [taskTitle, setTaskTitle] = useState(
    entry.task_id
      ? (taskTitleById(tasks, entry.task_id) ?? "")
      : "",
  );
  const { data: contracts = [] } = useContracts(
    customer || null,
  );

  function save() {
    const h = parseFloat(hours);
    const origDate = entry.start.slice(0, 10);
    const origTime = entry.start.slice(11, 16);
    const updates: Record<string, unknown> = {
      description,
      customer,
      hours: isNaN(h) ? undefined : h,
      contract,
      notes,
      invoiced,
      project,
      task_id: taskId ?? "",
    };
    if (entryDate !== origDate || startTime !== origTime) {
      updates.new_date = entryDate;
      updates.start_time = startTime;
    }
    update.mutate(
      {
        entry: { sync_id: entry.sync_id, start: entry.start },
        updates,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("editEntry")}
      size="lg"
      resizable
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className={fieldCls}>
            {tc("cancel")}
          </button>
          <button
            onClick={save}
            disabled={update.isPending}
            className="px-3 py-1.5 rounded text-sm bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
          >
            {tc("save")}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="block text-2xs uppercase tracking-wider text-fg-muted mb-1">
            {t("descriptionLabel")}
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block">
          <span className="block text-2xs uppercase tracking-wider text-fg-muted mb-1">
            {t("taskLabel", "Task")}
          </span>
          <TaskAutocomplete
            taskId={taskId}
            value={taskTitle}
            onChange={setTaskTitle}
            onSelect={(id, label) => {
              setTaskId(id);
              setTaskTitle(label);
            }}
            onClear={() => {
              setTaskId(null);
              setTaskTitle("");
            }}
            customer={customer}
            inputClassName={inputCls}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-2xs uppercase tracking-wider text-fg-muted mb-1">
              {tc("date")}
            </span>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className={`${fieldCls} w-full`}
            />
          </label>
          <label className="block">
            <span className="block text-2xs uppercase tracking-wider text-fg-muted mb-1">
              {t("startTime")}
            </span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={`${fieldCls} w-full`}
            />
          </label>
          <label className="block">
            <span className="block text-2xs uppercase tracking-wider text-fg-muted mb-1">
              {tc("customer")}
            </span>
            <CustomerAutocomplete
              value={customer}
              onChange={(v) => {
                setCustomer(v);
                setContract("");
              }}
              inputClassName={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-2xs uppercase tracking-wider text-fg-muted mb-1">
              {t("hours")}
            </span>
            <input
              type="number"
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className={`${fieldCls} w-full tabular-nums`}
            />
          </label>
          <label className="block">
            <span className="block text-2xs uppercase tracking-wider text-fg-muted mb-1">
              {t("contract")}
            </span>
            <ContractSelect
              contracts={contracts}
              value={contract}
              onChange={setContract}
              className={`${fieldCls} w-full`}
            />
          </label>
          <label className="block">
            <span className="block text-2xs uppercase tracking-wider text-fg-muted mb-1">
              {t("project")}
            </span>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className={`${fieldCls} w-full`}
            >
              <option value="">{t("noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 mt-5 text-sm text-fg cursor-pointer">
            <input
              type="checkbox"
              checked={invoiced}
              onChange={(e) => setInvoiced(e.target.checked)}
              className="rounded border-border text-cta"
            />
            {t("invoiced")}
          </label>
        </div>
        <label className="block">
          <span className="block text-2xs uppercase tracking-wider text-fg-muted mb-1">
            {t("notesLabel")}
          </span>
          <MarkdownEditor
            value={notes}
            onChange={setNotes}
            bucketId={entry.sync_id ?? entry.start}
            rows={8}
          />
        </label>
      </div>
    </Dialog>
  );
}
