/** A single version entry from CHANGELOG.md. */
export interface ChangelogEntry {
  version: string;
  items: string[];
}

/** Parse CHANGELOG.md into structured entries.
 *
 * Bullets that wrap onto indented continuation lines
 * (commonly produced by editors that respect an 80-col
 * limit) are merged back into a single string per item
 * so the UI shows the full sentence instead of a
 * truncated head.
 */
export function parseChangelog(
  raw: string,
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;

  for (const line of raw.split("\n")) {
    const versionMatch = line.match(/^## (.+)/);
    if (versionMatch) {
      current = {
        version: versionMatch[1].trim(),
        items: [],
      };
      entries.push(current);
      continue;
    }
    if (!current) continue;

    const itemMatch = line.match(/^- (.+)/);
    if (itemMatch) {
      current.items.push(itemMatch[1].trim());
      continue;
    }

    // Indented continuation of the previous bullet.
    // Treat any leading-whitespace non-empty line as a
    // wrap of the prior item rather than a new entry.
    const continuation = line.match(/^\s+(\S.*)$/);
    if (continuation && current.items.length > 0) {
      const last = current.items.length - 1;
      current.items[last] = (
        current.items[last] + " " + continuation[1].trim()
      );
    }
  }

  return entries;
}
