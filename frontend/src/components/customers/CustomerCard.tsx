import { ExternalLink, Pencil, X, Check } from "lucide-react";
import { useState } from "react";
import { useUpdateCustomer } from "../../hooks/useCustomers";
import type { Customer } from "../../types";

function utilColor(percent: number): string {
  if (percent >= 40) return "#10b981";
  if (percent >= 15) return "#f59e0b";
  return "#ef4444";
}

const STATUS_OPTIONS = ["active", "inactive", "archiv"];

interface Props {
  customer: Customer;
}

interface EditState {
  name: string;
  status: string;
  kontingent: string;
  verbraucht: string;
  rest: string;
  repo: string;
}

function toEditState(c: Customer): EditState {
  return {
    name: c.name,
    status: c.status,
    kontingent: String(c.kontingent),
    verbraucht: String(c.verbraucht),
    rest: String(c.rest),
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

export function CustomerCard({ customer: c }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>(toEditState(c));
  const update = useUpdateCustomer();

  const hasContingent = c.kontingent > 0;
  const usedPercent = hasContingent
    ? Math.min(
        Math.round(((c.kontingent - c.rest) / c.kontingent) * 100),
        100
      )
    : 0;
  const restPercent = hasContingent
    ? Math.min(Math.round((c.rest / c.kontingent) * 100), 100)
    : 0;
  const barColor = utilColor(restPercent);
  const isArchived = ["inactive", "archiv", "archived"].includes(
    c.status.toLowerCase()
  );

  function startEdit() {
    setForm(toEditState(c));
    setEditing(true);
  }

  function handleSave() {
    update.mutate(
      {
        name: c.name,
        updates: {
          name: form.name.trim() || c.name,
          status: form.status,
          kontingent: parseFloat(form.kontingent) || 0,
          verbraucht: parseFloat(form.verbraucht) || 0,
          rest: parseFloat(form.rest) || 0,
          repo: form.repo.trim() || null,
        },
      },
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
        /* ── Edit mode ─────────────────────────────── */
        <div className="flex flex-col gap-2">
          <input
            className={fieldClass("font-semibold")}
            value={form.name}
            onChange={set("name")}
            placeholder="Name"
            autoFocus
          />

          <select
            className={fieldClass()}
            value={form.status}
            onChange={set("status")}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-3 gap-1">
            {(
              [
                ["kontingent", "Budget h"],
                ["verbraucht", "Used h"],
                ["rest", "Left h"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">
                  {label}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className={fieldClass("tabular-nums")}
                  value={form[key]}
                  onChange={set(key)}
                />
              </label>
            ))}
          </div>

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
        /* ── View mode ──────────────────────────────── */
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
            <div className="flex items-center gap-1 shrink-0">
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

          {/* Budget bar */}
          {hasContingent ? (
            <>
              <div>
                <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${usedPercent}%`,
                      backgroundColor: barColor,
                      opacity: 0.3,
                    }}
                  />
                </div>
                <div
                  className="h-1.5 rounded-full bg-surface-overlay overflow-hidden -mt-1.5"
                  title={`${restPercent}% remaining`}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${restPercent}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  {c.verbraucht}h used · {c.rest}h left
                </span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: barColor }}
                >
                  {restPercent}%
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-600">No budget configured</p>
          )}
        </>
      )}
    </div>
  );
}
