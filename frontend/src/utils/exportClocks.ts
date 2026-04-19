import * as XLSX from "xlsx";
import type { ClockEntry } from "../types";

// ── Column definitions ───────────────────────────────

export interface ExportColumn {
  field: string;
  format?: string;
}

export const AVAILABLE_FIELDS: {
  field: string;
  label: string;
  formats?: { value: string; label: string }[];
}[] = [
  { field: "#", label: "Row number" },
  {
    field: "date",
    label: "Date",
    formats: [
      { value: "YYYY-MM-DD", label: "2026-04-10" },
      { value: "DD.MM.YYYY", label: "10.04.2026" },
      { value: "MM/DD/YYYY", label: "04/10/2026" },
    ],
  },
  { field: "start_time", label: "Start time" },
  { field: "end_time", label: "End time" },
  { field: "customer", label: "Customer" },
  { field: "contract", label: "Contract" },
  { field: "description", label: "Description" },
  {
    field: "hours",
    label: "Hours",
    formats: [
      { value: "decimal", label: "3.50" },
      { value: "hm", label: "3:30" },
    ],
  },
  { field: "duration", label: "Duration (h:mm)" },
  { field: "task", label: "Task" },
  { field: "notes", label: "Notes" },
  { field: "invoiced", label: "Invoiced" },
];

const DEFAULT_COLUMNS: ExportColumn[] = [
  { field: "date" },
  { field: "start_time" },
  { field: "end_time" },
  { field: "customer" },
  { field: "description" },
  { field: "contract" },
  { field: "task" },
  { field: "hours" },
];

// ── Formatters ───────────────────────────────────────

function formatDate(
  iso: string, fmt?: string,
): string {
  const d = iso.slice(0, 10);
  if (!fmt || fmt === "YYYY-MM-DD") return d;
  const [y, m, day] = d.split("-");
  if (fmt === "DD.MM.YYYY") return `${day}.${m}.${y}`;
  if (fmt === "MM/DD/YYYY") return `${m}/${day}/${y}`;
  return d;
}

function formatHours(
  minutes: number | null, fmt?: string,
): string {
  if (minutes === null) return "";
  if (fmt === "hm") {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  return (minutes / 60).toFixed(2);
}

function formatDuration(
  minutes: number | null,
): string {
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

// ── Row builder ──────────────────────────────────────

function cellValue(
  entry: ClockEntry,
  col: ExportColumn,
  rowNum: number,
): string | number {
  switch (col.field) {
    case "#":
      return rowNum;
    case "date":
      return formatDate(entry.start, col.format);
    case "start_time":
      return entry.start.slice(11, 16);
    case "end_time":
      return entry.end?.slice(11, 16) ?? "";
    case "customer":
      return entry.customer;
    case "contract":
      return entry.contract ?? "";
    case "description":
      return entry.description;
    case "hours": {
      if (entry.duration_minutes === null) return "";
      if (col.format === "hm") {
        return formatHours(
          entry.duration_minutes, "hm",
        );
      }
      return Math.round(
        (entry.duration_minutes / 60) * 100,
      ) / 100;
    }
    case "duration":
      return formatDuration(entry.duration_minutes);
    case "task":
      return entry.task_id ?? "";
    case "notes":
      return entry.notes;
    case "invoiced":
      return entry.invoiced ? "yes" : "no";
    default:
      return "";
  }
}

function columnHeaders(
  columns: ExportColumn[],
): string[] {
  return columns.map((col) => {
    const def = AVAILABLE_FIELDS.find(
      (f) => f.field === col.field,
    );
    return def?.label ?? col.field;
  });
}

// ── Download helper ──────────────────────────────────

async function triggerDownload(
  blob: Blob, filename: string,
): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) {
    try {
      const { save } = await import(
        "@tauri-apps/plugin-dialog"
      );
      const { writeTextFile } = await import(
        "@tauri-apps/plugin-fs"
      );
      const path = await save({
        defaultPath: filename,
        filters: [{
          name: filename.endsWith(".xlsx")
            ? "Excel" : "CSV",
          extensions: [
            filename.split(".").pop() || "csv",
          ],
        }],
      });
      if (path) {
        const text = await blob.text();
        await writeTextFile(path, text);
      }
      return;
    } catch {
      // fall through to browser download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── CSV export ───────────────────────────────────────

function escapeCsvField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportClocksCsv(
  entries: ClockEntry[],
  filename: string,
  columns?: ExportColumn[],
): void {
  const cols = columns ?? DEFAULT_COLUMNS;
  const header = columnHeaders(cols)
    .map(escapeCsvField)
    .join(",");
  const rows = entries.map((e, i) =>
    cols
      .map((col) => {
        const v = cellValue(e, col, i + 1);
        return escapeCsvField(String(v));
      })
      .join(","),
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(
    [csv], { type: "text/csv;charset=utf-8" },
  );
  triggerDownload(blob, filename);
}

// ── Excel export (XLSX) ──────────────────────────────

export function exportClocksExcel(
  entries: ClockEntry[],
  filename: string,
  columns?: ExportColumn[],
): void {
  const cols = columns ?? DEFAULT_COLUMNS;
  const headers = columnHeaders(cols);

  const rows = entries.map((entry, i) =>
    cols.map((col) => cellValue(entry, col, i + 1)),
  );

  const ws = XLSX.utils.aoa_to_sheet(
    [headers, ...rows],
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb, ws, "Clock Entries",
  );

  const buf = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
  });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, filename);
}
