import {
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { useState } from "react";
import { navigateToClockDate } from "../../utils/clockNavigation";
import {
  useDeleteCustomer,
  useUpdateCustomer,
} from "../../hooks/useCustomers";
import {
  useContracts,
  useAddContract,
  useUpdateContract,
  useDeleteContract,
} from "../../hooks/useContracts";
import {
  useQuickBook,
  useCustomerClockEntries,
  useDeleteClockEntry,
  useUpdateClockEntry,
} from "../../hooks/useClocks";
import { TaskAutocomplete } from "../common/TaskAutocomplete";
import { useSettings } from "../../hooks/useSettings";
import {
  useInvoicedContracts,
  isInvoiced,
} from "../../hooks/useInvoicedContracts";
import { useTasks } from "../../hooks/useTasks";
import { useSetView } from "../../context/ViewContext";
import type {
  ClockEntry,
  Contract,
  Customer,
} from "../../types";


const STATUS_OPTIONS = ["active", "inactive", "archiv"];
const PAGE_SIZE = 5;

const CUSTOMER_PREFIX_RE = /^\[[^\]]+\]:?\s*/;

interface Props {
  customer: Customer;
}

interface EditState {
  name: string;
  status: string;
  type: string;
  color: string;
  budget: string;
  used_offset: string;
  repo: string;
}

function toEditState(c: Customer): EditState {
  const rawProp = c.properties?.USED ?? "";
  const m = rawProp.match(/(\d+(?:\.\d+)?)/);
  return {
    name: c.name,
    status: c.status,
    type: c.type ?? "",
    color: c.color ?? "",
    budget: String(c.budget),
    used_offset: m ? m[1] : "0",
    repo: c.repo ?? "",
  };
}

