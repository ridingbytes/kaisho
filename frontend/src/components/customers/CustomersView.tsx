import { useState } from "react";
import { useCreateCustomer, useCustomers } from "../../hooks/useCustomers";
import { CustomerCard } from "./CustomerCard";

const inputCls =
  "bg-surface-raised border border-border rounded px-2 py-1 text-sm " +
  "text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent";

function AddCustomerForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [kontingent, setKontingent] = useState("");
  const [repo, setRepo] = useState("");
  const create = useCreateCustomer();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        kontingent: kontingent ? parseFloat(kontingent) : 0,
        repo: repo.trim() || null,
      },
      { onSuccess: onClose }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 px-6 py-3 border-b border-border-subtle bg-surface-card/60"
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
          Name *
        </label>
        <input
          className={inputCls}
          placeholder="Customer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
          Budget (h)
        </label>
        <input
          className={`${inputCls} w-24`}
          placeholder="0"
          type="number"
          min="0"
          step="0.5"
          value={kontingent}
          onChange={(e) => setKontingent(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
          GitHub repo
        </label>
        <input
          className={`${inputCls} w-40`}
          placeholder="owner/repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
        />
      </div>
      <div className="flex gap-2 pb-0.5">
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="px-3 py-1.5 rounded bg-accent text-white text-xs font-semibold disabled:opacity-40"
        >
          {create.isPending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded bg-surface-raised text-slate-400 text-xs"
        >
          Cancel
        </button>
      </div>
      {create.isError && (
        <p className="w-full text-xs text-red-400">
          {(create.error as Error).message}
        </p>
      )}
    </form>
  );
}

export function CustomersView() {
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const { data: customers = [], isLoading } = useCustomers(showInactive);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Customers
        </h1>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-2 px-2.5 py-1 rounded bg-accent-muted text-accent text-xs font-semibold hover:bg-accent hover:text-white transition-colors"
        >
          + New
        </button>
        <label className="flex items-center gap-2 ml-auto cursor-pointer">
          <span className="text-xs text-slate-500">Show inactive</span>
          <button
            role="switch"
            aria-checked={showInactive}
            onClick={() => setShowInactive((v) => !v)}
            className={[
              "relative w-8 h-4 rounded-full transition-colors",
              showInactive ? "bg-accent" : "bg-surface-raised",
              "border border-border",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-0.5 w-3 h-3 rounded-full bg-white",
                "transition-transform",
                showInactive ? "translate-x-4" : "translate-x-0.5",
              ].join(" ")}
            />
          </button>
        </label>
      </div>

      {/* Add form */}
      {adding && <AddCustomerForm onClose={() => setAdding(false)} />}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <p className="text-sm text-slate-600 text-center py-8">
            Loading…
          </p>
        )}
        {!isLoading && customers.length === 0 && (
          <p className="text-sm text-slate-600 text-center py-8">
            No customers found.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => (
            <CustomerCard key={c.name} customer={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
