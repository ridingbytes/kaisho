/**
 * Shared filter-matching utilities used by global search
 * boxes and column filters.
 *
 * A filter string is a comma-separated list of
 * case-insensitive regex terms. A value matches the
 * filter if ANY term matches (OR semantics). Invalid
 * terms are ignored so mid-typing regex does not hide all
 * results \u2014 callers can surface the invalid state via
 * {@link isValidQuery}.
 *
 * Examples:
 *   matchesFilter("INV-001", "INV")                 // true
 *   matchesFilter("INV-001", "INV-001, INV-002")    // true
 *   matchesFilter("FOO-42",  "INV, FOO")            // true
 *   matchesFilter("FOO-42",  "^FOO-\\d+$")          // true
 *   matchesFilter("abc",     "[broken")             // true (invalid)
 */

/** Split a filter string into comma-separated terms.
 *  Empty terms (from leading / trailing / duplicate
 *  commas) are dropped. */
export function splitTerms(filter: string): string[] {
  return filter
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** True iff `term` compiles as a JS regex. */
export function termIsValid(term: string): boolean {
  try {
    new RegExp(term);
    return true;
  } catch {
    return false;
  }
}

/** True iff every non-empty term in `query` is a valid
 *  regex. Empty input counts as valid (no filter). */
export function isValidQuery(query: string): boolean {
  const terms = splitTerms(query);
  return terms.every(termIsValid);
}

/** Return true if `value` matches the filter. Each
 *  comma-separated term is a case-insensitive regex; the
 *  value matches if ANY term matches. Invalid terms are
 *  ignored (treated as matching) so the user still sees
 *  all rows while typing a partial regex. */
export function matchesFilter(
  value: string,
  query: string,
): boolean {
  const terms = splitTerms(query);
  if (terms.length === 0) return true;
  const str = value ?? "";
  return terms.some((term) => {
    try {
      return new RegExp(term, "i").test(str);
    } catch {
      return true;
    }
  });
}

/** Return true if any of `values` matches the filter.
 *  Nullish values are treated as empty strings. */
export function matchesAny(
  values: (string | null | undefined)[],
  query: string,
): boolean {
  if (splitTerms(query).length === 0) return true;
  return values.some((v) => matchesFilter(v ?? "", query));
}