function fieldClass(base = "") {
  return [
    "w-full px-2 py-1 rounded-md text-xs",
    "bg-surface-overlay border border-border",
    "text-stone-900 placeholder-stone-500",
    "focus:outline-none focus:border-cta",
    base,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Contracts section
// ---------------------------------------------------------------------------

function contractBarColor(pct: number): string {
  if (pct >= 100) return "#dc2626";
  if (pct >= 80) return "#d97706";
  return "#16a34a";
}

function BudgetBar({
  label,
  used,
  budget,
  rest,
  closed,
}: {
  label?: string;
  used: number;
  budget: number;
  rest: number;
  closed?: boolean;
}) {
  const pct =
    budget > 0
      ? Math.min(Math.round((used / budget) * 100), 100)
      : 0;
  const color = contractBarColor(pct);
  return (
    <div>
      <div className="h-4 flex items-end pb-1">
        {label !== undefined && (
          <span
            className={[
              "text-[10px] leading-none",
              closed ? "text-stone-400" : "text-stone-600",
            ].join(" ")}
          >
            {label}
            {closed && (
              <span className="ml-1 text-stone-400">(closed)</span>
            )}
          </span>
        )}
      </div>
      <div
        className="h-1.5 rounded-full bg-surface-overlay overflow-hidden"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[10px] text-stone-600">
          {used.toFixed(1)}h used · {rest.toFixed(1)}h left
        </span>
        <span
          className="text-[10px] font-semibold tabular-nums"
          style={{ color }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}

interface ContractRowProps {
  contract: Contract;
  customerName: string;
}

function ContractRow({ contract, customerName }: ContractRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contract.name);
  const [hours, setHours] = useState(String(contract.budget));
  const [offset, setOffset] = useState(
    String(contract.used_offset ?? 0)
  );
  const [startDate, setStartDate] = useState(contract.start_date);
  const [endDate, setEndDate] = useState(contract.end_date ?? "");
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
  const isInvoiced = contract.invoiced ?? false;
  const pct = isInvoiced
    ? 100
    : contract.budget > 0
      ? Math.min(
          Math.round(
            (contract.used / contract.budget) * 100,
          ),
          100,
        )
      : 0;
  const barColor = isInvoiced
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
      { onSuccess: () => setEditing(false) }
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
      <div className="flex flex-col gap-1 py-2 border-b border-border-subtle last:border-0">
        <div className="flex gap-1">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Contract name"
            className="flex-1 min-w-0 px-2 py-1 rounded-md text-xs bg-surface-overlay border border-border text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta"
          />
          <input
            type="number"
            min="0"
            step="1"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Hours"
            className="w-20 shrink-0 px-2 py-1 rounded-md text-xs tabular-nums bg-surface-overlay border border-border text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta"
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
            className="w-20 shrink-0 px-2 py-1 rounded-md text-xs tabular-nums bg-surface-overlay border border-border text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta"
          />
        </div>
        <div className="flex gap-1">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onKeyDown={handleKeyDown}
            className={fieldClass("flex-1")}
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="End date"
            className={fieldClass("flex-1")}
          />
        </div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Notes"
          className={fieldClass()}
        />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              className="rounded border-border text-cta focus:ring-cta"
            />
            Billable
          </label>
          <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={invoiced}
              onChange={(e) => setInvoiced(e.target.checked)}
              className="rounded border-border text-cta focus:ring-cta"
            />
            Invoiced
          </label>
        </div>
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => setEditing(false)}
            className="p-1 text-stone-500 hover:text-stone-900 rounded"
          >
            <X size={11} />
          </button>
          <button
            onClick={handleSave}
            disabled={updateContract.isPending}
            className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
          >
            <Check size={11} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group py-2 border-b border-border-subtle last:border-0">
      {/* Row 1: name */}
      <p
        className={[
          "text-xs font-medium truncate mb-1",
          isActive ? "text-stone-800" : "text-stone-600",
        ].join(" ")}
      >
        {contract.name}
      </p>
      {/* Row 2: hours + badge + actions */}
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[10px] text-stone-600 tabular-nums">
          {contract.used.toFixed(1)}h /{" "}
          {contract.budget.toFixed(0)}h
        </span>
        {!isActive && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-surface-overlay text-stone-500">
            closed
          </span>
        )}
        {contract.billable === false && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-600">
            non-billable
          </span>
        )}
        {contract.invoiced && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
            invoiced
          </span>
        )}
        <div className="hidden group-hover:flex gap-0.5 ml-auto">
          <button
            onClick={startEdit}
            className="p-0.5 rounded text-stone-400 hover:text-cta hover:bg-cta-muted transition-colors"
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
              className="p-0.5 rounded text-stone-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete"
            >
              <X size={10} />
            </button>
          </ConfirmPopover>
        </div>
      </div>
      {contract.budget > 0 && (
        <div className="h-1 rounded-full bg-surface-overlay overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>
      )}
      {contract.notes && (
        <p className="text-[10px] text-stone-500 mt-0.5 truncate">
          {contract.notes}
        </p>
      )}
    </div>
  );
}

function AddContractForm({
  customerName,
  onDone,
}: {
  customerName: string;
  onDone: () => void;
}) {
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
      { onSuccess: onDone }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-1 mt-2 p-2 rounded-lg bg-surface-overlay border border-border"
    >
      <div className="flex gap-1">
        <input
          autoFocus
          type="text"
          placeholder="Contract name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 rounded-md text-xs bg-surface-overlay border border-border text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta"
        />
        <input
          type="number"
          min="0"
          step="1"
          placeholder="Hours"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-20 shrink-0 px-2 py-1 rounded-md text-xs tabular-nums bg-surface-overlay border border-border text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta"
        />
      </div>
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className={fieldClass()}
      />
      <label className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
        <input
          type="checkbox"
          checked={billable}
          onChange={(e) => setBillable(e.target.checked)}
          className="rounded border-border text-cta focus:ring-cta"
        />
        Billable
      </label>
      <div className="flex gap-1 justify-end">
        <button
          type="button"
          onClick={onDone}
          className="p-1 text-stone-500 hover:text-stone-900 rounded"
        >
          <X size={11} />
        </button>
        <button
          type="submit"
          disabled={
            addContract.isPending || !name.trim() || !hours.trim()
          }
          className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
        >
          <Check size={11} />
        </button>
      </div>
    </form>
  );
}

interface ContractsSectionProps {
  customer: Customer;
}

