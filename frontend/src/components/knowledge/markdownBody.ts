/**
 * Strip a YAML frontmatter block off a markdown string.
 *
 * Used by the KB read view so the body renders cleanly
 * once the FrontmatterCard takes over the metadata. Mirrors
 * the parser in ``kaisho/services/kb_frontmatter.py`` --
 * keep them aligned if either side changes.
 */
const DELIM = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(\n|$)/;

export function stripFrontmatter(text: string): string {
  const match = text.match(DELIM);
  if (!match) return text;
  return text.slice(match[0].length).replace(/^\n+/, "");
}
