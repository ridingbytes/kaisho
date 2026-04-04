import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { useStartTimer } from "../../hooks/useClocks";

interface Props {
  onStarted?: () => void;
}

export function StartForm({ onStarted }: Props) {
  const [customer, setCustomer] = useState("");
  const [description, setDescription] = useState("");
  const start = useStartTimer();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer.trim() || !description.trim()) return;
    start.mutate(
      { customer: customer.trim(), description: description.trim() },
      {
        onSuccess: () => {
          setCustomer("");
          setDescription("");
          onStarted?.();
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <CustomerAutocomplete
        value={customer}
        onChange={setCustomer}
        inputClassName={inputCls}
      />
      <input
        type="text"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={inputCls}
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
          "bg-accent text-white",
          "hover:bg-accent-hover transition-colors",
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
  "text-slate-200 placeholder-slate-600",
  "focus:outline-none focus:border-accent",
  "transition-colors",
].join(" ");
