/**
 * Memoised list filter for global search boxes.
 * Delegates the actual matching to
 * {@link matchesAny} so comma-OR regex semantics are
 * consistent across the app.
 */
import { useMemo } from "react";
import { matchesAny } from "../utils/filterMatch";

/**
 * Filter `items` by `query` against one or more string
 * fields extracted from each item.
 *
 * Note: pass a stable reference for `getFields` (a
 * module-level function or a `useCallback`) when you want
 * the memo to skip re-filtering on unrelated renders. An
 * inline lambda is fine for small lists.
 */
export function useFilteredItems<T>(
  items: T[],
  query: string,
  getFields: (item: T) => (string | null | undefined)[],
): T[] {
  return useMemo(() => {
    if (!query.trim()) return items;
    return items.filter((item) =>
      matchesAny(getFields(item), query),
    );
  }, [items, query, getFields]);
}
