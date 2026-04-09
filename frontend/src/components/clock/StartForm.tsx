import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { useStartTimer } from "../../hooks/useClocks";
import { useContracts } from "../../hooks/useContracts";

interface Props {
  onStarted?: () => void;
}

export function StartForm({ onStarted }: Props) {
  const [customer, setCustomer] = useState("");
  const [description, setDescription] = useState("");
  const [contract, setContract] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const start = useStartTimer();
  const { data: allContracts = [] } = useContracts(
    customer || null
  );
  const contracts = allContracts.filter(
    (c) => c.bookable !== false,
  );

  function handleCustomerChange(v: string) {
    setCustomer(v);
    setContract("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer.trim() || !description.trim()) return;
    start.mutate(
      {
        customer: customer.trim(),
        description: description.trim(),
        contract: contract || undefined,
        taskId: taskId ?? undefined,
      },
      {
        onSuccess: () => {
          setCustomer("");
          setDescription("");
          setContract("");
          setTaskId(null);
          setTaskTitle("");
          onStarted?.();
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <CustomerAutocomplete
        value={customer}
        onChange={handleCustomerChange}
        inputClassName={inputCls}
      />
      {contracts.length > 0 && (
        <select
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          className={inputCls}
        >
          <option value="">— no contract —</option>
          {contracts.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
              {c.end_date ? " (closed)" : ""}
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
      />
      <button
        type="submit"
        disabled={
          start.isPending ||
          !customer.trim() ||
          !description.trim()
        }
        className={[
          "w-full py-2 rounded-lg text-xs font-semibold",
          "bg-cta text-white",
          "hover:bg-cta-hover transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        ].join(" ")}
      >
        {start.isPending ? "Starting…" : "Start Timer"}
      </button>
    </form>
  );
}

const inputCls = [
  "w-full px-3 py-2 rounded-lg text-sm",
  "bg-surface-raised border border-border",
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
  "transition-colors",
].join(" ");
