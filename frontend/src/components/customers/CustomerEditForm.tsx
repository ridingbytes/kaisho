/**
 * CustomerEditForm renders the inline edit form for
 * customer properties (name, status, type, color,
 * budget, repo).
 */
import { Check, X } from "lucide-react";
import { smallInputCls } from "../../styles/formStyles";
import { useSettings } from "../../hooks/useSettings";
import { useUpdateCustomer } from "../../hooks/useCustomers";
import type { Customer } from "../../types";

const STATUS_OPTIONS = ["active", "inactive", "archiv"];

export interface EditState {
  name: string;
  status: string;
  type: string;
  color: string;
  budget: string;
  used_offset: string;
  repo: string;
}

export interface CustomerEditFormProps {
  /** The customer being edited. */
  customer: Customer;
  /** Current form state. */
  form: EditState;
  /** Setter for individual form fields. */
  setForm: React.Dispatch<
    React.SetStateAction<EditState>
  >;
  /** Called when editing is cancelled or saved. */
  onClose: () => void;
}

/** Convert a Customer to the initial edit state. */
export function toEditState(c: Customer): EditState {
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
  return `${smallInputCls} ${base}`;
}

/** Inline customer property editor. */
export function CustomerEditForm({
  customer: c,
  form,
  setForm,
  onClose,
}: CustomerEditFormProps) {
  const update = useUpdateCustomer();
  const { data: settings } = useSettings();
  const customerTypes = settings?.customer_types ?? [];
  const hasContracts = (c.contracts ?? []).length > 0;

  function set(key: keyof EditState) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({
        ...f,
        [key]: e.target.value,
      }));
  }

  function handleSave() {
    const updates: Parameters<
      typeof update.mutate
    >[0]["updates"] = {
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
      { onSuccess: () => onClose() },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (
      e.key === "Enter"
      && (e.metaKey || e.ctrlKey)
    ) {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <div
      className="flex flex-col gap-2"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-1.5">
        <label
          className={
            "w-3.5 h-3.5 rounded-full shrink-0 "
            + "cursor-pointer ring-1 ring-border "
            + "hover:ring-cta transition-shadow"
          }
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
          className={fieldClass(
            "font-semibold flex-1",
          )}
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
          <option value="">{"— type —"}</option>
          {customerTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {!hasContracts && (
        <div className="flex gap-2">
          <label
            className={
              "flex flex-col gap-0.5 flex-1"
            }
          >
            <span
              className={
                "text-[10px] text-stone-500 "
                + "uppercase tracking-wider"
              }
            >
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
          <label
            className={
              "flex flex-col gap-0.5 flex-1"
            }
          >
            <span
              className={
                "text-[10px] text-stone-500 "
                + "uppercase tracking-wider"
              }
            >
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
          onClick={onClose}
          className={
            "p-1.5 rounded-md text-stone-500 "
            + "hover:text-stone-900 transition-colors"
          }
          title="Cancel"
        >
          <X size={14} />
        </button>
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className={
            "p-1.5 rounded-md text-cta "
            + "hover:bg-cta-muted transition-colors "
            + "disabled:opacity-40"
          }
          title="Save"
        >
          <Check size={14} />
        </button>
      </div>
    </div>
  );
}
