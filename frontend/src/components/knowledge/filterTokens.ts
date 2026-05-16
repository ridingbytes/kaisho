/**
 * Parse a unified filter input into structured tokens.
 *
 * Free text remains free text (used by callers for
 * content-search or filename narrowing, depending on
 * the panel); ``key:value`` tokens scope by metadata.
 *
 * Supported keys:
 *   - ``customer:<name>`` -- exact match on customer
 *   - ``task:<id>``       -- exact match on task_id
 *   - ``type:<value>``    -- exact match on type
 *   - ``tag:<name>``      -- tag list must include name
 *   - ``filename:<glob>`` -- filename/path substring
 *     (case-insensitive)
 *
 * Multiple tokens of the same key AND together
 * (e.g. ``tag:wip tag:research``). Values may be quoted
 * with double quotes to allow spaces.
 */
export interface ParsedFilter {
  free: string;
  customer: string | null;
  taskId: string | null;
  type: string | null;
  tags: string[];
  filename: string | null;
}

/** Scoped key kinds, in canonical order. */
export const SCOPED_KEYS = [
  "customer", "task", "type", "tag", "filename",
] as const;
export type ScopedKey = typeof SCOPED_KEYS[number];

const KEYS = new Set<string>(SCOPED_KEYS);

/** A scoped token committed as a chip in the input. */
export interface Chip {
  key: ScopedKey;
  value: string;
}

export function parseFilter(input: string): ParsedFilter {
  const tokens = tokenize(input);
  const parsed: ParsedFilter = {
    free: "",
    customer: null,
    taskId: null,
    type: null,
    tags: [],
    filename: null,
  };
  const freeParts: string[] = [];
  for (const tok of tokens) {
    const colon = tok.indexOf(":");
    if (colon <= 0) {
      freeParts.push(tok);
      continue;
    }
    const key = tok.slice(0, colon).toLowerCase();
    const value = tok.slice(colon + 1);
    if (!KEYS.has(key) || !value) {
      freeParts.push(tok);
      continue;
    }
    if (key === "customer") parsed.customer = value;
    else if (key === "task") parsed.taskId = value;
    else if (key === "type") parsed.type = value;
    else if (key === "tag") parsed.tags.push(value);
    else if (key === "filename") parsed.filename = value;
  }
  parsed.free = freeParts.join(" ").trim();
  return parsed;
}

/** Serialize a chip back to canonical text, auto-quoting
 *  values that contain whitespace. */
export function chipToRaw(chip: Chip): string {
  const needsQuote = /\s/.test(chip.value);
  const v = needsQuote ? `"${chip.value}"` : chip.value;
  return `${chip.key}:${v}`;
}

/** Split a canonical filter string into chips
 *  (completed scoped tokens) and the trailing free text
 *  the user is still editing. A token is "live" only when
 *  it appears at the very end of the string with no
 *  trailing whitespace -- it stays in ``free`` so the
 *  user can keep typing without it eagerly chipping. */
export function splitChipsAndFree(
  value: string,
): { chips: Chip[]; free: string } {
  const tokens = tokenize(value);
  const endsWithSpace = endsCommitted(value);
  const liveIndex = endsWithSpace
    ? -1
    : tokens.length - 1;
  const chips: Chip[] = [];
  const freeWords: string[] = [];
  tokens.forEach((tok, i) => {
    const chip = i === liveIndex ? null : toChip(tok);
    if (chip) {
      chips.push(chip);
    } else {
      freeWords.push(tok);
    }
  });
  let free = freeWords.join(" ");
  if (endsWithSpace && freeWords.length > 0) free += " ";
  return { chips, free };
}

function toChip(tok: string): Chip | null {
  const colon = tok.indexOf(":");
  if (colon <= 0) return null;
  const key = tok.slice(0, colon).toLowerCase();
  const value = tok.slice(colon + 1);
  if (!KEYS.has(key) || !value) return null;
  return { key: key as ScopedKey, value };
}

/** True when the last meaningful character is unquoted
 *  whitespace (so the previous token is "committed"). */