function ContractsSection({ customer }: ContractsSectionProps) {
  const [adding, setAdding] = useState(false);
  const [showInvoiced, setShowInvoiced] = useState(false);
  const hasContracts = customer.contracts.length > 0;
  const { data: contracts = [] } = useContracts(
    hasContracts ? customer.name : null
  );

  if (!hasContracts) return null;

  const active = contracts.filter((c) => !c.invoiced);
  const invoiced = contracts.filter((c) => c.invoiced);

  return (
    <div className="flex flex-col gap-1.5">
      {active.map((c) => (
        <ContractRow
          key={c.name}
          contract={c}
          customerName={customer.name}
        />
      ))}
      {invoiced.length > 0 && (
        <>
          <button
            onClick={() => setShowInvoiced((v) => !v)}
            className={[
              "flex items-center gap-1 text-[10px]",
              "text-stone-400 hover:text-stone-600",
              "transition-colors self-start",
            ].join(" ")}
          >
            {showInvoiced ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )}
            Invoiced ({invoiced.length})
          </button>
          {showInvoiced &&
            invoiced.map((c) => (
              <ContractRow
                key={c.name}
                contract={c}
                customerName={customer.name}
              />
            ))}
        </>
      )}
      {adding ? (
        <AddContractForm
          customerName={customer.name}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors self-start"
        >
          <Plus size={10} />
          Add contract
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add contract button in CustomerCard header (when no contracts yet)
// ---------------------------------------------------------------------------

function AddFirstContractInline({
  customerName,
}: {
  customerName: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
      >
        <Plus size={10} />
        Add contract
      </button>
    );
  }
  return (
    <AddContractForm
      customerName={customerName}
      onDone={() => setOpen(false)}
    />
  );
}

// ---------------------------------------------------------------------------
// Time entries section
// ---------------------------------------------------------------------------

function formatEntryDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatHours(minutes: number | null): string {
  if (minutes == null) return "—";
  return (minutes / 60).toFixed(1) + "h";
}

interface TimeEntryRowProps {
  entry: ClockEntry;
  contracts: Contract[];
}

function TimeEntryRow({
  entry,
  contracts,
}: TimeEntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [hrs, setHrs] = useState(
    entry.duration_minutes != null
      ? String(entry.duration_minutes / 60)
      : ""
  );
  const [contract, setContract] = useState(
    entry.contract ?? ""
  );
  const invoicedSet = useInvoicedContracts();
  const isInv = isInvoiced(
    invoicedSet, entry.customer, entry.contract,
  );
  const updateEntry = useUpdateClockEntry();
  const deleteEntry = useDeleteClockEntry();

  function handleSave() {
    const h = parseFloat(hrs);
    if (!desc.trim() || isNaN(h)) return;
    updateEntry.mutate(
      {
        startIso: entry.start,
        updates: {
          description: desc.trim(),
          hours: h,
          contract,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 py-1.5 border-b border-border-subtle last:border-0">
        <textarea
          autoFocus
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.metaKey || e.ctrlKey)
            ) {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="Description"
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
            placeholder="Hours"
            className={fieldClass(
              "w-16 shrink-0 tabular-nums"
            )}
          />
        </div>
        {contracts.length > 0 && (
          <select
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            className={fieldClass()}
          >
            <option value="">-- no contract --</option>
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
            className="p-0.5 text-stone-500 hover:text-stone-900 rounded"
          >
            <X size={10} />
          </button>
          <button
            onClick={handleSave}
            disabled={updateEntry.isPending}
            className="p-0.5 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
          >
            <Check size={10} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1.5 py-1 border-b border-border-subtle last:border-0">
      <span
        className="text-[10px] text-stone-500 tabular-nums shrink-0 cursor-pointer hover:text-cta"
        onClick={() =>
          navigateToClockDate(entry.start.slice(0, 10))
        }
      >
        {formatEntryDate(entry.start)}
      </span>
      <span className="text-xs text-stone-800 truncate min-w-0 flex-1">
        {entry.description}
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
          {isInv && " ✓"}
        </span>
      )}
      <span className="text-[10px] text-stone-600 tabular-nums shrink-0">
        {formatHours(entry.duration_minutes)}
      </span>
      <div className="hidden group-hover:flex gap-0.5 shrink-0">
        <button
          onClick={() => {
            setDesc(entry.description);
            setHrs(
              entry.duration_minutes != null
                ? String(entry.duration_minutes / 60)
                : ""
            );
            setContract(entry.contract ?? "");
            setEditing(true);
          }}
          className="p-0.5 rounded text-stone-400 hover:text-cta hover:bg-cta-muted transition-colors"
          title="Edit"
        >
          <Pencil size={10} />
        </button>
        <ConfirmPopover
          onConfirm={() => deleteEntry.mutate(entry.start)}
          disabled={deleteEntry.isPending}
        >
          <button
            disabled={deleteEntry.isPending}
            className="p-0.5 rounded text-stone-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <Trash2 size={10} />
          </button>
        </ConfirmPopover>
      </div>
    </div>
  );
}

function TasksSection({
  customerName,
}: {
  customerName: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: allTasks = [] } = useTasks(true);
  const setView = useSetView();
  const [limit, setLimit] = useState(PAGE_SIZE);

  const tasks = allTasks.filter(
    (t) =>
      (t.customer || "").toLowerCase() ===
      customerName.toLowerCase(),
  );

  const visible = tasks.slice(0, limit);
  const hasMore = tasks.length > limit;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex items-center gap-1 text-[10px]",
          "font-semibold uppercase tracking-wider",
          "text-stone-500 hover:text-stone-700",
          "transition-colors",
        ].join(" ")}
      >
        {open ? (
          <ChevronDown size={10} />
        ) : (
          <ChevronRight size={10} />
        )}
        Tasks ({tasks.length})
      </button>

      {open && (
        <div className="mt-1 ml-5">
          {tasks.length === 0 ? (
            <p className="text-[10px] text-stone-500 py-1">
              No tasks
            </p>
          ) : (
            <>
              {visible.map((t) => (
                <button
                  key={t.id}
                  onClick={() =>
                    setView(
                      "board",
                      t.title.replace(
                        CUSTOMER_PREFIX_RE, "",
                      ),
                    )
                  }
                  className={[
                    "w-full text-left flex items-center",
                    "gap-2 py-1.5 text-xs",
                    "border-b border-border-subtle",
                    "last:border-0 hover:bg-surface-raised",
                    "transition-colors rounded px-1",
                    t.status === "DONE"
                      ? "opacity-50" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span
                    className={[
                      "px-1 py-0.5 rounded text-[9px]",
                      "font-bold uppercase tracking-wider",
                      "shrink-0",
                      t.status === "DONE"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : t.status === "IN-PROGRESS"
                          ? "bg-blue-500/10 text-blue-600"
                          : t.status === "NEXT"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-surface-overlay text-stone-600",
                    ].join(" ")}
                  >
                    {t.status}
                  </span>
                  <span className="truncate text-stone-800">
                    {t.title.replace(
                      CUSTOMER_PREFIX_RE, "",
                    )}
                  </span>
                </button>
              ))}
              {hasMore && (
                <button
                  onClick={() =>
                    setLimit((l) => l + PAGE_SIZE)
                  }
                  className={[
                    "w-full text-center py-1.5",
                    "text-[10px] text-stone-500",
                    "hover:text-cta transition-colors",
                  ].join(" ")}
                >
                  Show {Math.min(
                    PAGE_SIZE,
                    tasks.length - limit,
                  )} more
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TimeEntriesSection({
  customerName,
  contracts,
}: {
  customerName: string;
  contracts: Contract[];
}) {
  const [open, setOpen] = useState(false);
  const { data: entries = [] } = useCustomerClockEntries(
    open ? customerName : ""
  );
  const [limit, setLimit] = useState(PAGE_SIZE);

  const visible = entries.slice(0, limit);
  const hasMore = entries.length > limit;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-700 transition-colors"
      >
        {open ? (
          <ChevronDown size={10} />
        ) : (
          <ChevronRight size={10} />
        )}
        Time Entries
        {open ? ` (${entries.length})` : ""}
      </button>

      {open && (
        <div className="mt-1 ml-5">
          {entries.length === 0 ? (
            <p className="text-[10px] text-stone-500 py-1">
              No entries
            </p>
          ) : (
            <>
              {visible.map((e) => (
                <TimeEntryRow
                  key={e.start}
                  entry={e}
                  contracts={contracts}
                />
              ))}
              {hasMore && (
                <button
                  onClick={() =>
                    setLimit((l) => l + PAGE_SIZE)
                  }
                  className={[
                    "w-full text-center py-1.5",
                    "text-[10px] text-stone-500",
                    "hover:text-cta transition-colors",
                  ].join(" ")}
                >
                  Show {Math.min(
                    PAGE_SIZE,
                    entries.length - limit,
                  )} more
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick-book form (inline on customer card)
// ---------------------------------------------------------------------------

function QuickBookForm({
  customerName,
  contracts,
  defaultContract,
  onDone,
}: {
  customerName: string;
  contracts: Contract[];
  defaultContract: string;
  onDone: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [duration, setDuration] = useState("");
  const [date, setDate] = useState(today);
  const [contract, setContract] = useState(defaultContract);
  const [description, setDescription] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const book = useQuickBook();

  const cls =
    "px-2 py-1 rounded-md text-xs bg-surface-raised border border-border " +
    "text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!duration.trim() || !description.trim()) return;
    book.mutate(
      {
        duration: duration.trim(),
        customer: customerName,
        description: description.trim(),
        contract: contract || undefined,
        taskId: taskId ?? undefined,
        date: date !== today ? date : undefined,
      },
      { onSuccess: onDone }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-1 mt-2 p-2 rounded-lg bg-surface-overlay border border-border"
    >
      <div className="flex gap-1">
        <input
          autoFocus
          type="text"
          placeholder="Duration (e.g. 1h30m)"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className={`w-32 shrink-0 ${cls}`}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`w-32 shrink-0 ${cls}`}
        />
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`flex-1 min-w-0 ${cls}`}
        />
      </div>
      {contracts.length > 0 && (
        <select
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          className={`w-full ${cls}`}
        >
          <option value="">— no contract —</option>
          {contracts.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}{c.end_date ? " (closed)" : ""}
            </option>
          ))}
        </select>
      )}
      <TaskAutocomplete
        taskId={taskId}
        value={taskTitle}
        onChange={setTaskTitle}
        onSelect={(id, label) => { setTaskId(id); setTaskTitle(label); }}
        onClear={() => { setTaskId(null); setTaskTitle(""); }}
        customer={customerName}
        inputClassName={cls}
        className="w-full"
      />
      <div className="flex gap-1 justify-end">
        <button
          type="button"
          onClick={onDone}
          className="p-1 text-stone-500 hover:text-stone-900 rounded"
        >
          <X size={11} />
        </button>
        <button
          type="submit"
          disabled={
            book.isPending || !duration.trim() || !description.trim()
          }
          className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
        >
          <Check size={11} />
        </button>
      </div>
    </form>
  );
}

export function CustomerCard({ customer: c }: Props) {
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [form, setForm] = useState<EditState>(toEditState(c));
  const update = useUpdateCustomer();
  const remove = useDeleteCustomer();
  const { data: settings } = useSettings();
  const customerTypes = settings?.customer_types ?? [];

  const contracts = c.contracts ?? [];
  const activeContract =
    contracts.find(
      (ct) => !ct.end_date,
    )?.name ?? "";

  const hasContracts = contracts.length > 0;
  const hasContingent = !hasContracts && c.budget > 0;
  const isArchived = ["inactive", "archiv", "archived"].includes(
    c.status.toLowerCase()
  );

  function startEdit() {
    setForm(toEditState(c));
    setEditing(true);
  }

  function handleSave() {
    const updates: Parameters<typeof update.mutate>[0]["updates"] = {
      name: form.name.trim() || c.name,
      status: form.status,
      type: form.type,
      color: form.color,
      budget: parseFloat(form.budget) || 0,
      repo: form.repo.trim() || null,
    };
    if (!hasContracts) {
      updates.used_offset =
        parseFloat(form.used_offset) || 0;
    }
    update.mutate(
      { name: c.name, updates },
      { onSuccess: () => setEditing(false) }
    );
  }

  function set(key: keyof EditState) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setEditing(false);
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <div
      className={[
        "flex flex-col gap-3 p-5 rounded-xl border transition-colors",
        "bg-surface-card hover:bg-surface-raised",
        isArchived
          ? "border-border-subtle opacity-60"
          : "border-border",
      ].join(" ")}
    >
      {editing ? (
        /* Edit mode */
        <div
          className="flex flex-col gap-2"
          onKeyDown={handleEditKeyDown}
        >
          <div className="flex items-center gap-1.5">
            <label
              className="w-3.5 h-3.5 rounded-full shrink-0 cursor-pointer ring-1 ring-border hover:ring-cta transition-shadow"
              style={{
                background: form.color || "#71717a",
              }}
              title="Pick color"
            >
              <input
                type="color"
                value={form.color || "#71717a"}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    color: e.target.value,
                  }))
                }
                className="sr-only"
              />
            </label>
            <input
              className={fieldClass("font-semibold flex-1")}
              value={form.name}
              onChange={set("name")}
              placeholder="Name"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <select
              className={fieldClass("flex-1")}
              value={form.status}
              onChange={set("status")}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className={fieldClass("flex-1")}
              value={form.type}
              onChange={set("type")}
            >
              <option value="">— type —</option>
              {customerTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {!hasContracts && (
            <div className="flex gap-2">
              <label className="flex flex-col gap-0.5 flex-1">
                <span className="text-[10px] text-stone-500 uppercase tracking-wider">
                  Budget h
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className={fieldClass("tabular-nums")}
                  value={form.budget}
                  onChange={set("budget")}
                />
              </label>
              <label className="flex flex-col gap-0.5 flex-1">
                <span className="text-[10px] text-stone-500 uppercase tracking-wider">
                  Offset h
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className={fieldClass("tabular-nums")}
                  value={form.used_offset}
                  onChange={set("used_offset")}
                />
              </label>
            </div>
          )}

          <input
            className={fieldClass()}
            value={form.repo}
            onChange={set("repo")}
            placeholder="Repo URL"
          />

          <div className="flex gap-2 justify-end mt-1">
            <button
              onClick={() => setEditing(false)}
              className="p-1.5 rounded-md text-stone-500 hover:text-stone-900 transition-colors"
              title="Cancel"
            >
              <X size={14} />
            </button>
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className="p-1.5 rounded-md text-cta hover:bg-cta-muted transition-colors disabled:opacity-40"
              title="Save"
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      ) : (
        /* View mode */
        <>
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 min-h-[36px] flex flex-col justify-start">
              <h3 className="text-sm font-semibold text-stone-900 truncate flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    background: c.color || "#a1a1aa",
                  }}
                />
                {c.name}
              </h3>
              {c.repo && (
                <a
                  href={c.repo}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-stone-500 hover:text-cta mt-0.5 transition-colors"
                >
                  <ExternalLink size={10} />
                  {c.repo.replace(/^https?:\/\//, "").slice(0, 30)}
                </a>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
              {c.type && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-surface-overlay text-stone-700">
                  {c.type}
                </span>
              )}
              <span
                className={[
                  "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                  isArchived
                    ? "bg-stone-500/10 text-stone-500"
                    : "bg-emerald-500/15 text-emerald-400",
                ].join(" ")}
              >
                {c.status}
              </span>
              <button
                onClick={startEdit}
                className="p-1 rounded-md text-stone-400 hover:text-cta hover:bg-cta-muted transition-colors"
                title="Edit"
              >
                <Pencil size={11} />
              </button>
              <ConfirmPopover
                label={`Delete ${c.name}?`}
                onConfirm={() => remove.mutate(c.name)}
                disabled={remove.isPending}
              >
                <button
                  disabled={remove.isPending}
                  className="p-1 rounded-md text-stone-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  title="Delete customer"
                >
                  <Trash2 size={11} />
                </button>
              </ConfirmPopover>
            </div>
          </div>

          {/* Budget — legacy single bar when no contracts */}
          {hasContingent && (
            <BudgetBar
              used={c.used}
              budget={c.budget}
              rest={c.rest}
            />
          )}

          {/* Contracts section */}
          {hasContracts ? (
            <ContractsSection customer={c} />
          ) : (
            <AddFirstContractInline customerName={c.name} />
          )}

          {/* Tasks */}
          <TasksSection customerName={c.name} />

          {/* Time entries */}
          <TimeEntriesSection
            customerName={c.name}
            contracts={c.contracts}
          />

          {/* Quick-book */}
          {booking ? (
            <QuickBookForm
              customerName={c.name}
              contracts={c.contracts}
              defaultContract={activeContract}
              onDone={() => setBooking(false)}
            />
          ) : (
            <button
              onClick={() => setBooking(true)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
            >
              <Clock size={10} />
              Book time
            </button>
          )}
        </>
      )}
    </div>
  );
}
