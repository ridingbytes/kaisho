import type { ClockEntry } from "../types";

const HEADERS = [
  "Date",
  "Start",
  "End",
  "Customer",
  "Description",
  "Contract",
  "Task",
  "Hours",
];

function formatEntryDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatEntryTime(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(11, 16);
}

function formatEntryHours(minutes: number | null): string {
  if (minutes === null) return "";
  return (minutes / 60).toFixed(2);
}

function entryToRow(entry: ClockEntry): string[] {
  return [
    formatEntryDate(entry.start),
    formatEntryTime(entry.start),
    formatEntryTime(entry.end),
    entry.customer,
    entry.description,
    entry.contract ?? "",
    entry.task_id ?? "",
    formatEntryHours(entry.duration_minutes),
  ];
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
  filename: string
): void {
  const header = HEADERS.map(escapeCsvField).join(",");
  const rows = entries.map(
    (e) => entryToRow(e).map(escapeCsvField).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlCell(value: string, type: string): string {
  return (
    "<Cell><Data ss:Type=\"" +
    type +
    "\">" +
    escapeXml(value) +
    "</Data></Cell>"
  );
}

function xmlRow(cells: string[]): string {
  return "<Row>" + cells.join("") + "</Row>";
}

export function exportClocksExcel(
  entries: ClockEntry[],
  filename: string
): void {
  const headerCells = HEADERS.map(
    (h) => xmlCell(h, "String")
  );
  const headerRow = xmlRow(headerCells);

  const dataRows = entries.map((entry) => {
    const row = entryToRow(entry);
    const cells = row.map((val, i) => {
      const isNumber = i === 7 && val !== "";
      return xmlCell(val, isNumber ? "Number" : "String");
    });
    return xmlRow(cells);
  });

  const xml = [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    "<Workbook",
    '  xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    '  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Worksheet ss:Name="Clock Entries">',
    "<Table>",
    headerRow,
    ...dataRows,
    "</Table>",
    "</Worksheet>",
    "</Workbook>",
  ].join("\n");

  const blob = new Blob([xml], {
    type: "application/vnd.ms-excel",
  });
  triggerDownload(blob, filename);
}
