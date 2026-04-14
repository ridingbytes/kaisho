/**
 * ContractRow renders a single contract with inline
 * editing, budget bar, and delete action.
 */
import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { EditFooter } from "../common/EditFooter";
import {
  useUpdateContract,
  useDeleteContract,
} from "../../hooks/useContracts";
import { contractBarColor } from "./BudgetBar";
import { smallInputCls } from "../../styles/formStyles";
import type { Contract } from "../../types";

export interface ContractRowProps {
  /** The contract to display. */
  contract: Contract;
  /** Parent customer name (used for mutations). */
  customerName: string;
}

/** Single contract row with inline edit mode. */
export function ContractRow({
  contract,
  customerName,
}: ContractRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contract.name);
  const [hours, setHours] = useState(
    String(contract.budget),
  );
  const [offset, setOffset] = useState(
    String(contract.used_offset ?? 0),
  );
  const [startDate, setStartDate] = useState(
    contract.start_date,
  );
  const [endDate, setEndDate] = useState(
    contract.end_date ?? "",
  );
  const [notes, setNotes] = useState(contract.notes);
  const [billable, setBillable] = useState(
    contract.billable ?? true,
  );
  const [invoiced, setInvoiced] = useState(
    contract.invoiced ?? false,
  );
  const updateContract = useUpdateContract();
  const deleteContract = useDeleteContract();

  const isActive = !contract.end_date;
  const isInv = contract.invoiced ?? false;
  const pct = isInv
    ? 100
    : contract.budget > 0
      ? Math.min(
          Math.round(
            (contract.used / contract.budget) * 100,
          ),
          100,
        )
      : 0;
  const barColor = isInv
    ? "#16a34a"
    : contractBarColor(pct);

  function startEdit() {
    setName(contract.name);
    setHours(String(contract.budget));
    setOffset(String(contract.used_offset ?? 0));
    setStartDate(contract.start_date);
    setEndDate(contract.end_date ?? "");
    setNotes(contract.notes);
    setBillable(contract.billable ?? true);
    setInvoiced(contract.invoiced ?? false);
    setEditing(true);
  }

  function handleSave() {
    const h = parseFloat(hours);
    if (!name.trim() || isNaN(h)) return;
    const o = parseFloat(offset) || 0;
    updateContract.mutate(
      {
        customerName,
        contractName: contract.name,
        updates: {
          name: name.trim(),
          budget: h,
          used_offset: o,
          start_date: startDate,
          end_date: endDate || null,
          notes,
          billable,
          invoiced,
        },
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (
      e.key === "Enter" ||
      ((e.metaKey || e.ctrlKey) && e.key === "Enter")
    ) {
      handleSave();
    }
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <div
        className={
          "flex flex-col gap-1 py-2 border-b "
          + "border-border-subtle last:border-0"
        }
      >
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: "1fr 1fr 1fr",
          }}
        >
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Name"
            className={smallInputCls}
          />
          <input
            type="number"
            min="0"
            step="1"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Budget h"
            className={`${smallInputCls} tabular-nums`}
          />
          <input
            type="number"
            min="0"
            step="0.5"
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Offset h"
            title="Used offset (hours)"
            className={`${smallInputCls} tabular-nums`}
          />
        </div>
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: "1fr 1fr" }}
        >
          <input
            type="date"
            value={startDate}
            onChange={(e) =>
              setStartDate(e.target.value)
            }
            onKeyDown={handleKeyDown}
            className={smallInputCls}
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="End date"
            className={smallInputCls}
          />
        </div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Notes"
          className={smallInputCls}
        />
        <div className="flex items-center gap-4">
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
            Billable
          </label>
          <label
            className={
              "flex items-center gap-1.5 text-xs "
              + "text-stone-700 cursor-pointer"
            }
          >
            <input
              type="checkbox"
              checked={invoiced}
              onChange={(e) =>
                setInvoiced(e.target.checked)
              }
              className={
                "rounded border-border text-cta "
                + "focus:ring-cta"
              }
            />
            Invoiced
          </label>
        </div>
        <EditFooter
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          isPending={updateContract.isPending}
          showHint={false}
        />
      </div>
    );
  }

  return (
    <div className="group py-1">
      {/* Row 1: name */}
      <p
        className={[
          "text-xs font-medium truncate mb-1",
          isActive
            ? "text-stone-800"
            : "text-stone-600",
        ].join(" ")}
      >
        {contract.name}
      </p>
      {/* Row 2: hours + badge + actions */}
      <div className="flex items-center gap-1 mb-1">
        <span
          className={
            "text-[10px] text-stone-600 tabular-nums"
          }
        >
          {contract.used.toFixed(1)}h /{" "}
          {contract.budget.toFixed(0)}h
        </span>
        {!isActive && (
          <span
            className={
              "text-[9px] px-1 py-0.5 rounded "
              + "bg-surface-overlay text-stone-500"
            }
          >
            closed
          </span>
        )}
        {contract.billable === false && (
          <span
            className={
              "text-[9px] px-1 py-0.5 rounded "
              + "bg-amber-500/10 text-amber-600"
            }
          >
            non-billable
          </span>
        )}
        {contract.invoiced && (
          <span
            className={
              "text-[9px] px-1 py-0.5 rounded "
              + "bg-emerald-500/10 text-emerald-600"
            }
          >
            invoiced
          </span>
        )}
        <div
          className={
            "hidden group-hover:flex gap-0.5 ml-auto"
          }
        >
          <button
            onClick={startEdit}
            className={
              "p-0.5 rounded text-stone-400 "
              + "hover:text-cta hover:bg-cta-muted "
              + "transition-colors"
            }
            title="Edit"
          >
            <Pencil size={10} />
          </button>
          <ConfirmPopover
            onConfirm={() =>
              deleteContract.mutate({
                customerName,
                contractName: contract.name,
              })
            }
            disabled={deleteContract.isPending}
          >
            <button
              disabled={deleteContract.isPending}
              className={
                "p-0.5 rounded text-stone-400 "
                + "hover:text-red-400 "
                + "hover:bg-red-500/10 "
                + "transition-colors"
              }
              title="Delete"
            >
              <X size={10} />
            </button>
          </ConfirmPopover>
        </div>
      </div>
      {contract.budget > 0 && (
        <div
          className={
            "h-1 rounded-full bg-surface-overlay "
            + "overflow-hidden"
          }
        >
          <div
            className={
              "h-full rounded-full transition-all"
            }
            style={{
              width: `${pct}%`,
              backgroundColor: barColor,
            }}
          />
        </div>
      )}
      {contract.notes && (
        <p
          className={
            "text-[10px] text-stone-500 "
            + "mt-0.5 truncate"
          }
        >
          {contract.notes}
        </p>
      )}
    </div>
  );
}