function endsCommitted(value: string): boolean {
  let inQuote = false;
  let trailingSpace = false;
  for (const ch of value) {
    if (ch === "\"") inQuote = !inQuote;
    if (ch === " " && !inQuote) trailingSpace = true;
    else trailingSpace = false;
  }
  return trailingSpace;
}

/** Scoped key the caret is currently inside, plus the
 *  partial value typed so far and the range to replace
 *  on selection. Returns ``null`` when the caret is in a
 *  free-text token. */
export interface CaretToken {
  kind: ScopedKey;
  partial: string;
  /** [start, end) byte offsets in the original input
   *  covering the value portion only (not the
   *  ``key:`` prefix). End === caret unless followed
   *  by more value chars in the same token. */
  range: [number, number];
}

/** Inspect ``input`` at ``caret`` and return the scoped
 *  token the caret is inside, or ``null`` when it's in a
 *  free-text token or before the colon. */
export function tokenAtCaret(
  input: string, caret: number,
): CaretToken | null {
  const before = input.slice(0, caret);
  // Find the start of the current token: walk back to
  // the previous unquoted whitespace. Respects double
  // quotes so ``customer:"Acme Corp"`` stays one token.
  let i = before.length;
  let inQuote = false;
  while (i > 0) {
    const ch = before[i - 1];
    if (ch === "\"") inQuote = !inQuote;
    else if (ch === " " && !inQuote) break;
    i--;
  }
  const tokenStart = i;
  const tokenPrefix = before.slice(tokenStart);
  const colon = tokenPrefix.indexOf(":");
  if (colon <= 0) return null;
  const keyRaw = tokenPrefix.slice(0, colon).toLowerCase();
  if (!isScopedKey(keyRaw)) return null;
  let partial = tokenPrefix.slice(colon + 1);
  // Strip wrapping quote if user opened one.
  if (partial.startsWith("\"")) partial = partial.slice(1);
  const valueStart = tokenStart + colon + 1
    + (tokenPrefix[colon + 1] === "\"" ? 1 : 0);
  // The value extends to the end of the unquoted token
  // (the rest of ``input``) so selection replaces any
  // trailing typed chars too.
  let end = caret;
  let afterInQuote = tokenPrefix[colon + 1] === "\"";
  for (let j = caret; j < input.length; j++) {
    const ch = input[j];
    if (ch === "\"") {
      afterInQuote = !afterInQuote;
      if (!afterInQuote) {
        end = j + 1;
        break;
      }
    } else if (ch === " " && !afterInQuote) {
      end = j;
      break;
    }
    end = j + 1;
  }
  return {
    kind: keyRaw as CaretToken["kind"],
    partial,
    range: [valueStart, end],
  };
}

function isScopedKey(key: string): key is ScopedKey {
  return (SCOPED_KEYS as readonly string[]).includes(key);
}

/** Replace the value portion at ``range`` with ``value``,
 *  auto-quoting if the value contains a space. Returns
 *  the new input and the caret position to place after
 *  the inserted value (after a trailing space). */
export function applyTokenValue(
  input: string,
  range: [number, number],
  value: string,
): { value: string; caret: number } {
  const needsQuote = /\s/.test(value);
  const insert = needsQuote ? `"${value}"` : value;
  // If the original range opened a quote, range[0] is
  // already past it. Strip a wrapping closing quote
  // immediately after range[1].
  let trailingCut = range[1];
  if (input[trailingCut] === "\"") trailingCut += 1;
  const before = input.slice(0, range[0]);
  const after = input.slice(trailingCut);
  // If we needed to insert quotes, also drop the
  // opening quote left in ``before``.
  let beforeFixed = before;
  if (
    needsQuote
    && before.endsWith("\"")
    && !before.endsWith("\\\"")
  ) {
    beforeFixed = before.slice(0, -1);
  }
  const trailingSpace = after.startsWith(" ") ? "" : " ";
  const next = beforeFixed + insert + trailingSpace + after;
  const caret =
    beforeFixed.length + insert.length + trailingSpace.length;
  return { value: next, caret };
}


function tokenize(input: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuote = false;
  for (const ch of input) {
    if (ch === "\"") {
      inQuote = !inQuote;
      continue;
    }
    if (ch === " " && !inQuote) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}
