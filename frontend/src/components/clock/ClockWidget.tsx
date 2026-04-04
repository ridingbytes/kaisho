import { useState } from "react";
import { useActiveTimer } from "../../hooks/useClocks";
import type { ClockEntry } from "../../types";
import { ActiveTimer } from "./ActiveTimer";
import { ClockList } from "./ClockList";
import { QuickBookForm } from "./QuickBookForm";
import { StartForm } from "./StartForm";

type Tab = "start" | "book";

export function ClockWidget() {
  const { data: timer } = useActiveTimer();
  const [tab, setTab] = useState<Tab>("start");
  const [prefill, setPrefill] = useState<{
    customer: string;
    description: string;
  } | null>(null);

  const isRunning = timer?.active === true;

  function handleReuse(entry: ClockEntry) {
    setPrefill({
      customer: entry.customer,
      description: entry.description,
    });
    setTab("start");
  }

  function handleBook(entry: ClockEntry) {
    handleReuse(entry);
  }

  return (
    <aside className="flex flex-col w-80 shrink-0 border-l border-border-subtle bg-surface-card/40 overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-subtle shrink-0">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Time Tracking
        </h2>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* Active timer */}
        {timer && <ActiveTimer timer={timer} />}

        {/* Action tabs */}
        {!isRunning && (
          <div>
            {/* Tab switcher */}
            <div className="flex rounded-lg bg-surface-raised border border-border p-0.5 mb-3">
              {(["start", "book"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={[
                    "flex-1 py-1.5 rounded-md text-xs font-semibold capitalize",
                    "transition-colors",
                    tab === t
                      ? "bg-surface-overlay text-slate-200"
                      : "text-slate-600 hover:text-slate-400",
                  ].join(" ")}
                >
                  {t === "start" ? "Start" : "Quick Book"}
                </button>
              ))}
            </div>

            {tab === "start" ? (
              <StartForm
                onStarted={() => setPrefill(null)}
                initialCustomer={prefill?.customer}
                initialDescription={prefill?.description}
              />
            ) : (
              <QuickBookForm />
            )}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-border-subtle" />

        {/* Today's entries */}
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
            Today
          </h3>
          <ClockList onReuse={handleReuse} onBook={handleBook} />
        </div>
      </div>
    </aside>
  );
}
