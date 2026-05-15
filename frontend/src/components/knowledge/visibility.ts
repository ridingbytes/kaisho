/**
 * Hidden-file rules for the KB sidebar.
 *
 * Hidden when:
 *   - any path segment starts with ``.`` -- dotfiles AND
 *     dot-folders (``.obsidian``, ``.git``, ``.trash``,
 *     etc.) so a hidden tool dir does not surface its
 *     children either.
 *   - the basename starts with ``_`` (drafts / pinned
 *     to-back conventions).
 *   - the file's YAML frontmatter ``status`` is
 *     ``archived``.
 */
import type { KnowledgeFile } from "../../types";
import { parseFilter, type ParsedFilter } from "./filterTokens";

/** ``status: archived`` in frontmatter hides a file unless
 * the user toggles "show hidden". Centralized here so the
 * sentinel string isn't sprinkled through the codebase. */
export const ARCHIVED_STATUS = "archived";

export function isHidden(file: KnowledgeFile): boolean {
  const segments = file.path.split("/");
  const basename = segments[segments.length - 1] ?? "";
  // Any dot-prefixed segment hides the entry: catches
  // dotfiles AND tool dirs like ``.obsidian/foo.md``.
  if (segments.some((s) => s.startsWith("."))) return true;
  if (basename.startsWith("_")) return true;
  if (file.status === ARCHIVED_STATUS) return true;
  return false;
}

export function filterVisibleFiles(
  files: KnowledgeFile[], showHidden: boolean,
): KnowledgeFile[] {
  if (showHidden) return files;
  return files.filter((f) => !isHidden(f));
}

/** Apply filename + tag + scoped-token filters to the
 *  tree.
 *
 * ``query`` is parsed for ``key:value`` tokens
 * (``customer:`` / ``task:`` / ``type:`` / ``tag:``);
 * the remaining free text is filename / path substring
 * matched. ``activeTags`` (from the chip row) is unioned
 * with any ``tag:`` tokens parsed from the query, all
 * combined with AND semantics. Folders are kept when at
 * least one descendant still matches so the tree stays
 * navigable.
 */
export function filterTree(
  files: KnowledgeFile[],
  query: string,
  activeTags: ReadonlySet<string>,
): KnowledgeFile[] {
  const parsed = parseFilter(query);
  const tags = new Set<string>(activeTags);
  for (const t of parsed.tags) tags.add(t);
  const anyFilter =
    parsed.free.length > 0
    || parsed.customer !== null
    || parsed.taskId !== null
    || parsed.type !== null
    || tags.size > 0;
  if (!anyFilter) return files;

  const free = parsed.free.toLowerCase();
  const matchingPaths = new Set(
    files
      .filter((f) =>
        f.kind === "file"
        && _matchesFree(f, free)
        && _matchesScoped(f, parsed)
        && _matchesTags(f, tags),
      )
      .map((f) => f.path),
  );
  return files.filter((f) => {
    if (f.kind === "file") {
      return matchingPaths.has(f.path);
    }
    return [...matchingPaths].some((p) =>
      p.startsWith(`${f.path}/`),
    );
  });
}


function _matchesFree(
  file: KnowledgeFile, q: string,
): boolean {
  if (!q) return true;
  return (
    file.path.toLowerCase().includes(q)
    || file.name.toLowerCase().includes(q)
  );
}


function _matchesScoped(
  file: KnowledgeFile, parsed: ParsedFilter,
): boolean {
  if (parsed.customer !== null
    && (file.customer ?? "").toLowerCase()
       !== parsed.customer.toLowerCase()) {
    return false;
  }
  if (parsed.taskId !== null
    && (file.task_id ?? "") !== parsed.taskId) {
    return false;
  }
  if (parsed.type !== null
    && (file.type ?? "").toLowerCase()
       !== parsed.type.toLowerCase()) {
    return false;
  }
  return true;
}


function _matchesTags(
  file: KnowledgeFile,
  active: ReadonlySet<string>,
): boolean {
  if (active.size === 0) return true;
  const tags = new Set(file.tags ?? []);
  for (const tag of active) {
    if (!tags.has(tag)) return false;
  }
  return true;
}


/** Backwards-compat alias kept for the test suite and
 *  callers that only filter by filename. */
export function filterByFilename(
  files: KnowledgeFile[], query: string,
): KnowledgeFile[] {
  return filterTree(files, query, new Set());
}
