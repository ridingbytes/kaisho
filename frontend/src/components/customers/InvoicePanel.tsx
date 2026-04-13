import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  batchInvoiceEntries,
  fetchInvoicePreview,
} from "../../api/client";
import { useContracts } from "../../hooks/useContracts";
import { useToast } from "../../context/ToastContext";
import { ConfirmPopover } from "../common/ConfirmPopover";
import {
  exportClocksCsv,
  exportClocksExcel,
} from "../../utils/exportClocks";
import { useInvoiceExportSettings } from "../../hooks/useSettings";
import { Check, Download, X } from "lucide-react";
import type { ClockEntry } from "../../types";

interface Props {
  customer: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatHours(minutes: number | null): string {
  if (minutes == null) return "0:00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function InvoicePanel({
  customer,
  onClose,
}: Props) {
  const { data: contracts = [] } = useContracts(customer);
  const [contract, setContract] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [booking, setBooking] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const { data: exportSettings } =
    useInvoiceExportSettings();
  const exportColumns = exportSettings?.columns;

  const { data: preview, isLoading } = useQuery({
    queryKey: [
      "invoice-preview",
      customer, contract, fromDate, toDate,
    ],
    queryFn: () =>
      fetchInvoicePreview(
        customer,
        contract || null,
        fromDate || null,
        toDate || null,
      ),
    staleTime: 10_000,
  });

  const entries = preview?.entries ?? [];

  function handleBookAll() {
    if (!entries.length) return;
    setBooking(true);
    const starts = entries.map(
      (e: ClockEntry) => e.start,
    );
    batchInvoiceEntries(starts)
      .then((res) => {
        toast(
          `${res.invoiced} entries marked as invoiced`,
        );
        void qc.invalidateQueries({
          queryKey: ["invoice-preview"],
        });
        void qc.invalidateQueries({
          queryKey: ["clocks"],
        });
        void qc.invalidateQueries({
          queryKey: ["customers"],
        });
      })
      .finally(() => setBooking(false));
  }

  function handleExportCsv() {
    if (!entries.length) return;
    exportClocksCsv(
      entries,
      `invoice-${customer}-${fromDate || "all"}.csv`,
      exportColumns,
    );
  }

  function handleExportExcel() {
    if (!entries.length) return;
    exportClocksExcel(
      entries,
      `invoice-${customer}-${fromDate || "all"}.xlsx`,
      exportColumns,
    );
  }

  return (
    <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-600 flex-1">
          Invoice: {customer}
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded text-stone-400 hover:text-stone-700"
        >
          <X size={14} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border-subtle">
        {contracts.length > 0 && (
          <select
            value={contract}
            onChange={(e) =>
              setContract(e.target.value)
            }
            className="px-2 py-1 rounded text-xs bg-surface-raised border border-border text-stone-900 focus:outline-none focus:border-cta"
          >
            <option value="">All contracts</option>
            {contracts.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={fromDate}
          onChange={(e) =>
            setFromDate(e.target.value)
          }
          className="px-2 py-1 rounded text-xs bg-surface-raised border border-border text-stone-900 focus:outline-none focus:border-cta"
        />
        <span className="text-xs text-stone-400">to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) =>
            setToDate(e.target.value)
          }
          className="px-2 py-1 rounded text-xs bg-surface-raised border border-border text-stone-900 focus:outline-none focus:border-cta"
        />
      </div>

      {/* Summary */}
      {preview && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border-subtle">
          <span className="text-xs text-stone-600">
            {preview.entry_count} unbilled entries
          </span>
          <span className="text-xs font-semibold text-stone-900">
            {preview.total_hours}h
          </span>
          <div className="flex-1" />
          <button
            onClick={handleExportCsv}
            disabled={!entries.length}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-stone-700 hover:text-cta hover:bg-cta-muted transition-colors disabled:opacity-40"
            title="Download CSV"
          >
            <Download size={11} /> CSV
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!entries.length}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-stone-700 hover:text-cta hover:bg-cta-muted transition-colors disabled:opacity-40"
            title="Download Excel"
          >
            <Download size={11} /> XLS
          </button>
          <ConfirmPopover
            label={`Mark ${entries.length} entries as invoiced?`}
            onConfirm={handleBookAll}
            disabled={booking || !entries.length}
          >
            <button
              disabled={booking || !entries.length}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-cta text-white hover:bg-cta-hover transition-colors disabled:opacity-40"
            >
              <Check size={12} />
              {booking
                ? "Saving..."
                : "Mark as invoiced"}
            </button>
          </ConfirmPopover>
        </div>
      )}

      {/* Entry list */}
      <div className="max-h-64 overflow-y-auto">
        {isLoading && (
          <p className="text-xs text-stone-500 text-center py-4">
            Loading...
          </p>
        )}
        {!isLoading && entries.length === 0 && (
          <p className="text-xs text-stone-500 text-center py-4">
            No unbilled entries found.
          </p>
        )}
        {entries.map((e: ClockEntry) => (
          <div
            key={e.start}
            className="flex items-center gap-3 px-4 py-1.5 text-xs border-b border-border-subtle last:border-b-0"
          >
            <span className="text-stone-400 tabular-nums w-20 shrink-0">
              {formatDate(e.start)}
            </span>
            <span className="flex-1 text-stone-700 truncate">
              {e.description || "(no description)"}
            </span>
            {e.contract && (
              <span className="text-[10px] text-stone-400">
                {e.contract}
              </span>
            )}
            <span className="font-medium tabular-nums text-stone-900">
              {formatHours(e.duration_minutes)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
