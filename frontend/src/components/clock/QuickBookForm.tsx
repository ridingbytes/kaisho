import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { useContracts } from "../../hooks/useContracts";
import { useQuickBook } from "../../hooks/useClocks";

export function QuickBookForm() {
  const [duration, setDuration] = useState("");
  const [customer, setCustomer] = useState("");
  const [contract, setContract] = useState("");
  const [description, setDescription] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const { data: contracts = [] } = useContracts(customer || null);
  const book = useQuickBook();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!duration.trim() || !customer.trim() || !description.trim())
      return;
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
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Duration (e.g. 2h, 30min)"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className={[inputCls, "w-36 shrink-0"].join(" ")}
        />
        <CustomerAutocomplete
          value={customer}
          onChange={(v) => {
            setCustomer(v);
            setContract("");
          }}
          className="flex-1 min-w-0"
          inputClassName={inputCls}
        />
      </div>
      {contracts.length > 0 && (
        <select
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          className={inputCls}
        >
          <option value="">— no contract —</option>
          {contracts.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}{c.end_date ? " (closed)" : ""}
            </option>
          ))}
        </select>
      )}
      <input
        type="text"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={inputCls}
      />
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
        className="w-full"
      />
      <button
        type="submit"
        disabled={
          book.isPending ||
          !duration.trim() ||
          !customer.trim() ||
          !description.trim()
        }
        className={[
          "w-full py-2 rounded-lg text-xs font-semibold",
          "bg-surface-overlay border border-border",
          "text-slate-300 hover:border-accent hover:text-accent",
          "transition-colors disabled:opacity-40",
          "disabled:cursor-not-allowed",
        ].join(" ")}
      >
        {book.isPending ? "Booking…" : "Quick Book"}
      </button>
      {book.isError && (
        <p className="text-xs text-red-400">
          {(book.error as Error).message}
        </p>
      )}
    </form>
  );
}

const inputCls = [
  "w-full px-3 py-2 rounded-lg text-sm",
  "bg-surface-raised border border-border",
  "text-slate-200 placeholder-slate-600",
  "focus:outline-none focus:border-accent",
  "transition-colors",
].join(" ");
