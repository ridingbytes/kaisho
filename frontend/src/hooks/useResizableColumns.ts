/**
 * Hook for resizable table columns with "adjacent-shrinks"
 * UX: dragging a handle grows one column and shrinks its
 * right neighbour so the total table width stays constant.
 *
 * Widths are stored as percentages (sum = 100) and persisted
 * in localStorage keyed by tableId. If the column keys stored
 * don't match the current config, defaults are used.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const MIN_PCT = 3;
const STORAGE_PREFIX = "kaisho:table-widths:";

/** Column definition for {@link useResizableColumns}. */
export interface ColumnConfig {
  /** Stable key used to detect config changes. */
  key: string;
  /** Default width in percent. Column defaults should sum
   *  to ~100; they will be normalised if they don't. */
  defaultPct: number;
}

/** Return value of {@link useResizableColumns}. */
export interface ResizableColumns {
  /** Current widths in percent. */
  widths: number[];
  /** Attach to the `<table>` to read its pixel width. */
  tableRef: React.RefObject<HTMLTableElement>;
  /** Begin a resize drag at the given column index. The
   *  handle lives between column `index` and `index + 1`,
   *  so the last column has no handle. */
  startResize: (
    index: number,
    e: React.MouseEvent,
  ) => void;
}

function normalise(pcts: number[]): number[] {
  const total = pcts.reduce((a, b) => a + b, 0);
  if (total <= 0) return pcts.map(() => 100 / pcts.length);
  return pcts.map((p) => (p / total) * 100);
}

function loadWidths(
  storageKey: string,
  columns: ColumnConfig[],
): number[] {
  const defaults = normalise(
    columns.map((c) => c.defaultPct),
  );
  const raw = localStorage.getItem(storageKey);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as {
      keys: string[];
      widths: number[];
    };
    const match =
      Array.isArray(parsed.keys) &&
      Array.isArray(parsed.widths) &&
      parsed.keys.length === columns.length &&
      parsed.widths.length === columns.length &&
      parsed.keys.every(
        (k, i) => k === columns[i].key,
      );
    if (!match) return defaults;
    return normalise(parsed.widths);
  } catch {
    return defaults;
  }
}

function saveWidths(
  storageKey: string,
  columns: ColumnConfig[],
  widths: number[],
) {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      keys: columns.map((c) => c.key),
      widths,
    }),
  );
}

/**
 * Manage persisted column widths for a table and provide
 * the drag handler for resize handles.
 */
export function useResizableColumns(
  tableId: string,
  columns: ColumnConfig[],
): ResizableColumns {
  const storageKey = `${STORAGE_PREFIX}${tableId}`;

  const [widths, setWidths] = useState<number[]>(() =>
    loadWidths(storageKey, columns),
  );

  useEffect(() => {
    saveWidths(storageKey, columns, widths);
  }, [storageKey, columns, widths]);

  const tableRef = useRef<HTMLTableElement | null>(null);

  const startResize = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const table = tableRef.current;
      if (!table) return;
      const tableWidth = table.offsetWidth;
      if (tableWidth <= 0) return;

      const startX = e.clientX;
      const startLeft = widths[index];
      const startRight = widths[index + 1];
      const prevUserSelect = document.body.style.userSelect;
      const prevCursor = document.body.style.cursor;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      function applyDelta(dx: number) {
        const dPct = (dx / tableWidth) * 100;
        let left = startLeft + dPct;
        let right = startRight - dPct;
        if (left < MIN_PCT) {
          right -= MIN_PCT - left;
          left = MIN_PCT;
        }
        if (right < MIN_PCT) {
          left -= MIN_PCT - right;
          right = MIN_PCT;
        }
        setWidths((w) => {
          const next = [...w];
          next[index] = left;
          next[index + 1] = right;
          return next;
        });
      }

      function onMove(ev: MouseEvent) {
        applyDelta(ev.clientX - startX);
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = prevUserSelect;
        document.body.style.cursor = prevCursor;
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [widths],
  );

  return { widths, startResize, tableRef };
}
