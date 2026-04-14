/**
 * QuickBookForm provides an inline form for quickly
 * booking time entries on a customer card.
 */
import { useState } from "react";
import { Check, X } from "lucide-react";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { useQuickBook } from "../../hooks/useClocks";
import type { Contract } from "../../types";

export interface QuickBookFormProps {
  /** Customer to book time for. */
  customerName: string;
  /** Available contracts for the contract selector. */
  contracts: Contract[];
  /** Pre-selected contract name. */
  defaultContract: string;
  /** Called on cancel or successful submission. */
  onDone: () => void;
}

/** Inline quick-book form for time entries. */
export function QuickBookForm({
  customerName,
  contracts,
  defaultContract,
  onDone,
}: QuickBookFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [duration, setDuration] = useState("");
  const [date, setDate] = useState(today);
  const [contract, setContract] = useState(
    defaultContract,
  );
  const [description, setDescription] = useState("");
  const [taskId, setTaskId] = useState<string | null>(
    null,
  );
  const [taskTitle, setTaskTitle] = useState("");
  const book = useQuickBook();

  const cls =
    "px-2 py-1 rounded-md text-xs "
    + "bg-surface-raised border border-border "
    + "text-stone-900 placeholder-stone-500 "
    + "focus:outline-none focus:border-cta";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!duration.trim() || !description.trim()) return;
    book.mutate(
      {
        duration: duration.trim(),
        customer: customerName,
        description: description.trim(),
        contract: contract || undefined,
        taskId: taskId ?? undefined,
        date: date !== today ? date : undefined,
      },
      { onSuccess: onDone },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className={
        "flex flex-col gap-1 mt-2 p-2 rounded-lg "
        + "bg-surface-overlay border border-border"
      }
    >
      <div className="flex gap-1">
        <input
          autoFocus
          type="text"
          placeholder="Duration (e.g. 1h30m)"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className={`w-32 shrink-0 ${cls}`}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`w-32 shrink-0 ${cls}`}
        />
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) =>
            setDescription(e.target.value)
          }
          className={`flex-1 min-w-0 ${cls}`}
        />
      </div>
      {contracts.length > 0 && (
        <select
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          className={`w-full ${cls}`}
        >
          <option value="">
            {"— no contract —"}
          </option>
          {contracts.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
              {c.end_date ? " (closed)" : ""}
            </option>
          ))}
        </select>
      )}
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
        customer={customerName}
        inputClassName={cls}
        className="w-full"
      />
      <div className="flex gap-1 justify-end">
        <button
          type="button"
          onClick={onDone}
          className={
            "p-1 text-stone-500 "
            + "hover:text-stone-900 rounded"
          }
        >
          <X size={11} />
        </button>
        <button
          type="submit"
          disabled={
            book.isPending
            || !duration.trim()
            || !description.trim()
          }
          className={
            "p-1 text-cta hover:bg-cta-muted "
            + "rounded disabled:opacity-40"
          }
        >
          <Check size={11} />
        </button>
      </div>
    </form>
  );
}
