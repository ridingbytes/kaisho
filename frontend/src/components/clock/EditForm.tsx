/**
 * Inline edit form rendered as table rows that replace
 * the read-only {@link EntryRow} when the user clicks
 * the edit button.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import {
  ContractSelect,
} from "../common/ContractSelect";
import { useContracts } from "../../hooks/useContracts";
import { useTasks } from "../../hooks/useTasks";
import { useProjects } from "../../hooks/useProjects";
import { useUpdateClockEntry } from "../../hooks/useClocks";
import { minutesToDecimal } from "../../utils/formatting";
import { taskTitleById } from "../../utils/customerPrefix";
import { smallInputCls } from "../../styles/formStyles";
import type { ClockEntry } from "../../types";

/** Props for the {@link EditForm} component. */
export interface EditFormProps {
  entry: ClockEntry;
  onClose: () => void;
}

/**
 * Two-row inline form for editing an existing clock
 * entry. The first row contains the main fields; the
 * second row holds notes and the invoiced checkbox.
 */
export function EditForm({
  entry,
  onClose,
}: EditFormProps) {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const [entryDate, setEntryDate] = useState(
    entry.start.slice(0, 10),
  );
  const [startTime, setStartTime] = useState(
    entry.start ? entry.start.slice(11, 16) : "",
  );
  const [customer, setCustomer] = useState(
    entry.customer,
  );
  const [contract, setContract] = useState(
    entry.contract ?? "",
  );
  const [description, setDescription] = useState(
    entry.description,
  );
  const [hours, setHours] = useState(
    minutesToDecimal(entry.duration_minutes),
  );
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [invoiced, setInvoiced] = useState(
    entry.invoiced ?? false,
  );
  const [project, setProject] = useState(
    entry.project ?? "",
  );
  const { data: projects = [] } = useProjects(true);
  const [taskId, setTaskId] = useState<string | null>(
    entry.task_id,
  );
  const { data: tasks = [] } = useTasks(true);
  const { data: contracts = [] } = useContracts(
    customer || null,
  );
  const initialTitle = entry.task_id
    ? (taskTitleById(tasks, entry.task_id) ?? "")
    : "";
  const [taskTitle, setTaskTitle] = useState(
    initialTitle,
  );
  const update = useUpdateClockEntry();

  function handleSave() {
    const updates: {
      customer?: string;
      description?: string;
      hours?: number;
      new_date?: string;
      start_time?: string;
      task_id?: string;
      contract?: string;
      notes?: string;
      invoiced?: boolean;
      project?: string;
    } = {};
    const origDate = entry.start.slice(0, 10);
    const origTime = entry.start.slice(11, 16);
    if (
      entryDate !== origDate ||
      startTime !== origTime
    ) {
      updates.new_date = entryDate;
      updates.start_time = startTime;
    }
    if (customer.trim() !== entry.customer) {
      updates.customer = customer.trim();
    }
    if (description.trim() !== entry.description) {
      updates.description = description.trim();
    }
    const h = parseFloat(hours);
    if (
      !isNaN(h) &&
      h > 0 &&
      h !== (entry.duration_minutes ?? 0) / 60
    ) {
      updates.hours = h;
    }
    const newTaskId = taskId ?? "";
    const oldTaskId = entry.task_id ?? "";
    if (newTaskId !== oldTaskId) {
      updates.task_id = newTaskId;
    }
    if (contract !== (entry.contract ?? "")) {
      updates.contract = contract;
    }
    if (notes !== (entry.notes ?? "")) {
      updates.notes = notes;
    }
    if (invoiced !== (entry.invoiced ?? false)) {
      updates.invoiced = invoiced;
    }
    if (project !== (entry.project ?? "")) {
      updates.project = project;
    }
    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }
    update.mutate(
      { entry, updates },
      { onSuccess: onClose },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (
      e.key === "Enter" ||
      ((e.metaKey || e.ctrlKey) && e.key === "Enter")
    ) {
      handleSave();
    }
    if (e.key === "Escape") onClose();
  }

  // The multi-line description keeps plain Enter for
  // newlines; only Cmd/Ctrl+Enter saves, Escape cancels.
  function handleBodyKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleSave();
    }
    if (e.key === "Escape") onClose();
  }

  return (
    <>
      <tr className="bg-surface-raised/40">
        {/* Bulk-select spacer */}
        <td />
        {/* Date */}
        <td className="px-3 py-2">
          <input
            type="date"
            value={entryDate}
            onChange={(e) =>
              setEntryDate(e.target.value)
            }
            onKeyDown={handleKeyDown}
            className={smallInputCls}
          />
        </td>
        {/* Time */}
        <td className="px-3 py-2">
          <input
            type="time"
            value={startTime}
            onChange={(e) =>
              setStartTime(e.target.value)
            }
            onKeyDown={handleKeyDown}
            className={smallInputCls}
            title={t("startTime")}
          />
        </td>
        {/* Customer */}
        <td className="px-3 py-2">
          <CustomerAutocomplete
            value={customer}
            onChange={(v) => {
              setCustomer(v);
              setContract("");
            }}
            onKeyDown={handleKeyDown}
            inputClassName={smallInputCls}
          />
        </td>
        {/* Contract */}
        <td className="px-3 py-2">
          {contracts.length > 0 && (
            <ContractSelect
              contracts={contracts}
              value={contract}
              onChange={setContract}
              className={smallInputCls}
            />
          )}
        </td>
        {/* Task */}
        <td className="px-3 py-2 min-w-[160px]">
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
            inputClassName={smallInputCls}
            onKeyDown={handleKeyDown}
          />
        </td>
        {/* Description */}
        <td className="px-3 py-2">
          <textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
            onKeyDown={handleBodyKeyDown}
            placeholder={tc("description")}
            rows={3}
            className={[smallInputCls, "resize-y"].join(" ")}
          />
        </td>
        {/* Duration + actions */}
        <td className="px-3 py-2 text-right min-w-[120px]">
          <div className="flex items-center gap-1 justify-end">
            <input
              value={hours}
              onChange={(e) =>
                setHours(e.target.value)
              }
              onKeyDown={handleKeyDown}
              placeholder="h"
              className={
                `${smallInputCls} w-16 tabular-nums`
              }
              type="number"
              step="0.25"
              min="0"
            />
            <button
              onClick={onClose}
              className={
                "p-1 rounded text-fg-muted " +
                "hover:text-fg-strong"
              }
            >
              <X size={13} />
            </button>
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className={
                "p-1 rounded text-cta " +
                "hover:bg-cta-muted " +
                "disabled:opacity-40"
              }
            >
              <Check size={13} />
            </button>
          </div>
        </td>
      </tr>
      {/* Notes + invoiced row */}
      <tr className={
        "bg-surface-raised/40 border-b " +
        "border-border-subtle"
      }>
        <td colSpan={8} className="px-3 pb-2">
          <textarea
            autoFocus
            value={notes}
            onChange={(e) =>
              setNotes(e.target.value)
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey)
              ) {
                e.preventDefault();
                handleSave();
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder={tc("notesOptional")}
            rows={2}
            className={
              `${smallInputCls} w-full resize-y`
            }
          />
          <div className="flex items-center gap-3 mt-1.5">
            <label className={
              "flex items-center gap-1.5 " +
              "text-xs text-fg-muted cursor-pointer"
            }>
              <input
                type="checkbox"
                checked={invoiced}
                onChange={(e) =>
                  setInvoiced(e.target.checked)
                }
                className={
                  "rounded border-border text-cta " +
                  "focus:ring-cta"
                }
              />
              {tc("invoiced")}
            </label>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className={smallInputCls}
              title={t("project", "Project")}
            >
              <option value="">
                {t("noProject", "No project")}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </td>
      </tr>
    </>
  );
}
