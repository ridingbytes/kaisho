/**
 * TimeEntryRow renders a single clock entry with inline
 * editing, contract badge, and delete action.
 */
import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { ContentPopup } from "../common/ContentPopup";
import { navigateToClockDate } from "../../utils/clockNavigation";
import {
  useDeleteClockEntry,
  useUpdateClockEntry,
} from "../../hooks/useClocks";
import {
  useInvoicedContracts,
  isInvoiced,
} from "../../hooks/useInvoicedContracts";
import { formatHours } from "../../utils/formatting";
import { smallInputCls } from "../../styles/formStyles";
import type { ClockEntry, Contract } from "../../types";

export interface TimeEntryRowProps {
  /** The clock entry to display. */
  entry: ClockEntry;
  /** Available contracts for the contract selector. */
  contracts: Contract[];
}

function fieldClass(base = "") {
  return `${smallInputCls} ${base}`;
}

function formatEntryDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** Single time entry row with inline edit support. */
export function TimeEntryRow({
  entry,
  contracts,
}: TimeEntryRowProps) {
  const { t: tc } = useTranslation("common");
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [hrs, setHrs] = useState(
    entry.duration_minutes != null
      ? String(entry.duration_minutes / 60)
      : "",
  );
  const [contract, setContract] = useState(
    entry.contract ?? "",
  );
  const invoicedSet = useInvoicedContracts();
  const isInv = isInvoiced(
    invoicedSet,
    entry.customer,
    entry.contract,
  );
  const updateEntry = useUpdateClockEntry();
  const deleteEntry = useDeleteClockEntry();

  function handleSave() {
    const h = parseFloat(hrs);
    if (!desc.trim() || isNaN(h)) return;
    updateEntry.mutate(
      {
        entry,
        updates: {
          description: desc.trim(),
          hours: h,
          contract,
        },
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <div
        className={
          "flex flex-col gap-1 py-1.5 border-b "
          + "border-border-subtle last:border-0"
        }
      >
        <textarea
          autoFocus
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter"
              && (e.metaKey || e.ctrlKey)
            ) {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={tc("description")}
          rows={2}
          className={fieldClass("resize-none")}
        />
        <div className="flex gap-1">
          <input
            type="number"
            min="0"
            step="0.25"
            value={hrs}
            onChange={(e) => setHrs(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tc("hours")}
            className={fieldClass(
              "w-16 shrink-0 tabular-nums",
            )}
          />
        </div>
        {contracts.length > 0 && (
          <select
            value={contract}
            onChange={(e) =>
              setContract(e.target.value)
            }
            className={fieldClass()}
          >
            <option value="">{tc("noContract")}</option>
            {contracts.map((ct) => (
              <option key={ct.name} value={ct.name}>
                {ct.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => setEditing(false)}
            className={
              "p-0.5 text-stone-500 "
              + "hover:text-stone-900 rounded"
            }
          >
            <X size={10} />
          </button>
          <button
            onClick={handleSave}
            disabled={updateEntry.isPending}
            className={
              "p-0.5 text-cta hover:bg-cta-muted "
              + "rounded disabled:opacity-40"
            }
          >
            <Check size={10} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        "group flex items-center gap-1.5 py-1 "
        + "border-b border-border-subtle "
        + "last:border-0"
      }
    >
      <span
        className={
          "text-[10px] text-stone-500 tabular-nums "
          + "shrink-0 cursor-pointer hover:text-cta"
        }
        onClick={() =>
          navigateToClockDate(entry.start.slice(0, 10))
        }
      >
        {formatEntryDate(entry.start)}
      </span>
      <span
        className={
          "text-xs text-stone-800 truncate min-w-0 "
          + "flex-1 inline-flex items-center gap-1"
        }
      >
        {entry.description}
        {entry.notes && (
          <ContentPopup
            content={entry.notes}
            title="Notes"
            icon="notes"
          />
        )}
      </span>
      {entry.contract && (
        <span
          className={[
            "text-[9px] px-1 py-0.5 rounded shrink-0",
            "max-w-[6rem] truncate",
            isInv
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-surface-overlay text-stone-600",
          ].join(" ")}
        >
          {entry.contract}
          {isInv && " \u2713"}
        </span>
      )}
      <span
        className={
          "text-[10px] text-stone-600 "
          + "tabular-nums shrink-0"
        }
      >
        {formatHours(entry.duration_minutes)}
      </span>
      <div
        className={
          "hidden group-hover:flex gap-0.5 shrink-0"
        }
      >
        <button
          onClick={() => {
            setDesc(entry.description);
            setHrs(
              entry.duration_minutes != null
                ? String(entry.duration_minutes / 60)
                : "",
            );
            setContract(entry.contract ?? "");
            setEditing(true);
          }}
          className={
            "p-0.5 rounded text-stone-400 "
            + "hover:text-cta hover:bg-cta-muted "
            + "transition-colors"
          }
          title={tc("edit")}
        >
          <Pencil size={10} />
        </button>
        <ConfirmPopover
          onConfirm={() => deleteEntry.mutate(entry)}
          disabled={deleteEntry.isPending}
        >
          <button
            disabled={deleteEntry.isPending}
            className={
              "p-0.5 rounded text-stone-400 "
              + "hover:text-red-400 "
              + "hover:bg-red-500/10 "
              + "transition-colors"
            }
            title={tc("delete")}
          >
            <Trash2 size={10} />
          </button>
        </ConfirmPopover>
      </div>
    </div>
  );
}
