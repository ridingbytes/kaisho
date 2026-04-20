/**
 * AddContractForm provides an inline form for creating
 * a new contract on a customer card.
 */
import { useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAddContract } from "../../hooks/useContracts";
import { smallInputCls } from "../../styles/formStyles";

export interface AddContractFormProps {
  /** Customer to attach the new contract to. */
  customerName: string;
  /** Called after successful creation or cancel. */
  onDone: () => void;
}

function fieldClass(base = "") {
  return `${smallInputCls} ${base}`;
}

/** Inline form for adding a contract to a customer. */
export function AddContractForm({
  customerName,
  onDone,
}: AddContractFormProps) {
  const { t } = useTranslation("customers");
  const { t: tc } = useTranslation("common");
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [hours, setHours] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [billable, setBillable] = useState(true);
  const addContract = useAddContract();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const h = parseFloat(hours);
    if (!name.trim() || isNaN(h)) return;
    addContract.mutate(
      {
        customerName,
        data: {
          name: name.trim(),
          budget: h,
          start_date: startDate,
          billable,
          invoiced: false,
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        "flex flex-col gap-1 mt-2 p-2 rounded-lg "
        + "bg-surface-overlay border border-border"
      }
    >
      <div className="flex gap-1">
        <input
          autoFocus
          type="text"
          placeholder={t("contractName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={
            "flex-1 min-w-0 px-2 py-1 rounded-md "
            + "text-xs bg-surface-overlay border "
            + "border-border text-stone-900 "
            + "placeholder-stone-500 "
            + "focus:outline-none focus:border-cta"
          }
        />
        <input
          type="number"
          min="0"
          step="1"
          placeholder={tc("hours")}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className={
            "w-20 shrink-0 px-2 py-1 rounded-md "
            + "text-xs tabular-nums "
            + "bg-surface-overlay border border-border "
            + "text-stone-900 placeholder-stone-500 "
            + "focus:outline-none focus:border-cta"
          }
        />
      </div>
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className={fieldClass()}
      />
      <label
        className={
          "flex items-center gap-1.5 text-xs "
          + "text-stone-700 cursor-pointer"
        }
      >
        <input
          type="checkbox"
          checked={billable}
          onChange={(e) =>
            setBillable(e.target.checked)
          }
          className={
            "rounded border-border text-cta "
            + "focus:ring-cta"
          }
        />
        {tc("billable")}
      </label>
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
            addContract.isPending
            || !name.trim()
            || !hours.trim()
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
