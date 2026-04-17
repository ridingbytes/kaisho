/** A single version entry from CHANGELOG.md. */
export interface ChangelogEntry {
  version: string;
  items: string[];
}

/** Parse CHANGELOG.md into structured entries. */
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
    }
  }

  return entries;
}
