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
import { useContracts } from "../../hooks/useContracts";
import { useTasks } from "../../hooks/useTasks";
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

  return (
    <>
      <tr className="bg-surface-raised/40">
        {/* Date */}
        <td className="px-3 py-2">
          <input
            autoFocus
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
            <select
              value={contract}
              onChange={(e) =>
                setContract(e.target.value)
              }
              className={smallInputCls}
            >
              <option value="">{tc("noContract")}</option>
              {contracts.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
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
          <input
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder={tc("description")}
            className={smallInputCls}
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
                "p-1 rounded text-stone-600 " +
                "hover:text-stone-900"
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
        <td colSpan={7} className="px-3 pb-2">
          <textarea
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
          <label className={
            "flex items-center gap-1.5 mt-1.5 " +
            "text-xs text-stone-600 cursor-pointer"
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
        </td>
      </tr>
    </>
  );
}
