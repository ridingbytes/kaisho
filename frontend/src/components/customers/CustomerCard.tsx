/**
 * CustomerCard is the main entry point that composes all
 * sub-components for a single customer view (header,
 * contracts, time entries, tasks, quick-book, invoicing).
 */
import { useState } from "react";
import {
  Clock,
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { BudgetBar } from "./BudgetBar";
import { ContractsSection } from "./ContractsSection";
import { TasksSection } from "./TasksSection";
import { TimeEntriesSection } from "./TimeEntriesSection";
import { AddContractForm } from "./AddContractForm";
import { QuickBookForm } from "./QuickBookForm";
import { InvoicePanel } from "./InvoicePanel";
import {
  CustomerEditForm,
  toEditState,
} from "./CustomerEditForm";
import type { EditState } from "./CustomerEditForm";
import { useDeleteCustomer } from "../../hooks/useCustomers";
import { actionBtnCls } from "../../styles/formStyles";
import type { Customer } from "../../types";

interface Props {
  customer: Customer;
}

/** Top-level customer card composing all sections. */
export function CustomerCard({ customer: c }: Props) {
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [addingContract, setAddingContract] =
    useState(false);
  const [form, setForm] = useState<EditState>(
    toEditState(c),
  );
  const remove = useDeleteCustomer();

  const contracts = c.contracts ?? [];
  const activeContract =
    contracts.find((ct) => !ct.end_date)?.name ?? "";

  const hasContracts = contracts.length > 0;
  const hasContingent = !hasContracts && c.budget > 0;
  const isArchived = [
    "inactive",
    "archiv",
    "archived",
  ].includes(c.status.toLowerCase());

  function startEdit() {
    setForm(toEditState(c));
    setEditing(true);
  }

  return (
    <div
      className={[
        "flex flex-col gap-3 p-5 rounded-xl",
        "border transition-colors",
        "bg-surface-card hover:bg-surface-raised",
        isArchived
          ? "border-border-subtle opacity-60"
          : "border-border",
      ].join(" ")}
    >
      {editing ? (
        <CustomerEditForm
          customer={c}
          form={form}
          setForm={setForm}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          {/* Header */}
          <div
            className={
              "flex items-start justify-between "
              + "gap-2"
            }
          >
            <div
              className={
                "min-w-0 min-h-[36px] flex "
                + "flex-col justify-start"
              }
            >
              <h3
                className={
                  "text-sm font-semibold "
                  + "text-stone-900 truncate flex "
                  + "items-center gap-1.5"
                }
              >
                <span
                  className={
                    "w-2.5 h-2.5 rounded-full "
                    + "shrink-0"
                  }
                  style={{
                    background:
                      c.color || "#a1a1aa",
                  }}
                />
                {c.name}
              </h3>
              {c.repo && (
                <a
                  href={c.repo}
                  target="_blank"
                  rel="noreferrer"
                  className={
                    "inline-flex items-center "
                    + "gap-1 text-[10px] "
                    + "text-stone-500 "
                    + "hover:text-cta mt-0.5 "
                    + "transition-colors"
                  }
                >
                  <ExternalLink size={10} />
                  {c.repo
                    .replace(/^https?:\/\//, "")
                    .slice(0, 30)}
                </a>
              )}
            </div>
            <div
              className={
                "flex items-center gap-1 shrink-0 "
                + "flex-wrap justify-end"
              }
            >
              {c.type && (
                <span
                  className={
                    "px-1.5 py-0.5 rounded "
                    + "text-[9px] font-bold "
                    + "uppercase tracking-wider "
                    + "bg-surface-overlay "
                    + "text-stone-700"
                  }
                >
                  {c.type}
                </span>
              )}
              <span
                className={[
                  "px-1.5 py-0.5 rounded",
                  "text-[9px] font-bold uppercase",
                  "tracking-wider",
                  isArchived
                    ? "bg-stone-500/10 text-stone-500"
                    : "bg-emerald-500/15"
                      + " text-emerald-400",
                ].join(" ")}
              >
                {c.status}
              </span>
              <button
                onClick={startEdit}
                className={
                  "p-1 rounded-md text-stone-400 "
                  + "hover:text-cta "
                  + "hover:bg-cta-muted "
                  + "transition-colors"
                }
                title="Edit"
              >
                <Pencil size={11} />
              </button>
              <ConfirmPopover
                label={`Delete ${c.name}?`}
                onConfirm={() =>
                  remove.mutate(c.name)
                }
                disabled={remove.isPending}
              >
                <button
                  disabled={remove.isPending}
                  className={
                    "p-1 rounded-md text-stone-400 "
                    + "hover:text-red-400 "
                    + "hover:bg-red-500/10 "
                    + "transition-colors "
                    + "disabled:opacity-40"
                  }
                  title="Delete customer"
                >
                  <Trash2 size={11} />
                </button>
              </ConfirmPopover>
            </div>
          </div>

          {/* Budget (legacy single bar) */}
          {hasContingent && (
            <BudgetBar
              used={c.used}
              budget={c.budget}
              rest={c.rest}
            />
          )}

          {/* Contracts */}
          {hasContracts && (
            <ContractsSection customer={c} />
          )}

          {/* Collapsible sections */}
          <div
            className={
              "border-t border-border-subtle pt-2 "
              + "mt-1 flex flex-col gap-1"
            }
          >
            <TasksSection customerName={c.name} />
            <TimeEntriesSection
              customerName={c.name}
              contracts={c.contracts}
            />
          </div>

          {/* Actions */}
          <div
            className={
              "border-t border-border-subtle pt-2 "
              + "mt-1 flex flex-col gap-2"
            }
          >
            {addingContract && (
              <AddContractForm
                customerName={c.name}
                onDone={() =>
                  setAddingContract(false)
                }
              />
            )}
            {booking && (
              <QuickBookForm
                customerName={c.name}
                contracts={c.contracts}
                defaultContract={activeContract}
                onDone={() => setBooking(false)}
              />
            )}
            {invoicing && (
              <InvoicePanel
                customer={c.name}
                onClose={() => setInvoicing(false)}
              />
            )}
            {!addingContract
              && !booking
              && !invoicing && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() =>
                    setAddingContract(true)
                  }
                  className={actionBtnCls}
                >
                  <Plus size={10} />
                  Add contract
                </button>
                <button
                  onClick={() => setBooking(true)}
                  className={actionBtnCls}
                >
                  <Clock size={10} />
                  Book time
                </button>
                <button
                  onClick={() => setInvoicing(true)}
                  className={actionBtnCls}
                >
                  <Download size={10} />
                  Invoice
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
