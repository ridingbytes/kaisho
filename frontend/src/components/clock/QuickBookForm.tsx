import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { useQuickBook } from "../../hooks/useClocks";

export function QuickBookForm() {
  const [duration, setDuration] = useState("");
  const [customer, setCustomer] = useState("");
  const [description, setDescription] = useState("");
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
      },
      {
        onSuccess: () => {
          setDuration("");
          setCustomer("");
          setDescription("");
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
          onChange={setCustomer}
          className="flex-1 min-w-0"
          inputClassName={inputCls}
        />
      </div>
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
