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
import { useState } from "react";
import { navigateToClockDate } from "../../utils/clockNavigation";
import { useUpdateCustomer } from "../../hooks/useCustomers";
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
import type {
  ClockEntry,
  Contract,
  Customer,
} from "../../types";

function usedColor(usedPercent: number): string {
  if (usedPercent >= 100) return "#ef4444";
  if (usedPercent >= 80) return "#f59e0b";
  return "#10b981";
}

const STATUS_OPTIONS = ["active", "inactive", "archiv"];

interface Props {
  customer: Customer;
}

interface EditState {
  name: string;
  status: string;
  type: string;
  budget: string;
  used_offset: string;
  repo: string;
}

function toEditState(c: Customer): EditState {
  const rawProp = c.properties?.VERBRAUCHT ?? "";
  const m = rawProp.match(/(\d+(?:\.\d+)?)/);
  return {
    name: c.name,
    status: c.status,
    type: c.type ?? "",
    budget: String(c.budget),
    used_offset: m ? m[1] : "0",
    repo: c.repo ?? "",
  };
}

function fieldClass(base = "") {
  return [
    "w-full px-2 py-1 rounded-md text-xs",
    "bg-surface-overlay border border-border",
    "text-slate-200 placeholder-slate-600",
    "focus:outline-none focus:border-accent",
    base,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Contracts section
// ---------------------------------------------------------------------------

function contractBarColor(pct: number): string {
  if (pct >= 100) return "#ef4444";
  if (pct >= 80) return "#f59e0b";
  return "#10b981";
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
  const updateContract = useUpdateContract();
  const deleteContract = useDeleteContract();

  const isActive = !contract.end_date;
  const pct =
    contract.budget > 0
      ? Math.min(
          Math.round((contract.used / contract.budget) * 100),
          100
        )
      : 0;
  const barColor = contractBarColor(pct);

  function startEdit() {
    setName(contract.name);
    setHours(String(contract.budget));
    setOffset(String(contract.used_offset ?? 0));
    setStartDate(contract.start_date);
    setEndDate(contract.end_date ?? "");
    setNotes(contract.notes);
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
            className="flex-1 min-w-0 px-2 py-1 rounded-md text-xs bg-surface-overlay border border-border text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent"
          />
          <input
            type="number"
            min="0"
            step="1"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Hours"
            className="w-20 shrink-0 px-2 py-1 rounded-md text-xs tabular-nums bg-surface-overlay border border-border text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent"
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
            className="w-20 shrink-0 px-2 py-1 rounded-md text-xs tabular-nums bg-surface-overlay border border-border text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent"
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
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => setEditing(false)}
            className="p-1 text-slate-600 hover:text-slate-300 rounded"
          >
            <X size={11} />
          </button>
          <button
            onClick={handleSave}
            disabled={updateContract.isPending}
            className="p-1 text-accent hover:bg-accent-muted rounded disabled:opacity-40"
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
          isActive ? "text-slate-300" : "text-slate-500",
        ].join(" ")}
      >
        {contract.name}
      </p>
      {/* Row 2: hours + badge + actions */}
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[10px] text-slate-500 tabular-nums">
          {contract.used.toFixed(1)}h /{" "}
          {contract.budget.toFixed(0)}h
        </span>
        {!isActive && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-surface-overlay text-slate-600">
            closed
          </span>
        )}
        <div className="hidden group-hover:flex gap-0.5 ml-auto">
          <button
            onClick={startEdit}
            className="p-0.5 rounded text-slate-700 hover:text-accent hover:bg-accent-muted transition-colors"
            title="Edit"
          >
            <Pencil size={10} />
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete contract "${contract.name}"?`)) {
                deleteContract.mutate({
                  customerName,
                  contractName: contract.name,
                });
              }
            }}
            disabled={deleteContract.isPending}
            className="p-0.5 rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <X size={10} />
          </button>
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
        <p className="text-[10px] text-slate-600 mt-0.5 truncate">
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
  const addContract = useAddContract();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const h = parseFloat(hours);
    if (!name.trim() || isNaN(h)) return;
    addContract.mutate(
      {
        customerName,
        data: { name: name.trim(), budget: h, start_date: startDate },
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
          className="flex-1 min-w-0 px-2 py-1 rounded-md text-xs bg-surface-overlay border border-border text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent"
        />
        <input
          type="number"
          min="0"
          step="1"
          placeholder="Hours"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-20 shrink-0 px-2 py-1 rounded-md text-xs tabular-nums bg-surface-overlay border border-border text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent"
        />
      </div>
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className={fieldClass()}
      />
      <div className="flex gap-1 justify-end">
        <button
          type="button"
          onClick={onDone}
          className="p-1 text-slate-600 hover:text-slate-300 rounded"
        >
          <X size={11} />
        </button>
        <button
          type="submit"
          disabled={
            addContract.isPending || !name.trim() || !hours.trim()
          }
          className="p-1 text-accent hover:bg-accent-muted rounded disabled:opacity-40"
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
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const { data: contracts = [] } = useContracts(
    open ? customer.name : null
  );

  const hasContracts = customer.contracts.length > 0;
  if (!hasContracts) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-400 transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Contracts ({customer.contracts.length})
      </button>

      {open && (
        <div className="mt-2 ml-5">
          {contracts.map((c) => (
            <ContractRow
              key={c.name}
              contract={c}
              customerName={customer.name}
            />
          ))}
          {adding ? (
            <AddContractForm
              customerName={customer.name}
              onDone={() => setAdding(false)}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 px-2 py-1 mt-1 rounded text-[10px] text-slate-600 hover:text-accent hover:bg-accent-muted transition-colors"
            >
              <Plus size={10} />
              Add contract
            </button>
          )}
        </div>
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
        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-600 hover:text-accent hover:bg-accent-muted transition-colors"
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
        <div className="flex gap-1">
          <input
            autoFocus
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Description"
            className={fieldClass("flex-1 min-w-0")}
          />
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
            className="p-0.5 text-slate-600 hover:text-slate-300 rounded"
          >
            <X size={10} />
          </button>
          <button
            onClick={handleSave}
            disabled={updateEntry.isPending}
            className="p-0.5 text-accent hover:bg-accent-muted rounded disabled:opacity-40"
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
        className="text-[10px] text-slate-600 tabular-nums shrink-0 cursor-pointer hover:text-accent"
        onClick={() =>
          navigateToClockDate(entry.start.slice(0, 10))
        }
      >
        {formatEntryDate(entry.start)}
      </span>
      <span className="text-xs text-slate-300 truncate min-w-0 flex-1">
        {entry.description}
      </span>
      {entry.contract && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-surface-overlay text-slate-500 shrink-0 max-w-[6rem] truncate">
          {entry.contract}
        </span>
      )}
      <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
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
          className="p-0.5 rounded text-slate-700 hover:text-accent hover:bg-accent-muted transition-colors"
          title="Edit"
        >
          <Pencil size={10} />
        </button>
        <button
          onClick={() => {
            if (window.confirm("Delete this time entry?")) {
              deleteEntry.mutate(entry.start);
            }
          }}
          disabled={deleteEntry.isPending}
          className="p-0.5 rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete"
        >
          <Trash2 size={10} />
        </button>
      </div>
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

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-400 transition-colors"
      >
        {open ? (
          <ChevronDown size={10} />
        ) : (
          <ChevronRight size={10} />
        )}
        Time Entries{open ? ` (${entries.length})` : ""}
      </button>

      {open && (
        <div className="mt-1 ml-5 max-h-48 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="text-[10px] text-slate-600 py-1">
              No entries
            </p>
          ) : (
            entries.map((e) => (
              <TimeEntryRow
                key={e.start}
                entry={e}
                contracts={contracts}
              />
            ))
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
  const [duration, setDuration] = useState("");
  const [contract, setContract] = useState(defaultContract);
  const [description, setDescription] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const book = useQuickBook();

  const cls =
    "px-2 py-1 rounded-md text-xs bg-surface-raised border border-border " +
    "text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent";

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
          className={`w-36 shrink-0 ${cls}`}
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
          className="p-1 text-slate-600 hover:text-slate-300 rounded"
        >
          <X size={11} />
        </button>
        <button
          type="submit"
          disabled={
            book.isPending || !duration.trim() || !description.trim()
          }
          className="p-1 text-accent hover:bg-accent-muted rounded disabled:opacity-40"
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
  const { data: settings } = useSettings();
  const customerTypes = settings?.customer_types ?? [];

  const activeContract =
    c.contracts.find((ct) => ct.end_date === null)?.name ?? "";

  const hasContracts = (c.contracts ?? []).length > 0;
  const hasContingent = !hasContracts && c.budget > 0;
  const usedPercent = hasContingent
    ? Math.min(
        Math.round(((c.budget - c.rest) / c.budget) * 100),
        100
      )
    : 0;
  const barColor = usedColor(usedPercent);
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
        <div className="flex flex-col gap-2">
          <input
            className={fieldClass("font-semibold")}
            value={form.name}
            onChange={set("name")}
            placeholder="Name"
            autoFocus
          />

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
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">
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
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">
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
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-300 transition-colors"
              title="Cancel"
            >
              <X size={14} />
            </button>
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className="p-1.5 rounded-md text-accent hover:bg-accent-muted transition-colors disabled:opacity-40"
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
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-200 truncate">
                {c.name}
              </h3>
              {c.repo && (
                <a
                  href={c.repo}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-slate-600 hover:text-accent mt-0.5 transition-colors"
                >
                  <ExternalLink size={10} />
                  {c.repo.replace(/^https?:\/\//, "").slice(0, 30)}
                </a>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
              {c.type && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-surface-overlay text-slate-400">
                  {c.type}
                </span>
              )}
              <span
                className={[
                  "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                  isArchived
                    ? "bg-slate-500/10 text-slate-600"
                    : "bg-emerald-500/15 text-emerald-400",
                ].join(" ")}
              >
                {c.status}
              </span>
              <button
                onClick={startEdit}
                className="p-1 rounded-md text-slate-700 hover:text-accent hover:bg-accent-muted transition-colors"
                title="Edit"
              >
                <Pencil size={11} />
              </button>
            </div>
          </div>

          {/* Budget — legacy single bar when no contracts */}
          {hasContingent && (
            <>
              <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${usedPercent}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  {c.used}h used · {c.rest}h left
                </span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: barColor }}
                >
                  {usedPercent}%
                </span>
              </div>
            </>
          )}

          {/* Contracts section */}
          {hasContracts ? (
            <ContractsSection customer={c} />
          ) : (
            <AddFirstContractInline customerName={c.name} />
          )}

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
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-600 hover:text-accent hover:bg-accent-muted transition-colors"
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
