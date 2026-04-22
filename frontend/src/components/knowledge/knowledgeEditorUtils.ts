/**
 * @module knowledgeEditorUtils
 *
 * Shared constants and helpers for the knowledge editor:
 * file-type detection, syntax toolbar actions, CSS class
 * constants, and localStorage persistence helpers.
 */

import {
  profileGet,
  profileSet,
} from "../../utils/profileStorage";

// -----------------------------------------------------------------
// Shared CSS class for form inputs
// -----------------------------------------------------------------

export const inputCls =
  "bg-surface-raised border border-border rounded " +
  "px-2 py-1 text-sm text-stone-900 placeholder-stone-500 " +
  "focus:outline-none focus:border-cta";

// -----------------------------------------------------------------
// File type helpers
// -----------------------------------------------------------------

export type FileType =
  | "md" | "org" | "rst" | "txt" | "pdf";

/** Detect the markup type from a file path extension. */
export function detectFileType(path: string): FileType {
  if (path.endsWith(".pdf")) return "pdf";
  if (path.endsWith(".org")) return "org";
  if (path.endsWith(".rst")) return "rst";
  if (path.endsWith(".md")) return "md";
  return "txt";
}

export const FILE_TYPE_COLORS: Record<FileType, string> = {
  md: "bg-blue-900/40 text-blue-300",
  org: "bg-emerald-900/40 text-emerald-300",
  rst: "bg-amber-900/40 text-amber-300",
  txt: "bg-stone-700/40 text-stone-700",
  pdf: "bg-red-900/40 text-red-300",
};

// -----------------------------------------------------------------
// Syntax toolbar definitions
// -----------------------------------------------------------------

export interface SyntaxAction {
  label: string;
  title: string;
  wrap: [string, string];
}

const MD_ACTIONS: SyntaxAction[] = [
  { label: "B", title: "Bold", wrap: ["**", "**"] },
  { label: "I", title: "Italic", wrap: ["*", "*"] },
  { label: "#", title: "Heading", wrap: ["# ", ""] },
  { label: "[]", title: "Link", wrap: ["[", "]()"] },
  { label: "`", title: "Code", wrap: ["`", "`"] },
];

const ORG_ACTIONS: SyntaxAction[] = [
  { label: "B", title: "Bold", wrap: ["*", "*"] },
  { label: "I", title: "Italic", wrap: ["/", "/"] },
  { label: "*", title: "Heading", wrap: ["* ", ""] },
  { label: "[[]]", title: "Link", wrap: ["[[", "]]"] },
  { label: "~", title: "Code", wrap: ["~", "~"] },
];

/** Return the syntax actions available for a file type. */
export function actionsForType(
  ft: FileType
): SyntaxAction[] {
  if (ft === "md") return MD_ACTIONS;
  if (ft === "org") return ORG_ACTIONS;
  return [];
}

/**
 * Apply a syntax wrap action around the current selection
 * in a textarea, updating content via the setter.
 */
export function applySyntax(
  textarea: HTMLTextAreaElement,
  action: SyntaxAction,
  content: string,
  setContent: (v: string) => void
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = content.slice(start, end);
  const [pre, post] = action.wrap;
  const replacement =
    pre + (selected || action.title) + post;
  const next =
    content.slice(0, start) +
    replacement +
    content.slice(end);
  setContent(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursorPos =
      start +
      pre.length +
      (selected ? selected.length : action.title.length);
    textarea.setSelectionRange(cursorPos, cursorPos);
  });
}

// -----------------------------------------------------------------
// localStorage helpers
// -----------------------------------------------------------------

const LS_WIDTH = "kb_sidebar_width";
const LS_OPEN = "kb_sidebar_open";
const LS_COLLAPSED = "kb_collapsed_labels";
const DEFAULT_WIDTH = 220;
export const MIN_WIDTH = 140;
export const MAX_WIDTH = 400;

/** Read persisted sidebar width from localStorage. */
export function readStoredWidth(): number {
  const raw = localStorage.getItem(LS_WIDTH);
  if (!raw) return DEFAULT_WIDTH;
  const n = parseInt(raw, 10);
  return isNaN(n)
    ? DEFAULT_WIDTH
    : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

/** Read persisted sidebar open state from localStorage. */
export function readStoredOpen(): boolean {
  const raw = localStorage.getItem(LS_OPEN);
  return raw === null ? true : raw === "true";
}

/** Read persisted collapsed labels from localStorage. */
export function readCollapsedLabels(): Set<string> {
  const raw = profileGet(LS_COLLAPSED);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/** Persist sidebar open state. */
export function storeOpen(open: boolean) {
  localStorage.setItem(LS_OPEN, String(open));
}

/** Persist sidebar width. */
export function storeWidth(width: number) {
  localStorage.setItem(LS_WIDTH, String(width));
}

/** Persist collapsed label set. */
export function storeCollapsedLabels(
  labels: Set<string>
) {
  profileSet(
    LS_COLLAPSED,
    JSON.stringify([...labels])
  );
}
