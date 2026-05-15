/**
 * Parse the KB sidebar filter input into structured
 * tokens. The bare text is filename / path substring
 * matching as before; ``key:value`` tokens scope the
 * filter to a specific frontmatter attribute.
 *
 * Supported keys:
 *   - ``customer:<name>`` -- exact match on file.customer
 *   - ``task:<id>``       -- exact match on file.task_id
 *   - ``type:<value>``    -- exact match on file.type
 *   - ``tag:<name>``      -- file.tags must include name
 *
 * Multiple tokens of the same key act as an AND list
 * (e.g. ``tag:wip tag:research``). Values may be quoted
 * with double quotes to allow spaces.
 */
export interface ParsedFilter {
  free: string;
  customer: string | null;
  taskId: string | null;
  type: string | null;
  tags: string[];
}

const KEYS = new Set([
  "customer", "task", "type", "tag",
]);

export function parseFilter(input: string): ParsedFilter {
  const tokens = tokenize(input);
  const parsed: ParsedFilter = {
    free: "",
    customer: null,
    taskId: null,
    type: null,
    tags: [],
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
  }
  parsed.free = freeParts.join(" ").trim();
  return parsed;
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
