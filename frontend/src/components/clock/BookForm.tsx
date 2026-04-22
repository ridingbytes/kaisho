/**
 * Quick-book form that lets the user create a new clock
 * entry without starting a timer. Shown inline below the
 * ClockView toolbar.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { useContracts } from "../../hooks/useContracts";
import { useQuickBook } from "../../hooks/useClocks";
import { inputCls } from "../../styles/formStyles";

/** Props for the {@link BookForm} component. */
export interface BookFormProps {
  onClose: () => void;
}

/**
 * Inline form to quick-book a clock entry with
 * duration, customer, contract, description and task.
 */
export function BookForm({ onClose }: BookFormProps) {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const [duration, setDuration] = useState("");
  const [customer, setCustomer] = useState("");
  const [contract, setContract] = useState("");
  const [description, setDescription] = useState("");
  const [taskId, setTaskId] = useState<string | null>(
    null,
  );
  const [taskTitle, setTaskTitle] = useState("");
  const { data: allContracts = [] } = useContracts(
    customer || null,
  );
  const contracts = allContracts.filter(
    (c) => !c.invoiced,
  );
  const book = useQuickBook();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!duration.trim()) return;
    book.mutate(
      {
        duration: duration.trim(),
        customer: customer.trim(),
        description: description.trim(),
        contract: contract || undefined,
        taskId: taskId ?? undefined,
      },
      {
        onSuccess: () => {
          setDuration("");
          setCustomer("");
          setContract("");
          setDescription("");
          setTaskId(null);
          setTaskTitle("");
          onClose();
        },
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className={
        "flex flex-wrap items-end gap-3 px-6 py-3 " +
        "border-b border-border-subtle " +
        "bg-surface-card/60"
      }
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          {tc("duration")} *
        </label>
        <input
          autoFocus
          className={`${inputCls} w-28`}
          placeholder={t("durationPlaceholder")}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          {tc("customer")} *
        </label>
        <CustomerAutocomplete
          value={customer}
          onChange={(v) => {
            setCustomer(v);
            setContract("");
          }}
          inputClassName={inputCls}
          className="w-44"
        />
      </div>
      {contracts.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-stone-600 uppercase tracking-wider">
            {tc("contract")}
          </label>
          <select
            value={contract}
            onChange={(e) =>
              setContract(e.target.value)
            }
            className={`${inputCls} w-36`}
          >
            <option value="">{tc("noNone")}</option>
            {contracts.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
                {c.end_date ? ` (${tc("closed")})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1 flex-1 min-w-40">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          {tc("description")}
        </label>
        <input
          className={inputCls}
          placeholder={t("whatDidYouWorkOn")}
          value={description}
          onChange={(e) =>
            setDescription(e.target.value)
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          {tc("task")}
        </label>
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
          className="w-48"
        />
      </div>
      <div className="flex gap-2 pb-0.5">
        <button
          type="submit"
          disabled={
            book.isPending ||
            !duration.trim()
          }
          className={
            "px-3 py-1.5 rounded bg-cta text-white " +
            "text-xs font-semibold disabled:opacity-40"
          }
        >
          {book.isPending ? t("booking") : t("book")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={
            "px-3 py-1.5 rounded bg-surface-raised " +
            "text-stone-700 text-xs"
          }
        >
          {tc("cancel")}
        </button>
      </div>
      {book.isError && (
        <p className="w-full text-xs text-red-400">
          {(book.error as Error).message}
        </p>
      )}
    </form>
  );
}
