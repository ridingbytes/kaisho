import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Square } from "lucide-react";
import type { ActiveTimer, Customer } from "../types";

interface Props {
  timer: ActiveTimer | null;
  isRunning: boolean;
  elapsed: string;
  customers: Customer[];
  onStart: (
    customer: string,
    description: string,
    contract?: string,
  ) => void;
  onStop: () => void;
}

export function TimerSection({
  timer,
  isRunning,
  elapsed,
  customers,
  onStart,
  onStop,
}: Props) {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const [customer, setCustomer] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const c = customer.trim();
    if (!c) return;
    onStart(c, description.trim());
    setCustomer("");
    setDescription("");
  }

  if (isRunning && timer?.start) {
    return (
      <div className="px-4 py-4">
        {/* Elapsed time */}
        <div className="text-center">
          <div className="text-3xl font-light font-mono text-stone-900 tabular-nums tracking-wide">
            {elapsed}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-green-600">
              {tc("active")}
            </span>
          </div>
        </div>

        {/* Customer + description */}
        <p className="text-xs text-stone-600 text-center mt-2 truncate">
          {timer.customer}
          {timer.description && (
            <>
              <span className="mx-1 text-stone-400">
                &middot;
              </span>
              {timer.description}
            </>
          )}
        </p>

        {/* Stop button */}
        <button
          onClick={onStop}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
        >
          <Square size={12} fill="currentColor" />
          {t("stopTimer")}
        </button>
      </div>
    );
  }

  // Start form
  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-4"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
        {t("quickStart")}
      </p>
      <div className="flex flex-col gap-2">
        {/* Customer: simple input with datalist */}
        <input
          list="tray-customers"
          value={customer}
          onChange={(e) =>
            setCustomer(e.target.value)
          }
          placeholder={tc("customer")}
          className={inputCls}
          autoFocus
        />
        <datalist id="tray-customers">
          {customers.map((c) => (
            <option key={c.name} value={c.name} />
          ))}
        </datalist>

        <input
          type="text"
          value={description}
          onChange={(e) =>
            setDescription(e.target.value)
          }
          placeholder={tc("descriptionOptional")}
          className={inputCls}
        />

        <button
          type="submit"
          disabled={!customer.trim()}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-cta text-white hover:bg-cta-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play size={12} fill="currentColor" />
          {t("startTimer")}
        </button>
      </div>
    </form>
  );
}

const inputCls = [
  "w-full px-3 py-1.5 rounded-lg text-xs",
  "bg-surface-raised border border-border",
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
  "transition-colors",
].join(" ");
