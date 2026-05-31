/**
 * ContractRow renders a single contract with inline
 * editing, budget bar, and delete action.
 */
import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { EditFooter } from "../common/EditFooter";
import { HoverActions } from "../common/HoverActions";
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
  const { t } = useTranslation("customers");
  const { t: tc } = useTranslation("common");
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
    // Label cell — small uppercase eyebrow above the
    // input. Without labels the form is impossible to
    // read once the user has typed (the placeholder
    // disappears and '40' on its own gives no context).
    const labelCls =
      "text-2xs text-fg-muted uppercase tracking-wider";
    return (
      <div
        className={
          "flex flex-col gap-2 py-2 border-b "
          + "border-border-subtle last:border-0"
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-0.5 min-w-0">
            <span className={labelCls}>{tc("name")}</span>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={tc("name")}
              className={smallInputCls + " w-full"}
            />
          </label>
          <label className="flex flex-col gap-0.5 min-w-0">
            <span className={labelCls}>
              {t("budgetHLabel")}
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("budgetHLabel")}
              className={
                smallInputCls + " w-full tabular-nums"
              }
            />
          </label>
          <label className="flex flex-col gap-0.5 min-w-0">
            <span
              className={labelCls}
              title={t("usedOffset")}
            >
              {t("offsetH")}
            </span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("offsetH")}
              title={t("usedOffset")}
              className={
                smallInputCls + " w-full tabular-nums"
              }
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5 min-w-0">
            <span className={labelCls}>
              {tc("startDate")}
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) =>
                setStartDate(e.target.value)
              }
              onKeyDown={handleKeyDown}
              className={smallInputCls + " w-full"}
            />
          </label>
          <label className="flex flex-col gap-0.5 min-w-0">
            <span className={labelCls}>
              {t("endDate")}
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("endDate")}
              className={smallInputCls + " w-full"}
            />
          </label>
        </div>
        <label className="flex flex-col gap-0.5">
          <span className={labelCls}>{tc("notes")}</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tc("notes")}
            className={smallInputCls + " w-full"}
          />
        </label>
        <div className="flex items-center gap-4">
          <label
            className={
              "flex items-center gap-1.5 text-xs "
              + "text-fg cursor-pointer"
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
          <label
            className={
              "flex items-center gap-1.5 text-xs "
              + "text-fg cursor-pointer"
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
            {tc("invoiced")}
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
            ? "text-fg-strong"
            : "text-fg-muted",
        ].join(" ")}
      >
        {contract.name}
      </p>
      {/* Row 2: hours + badge + actions */}
      <div className="flex items-center gap-1 mb-1">
        <span
          className={
            "text-2xs text-fg-muted tabular-nums"
          }
        >
          {contract.used.toFixed(1)}h /{" "}
          {contract.budget.toFixed(0)}h
        </span>
        {!isActive && (
          <span
            className={
              "text-2xs px-1 py-0.5 rounded "
              + "bg-surface-overlay text-fg-muted"
            }
          >
            {tc("closed")}
          </span>
        )}
        {contract.billable === false && (
          <span
            className={
              "text-2xs px-1 py-0.5 rounded "
              + "bg-amber-500/10 text-amber-600"
            }
          >
            {tc("nonBillable")}
          </span>
        )}
        {contract.invoiced && (
          <span
            className={
              "text-2xs px-1 py-0.5 rounded "
              + "bg-emerald-500/10 text-emerald-600"
            }
          >
            {tc("invoiced")}
          </span>
        )}
        <HoverActions className="gap-0.5 ml-auto">
          <button
            onClick={startEdit}
            className={
              "p-0.5 rounded text-fg-subtle "
              + "hover:text-cta hover:bg-cta-muted "
              + "transition-colors"
            }
            title={tc("edit")}
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
                "p-0.5 rounded text-fg-subtle "
                + "hover:text-red-400 "
                + "hover:bg-red-500/10 "
                + "transition-colors"
              }
              title={tc("delete")}
            >
              <X size={10} />
            </button>
          </ConfirmPopover>
        </HoverActions>
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
            "text-2xs text-fg-muted "
            + "mt-0.5 truncate"
          }
        >
          {contract.notes}
        </p>
      )}
    </div>
  );
}
