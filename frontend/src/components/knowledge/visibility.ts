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

/** Apply filename + tag filters to the tree.
 *
 * Files match when they pass both filters; tag filters
 * use AND semantics (the file's tag set must be a
 * superset of the active filter set). Folders are kept
 * when at least one descendant still matches, so the
 * tree stays navigable.
 */
export function filterTree(
  files: KnowledgeFile[],
  query: string,
  activeTags: ReadonlySet<string>,
): KnowledgeFile[] {
  const q = query.trim().toLowerCase();
  const hasNameFilter = q.length > 0;
  const hasTagFilter = activeTags.size > 0;
  if (!hasNameFilter && !hasTagFilter) return files;

  const matchingPaths = new Set(
    files
      .filter((f) =>
        f.kind === "file"
        && _matchesFilename(f, q, hasNameFilter)
        && _matchesTags(f, activeTags, hasTagFilter),
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


function _matchesFilename(
  file: KnowledgeFile,
  q: string,
  enabled: boolean,
): boolean {
  if (!enabled) return true;
  return (
    file.path.toLowerCase().includes(q)
    || file.name.toLowerCase().includes(q)
  );
}


function _matchesTags(
  file: KnowledgeFile,
  active: ReadonlySet<string>,
  enabled: boolean,
): boolean {
  if (!enabled) return true;
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
