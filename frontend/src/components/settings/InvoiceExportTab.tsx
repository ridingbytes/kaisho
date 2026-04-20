import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useInvoiceExportSettings } from "../../hooks/useSettings";
import {
  updateInvoiceExportSettings,
} from "../../api/client";
import type { ExportColumnConfig } from "../../api/client";
import {
  AVAILABLE_FIELDS,
} from "../../utils/exportClocks";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
} from "lucide-react";
import { saveBtnCls } from "./styles";

export function InvoiceExportSection(): JSX.Element {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { data: settings, isLoading } =
    useInvoiceExportSettings();
  const qc = useQueryClient();

  const [columns, setColumns] = useState<
    ExportColumnConfig[]
  >([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.columns) {
      setColumns(settings.columns);
    }
  }, [settings]);

  const selectedFields = new Set(
    columns.map((c) => c.field),
  );
  const available = AVAILABLE_FIELDS.filter(
    (f) => !selectedFields.has(f.field),
  );

  function addField(field: string) {
    setColumns((prev) => [...prev, { field }]);
  }

  function removeField(idx: number) {
    setColumns((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    setColumns((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [
        next[idx],
        next[idx - 1],
      ];
      return next;
    });
  }

  function moveDown(idx: number) {
    if (idx >= columns.length - 1) return;
    setColumns((prev) => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [
        next[idx + 1],
        next[idx],
      ];
      return next;
    });
  }

  function setFormat(idx: number, format: string) {
    setColumns((prev) =>
      prev.map((c, i) =>
        i === idx
          ? {
              ...c,
              format: format || undefined,
            }
          : c,
      ),
    );
  }

  function handleSave() {
    setSaving(true);
    updateInvoiceExportSettings(columns)
      .then(() => {
        void qc.invalidateQueries({
          queryKey: ["settings", "invoice_export"],
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .finally(() => setSaving(false));
  }

  function handleReset() {
    setColumns([
      { field: "date" },
      { field: "start_time" },
      { field: "end_time" },
      { field: "customer" },
      { field: "description" },
      { field: "contract" },
      { field: "task" },
      { field: "hours" },
    ]);
  }

  if (isLoading) {
    return (
      <p className="text-sm text-stone-500">
        Loading...
      </p>
    );
  }

  return (
    <section>
      <p className="text-xs text-stone-500 leading-relaxed mb-4">
        {t("exportHint")}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Selected columns */}
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2 border-b border-border-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              {t("selectedColumns")}
            </p>
          </div>
          <div className="p-2">
            {columns.length === 0 && (
              <p className="text-xs text-stone-400 text-center py-4">
                {t("noColumnsSelected")}
              </p>
            )}
            {columns.map((col, idx) => {
              const def = AVAILABLE_FIELDS.find(
                (f) => f.field === col.field,
              );
              return (
                <div
                  key={col.field}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-surface-raised transition-colors"
                >
                  <span className="text-xs text-stone-700 flex-1">
                    {def?.label ?? col.field}
                  </span>
                  {def?.formats && (
                    <select
                      value={col.format ?? ""}
                      onChange={(e) =>
                        setFormat(idx, e.target.value)
                      }
                      className="px-1 py-0.5 rounded text-[10px] bg-surface-raised border border-border text-stone-700 focus:outline-none focus:border-cta"
                    >
                      {def.formats.map((f) => (
                        <option
                          key={f.value}
                          value={f.value}
                        >
                          {f.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="p-0.5 rounded text-stone-400 hover:text-stone-700 disabled:opacity-20"
                  >
                    <ArrowUp size={10} />
                  </button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={
                      idx >= columns.length - 1
                    }
                    className="p-0.5 rounded text-stone-400 hover:text-stone-700 disabled:opacity-20"
                  >
                    <ArrowDown size={10} />
                  </button>
                  <button
                    onClick={() => removeField(idx)}
                    className="p-0.5 rounded text-stone-400 hover:text-red-500"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Available fields */}
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2 border-b border-border-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              {t("availableFields")}
            </p>
          </div>
          <div className="p-2">
            {available.length === 0 && (
              <p className="text-xs text-stone-400 text-center py-4">
                {t("allFieldsSelected")}
              </p>
            )}
            {available.map((f) => (
              <button
                key={f.field}
                onClick={() => addField(f.field)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xs text-stone-600 hover:bg-surface-raised hover:text-stone-900 transition-colors"
              >
                <Plus size={10} className="text-stone-400" />
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className={saveBtnCls}
        >
          {saving ? tc("saving") : tc("save")}
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-1.5 rounded text-sm text-stone-600 hover:text-stone-900 border border-border hover:border-stone-400 transition-colors"
        >
          {tc("resetToDefault")}
        </button>
        {saved && (
          <span className="text-xs text-green-400">
            {tc("saved")}
          </span>
        )}
      </div>
    </section>
  );
}
