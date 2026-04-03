import { useState } from "react";
import { useCustomers } from "../../hooks/useCustomers";
import { CustomerCard } from "./CustomerCard";

export function CustomersView() {
  const [showInactive, setShowInactive] = useState(false);
  const { data: customers = [], isLoading } = useCustomers(showInactive);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Customers
        </h1>
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
