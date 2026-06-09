/** A single version entry from CHANGELOG.md. */
export interface ChangelogEntry {
  version: string;
  items: string[];
}

/** Convert RST-style double backticks to Markdown single
 * backticks. The CHANGELOG was authored in RST style
 * (``foo``) but the renderer is Markdown — without this
 * normalization every code span shows up as literal
 * backtick-wrapped text. Applied at parse time so all
 * past and future entries render consistently.
 */
function rstToMarkdownInlineCode(s: string): string {
  return s.replace(/``([^`]+)``/g, "`$1`");
}

/** Parse CHANGELOG.md into structured entries.
 *
 * Supported shapes per ``## VERSION`` section, mixed in
 * the same release:
 *
 *   - leading prose paragraph(s) directly under the
 *     version heading become the first item
 *   - each ``### Subheading`` starts a new item; the
 *     heading becomes a bold prefix and prose paragraphs
 *     below it accumulate as the item's body
 *   - ``- bullet`` lines and their indented continuation
 *     wraps are preserved inline so the renderer treats
 *     them as a nested list inside the item
 *
 * Output items are Markdown strings; the dialog passes
 * each one to the Markdown component which handles
 * paragraphs, inline code, and nested bullets.
 *
 * Why this matters: the previous parser only picked up
 * top-level ``- bullets``. Modern essay-style entries
 * (paragraphs + ``###`` sub-headings) produced an empty
 * ``items: []`` and the What's New dialog rendered
 * blank — exactly what happened on 2.2.3.
 */
export function parseChangelog(
  raw: string,
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let buffer: string | null = null;

  function flush(): void {
    if (buffer === null || !current) {
      buffer = null;
      return;
    }
    const cleaned = buffer
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (cleaned) {
      current.items.push(
        rstToMarkdownInlineCode(cleaned),
      );
    }
    buffer = null;
  }

  for (const line of raw.split("\n")) {
    const versionMatch = line.match(/^## (.+)/);
    if (versionMatch) {
      flush();
      const version = versionMatch[1].trim();
      // ``Unreleased`` is a staging area in CHANGELOG.md
      // for entries waiting on the next bump-version run;
      // it must not surface in the What's New dialog (it
      // would show up as "What's New Unreleased" and steal
      // the slot the real latest release should occupy).
      if (/^unreleased$/i.test(version)) {
        current = null;
        continue;
      }
      current = { version, items: [] };
      entries.push(current);
      continue;
    }
    if (!current) continue;

    const subMatch = line.match(/^### (.+)/);
    if (subMatch) {
      flush();
      buffer = `**${subMatch[1].trim()}**`;
      continue;
    }

    // A top-level ``- `` line starts a new item. The
    // leading dash is dropped because the dialog renders
    // its own bullet glyph in the outer ``<li>``; passing
    // ``- text`` through to the Markdown component would
    // produce a second nested bullet ("• •"). Indented
    // continuation lines (``  more text``) are folded
    // into the current item by the catch-all below.
    if (/^- /.test(line)) {
      flush();
      buffer = line.replace(/^- /, "");
      continue;
    }

    if (buffer === null) {
      // Hold blank lines until real content appears so
      // the first item doesn't start with a blank line.
      if (line.trim().length === 0) continue;
      buffer = line;
    } else {
      buffer += "\n" + line;
    }
  }

  flush();
  return entries;
}
