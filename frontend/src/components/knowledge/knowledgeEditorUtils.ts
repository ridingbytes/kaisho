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
  | "md" | "org" | "rst" | "txt" | "pdf" | "code";

/**
 * Map from file extension (with leading dot) to a
 * highlight.js language id. Extensions not listed here
 * fall through to ``txt`` so the file still opens, just
 * without syntax colours.
 */
const CODE_LANGUAGES: Record<string, string> = {
  ".sh": "bash", ".bash": "bash", ".zsh": "bash",
  ".fish": "bash", ".ps1": "powershell",
  ".py": "python", ".pyx": "python",
  ".js": "javascript", ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript",
  ".html": "xml", ".htm": "xml", ".xml": "xml",
  ".css": "css", ".scss": "scss",
  ".json": "json", ".jsonc": "json",
  ".yaml": "yaml", ".yml": "yaml",
  ".toml": "ini", ".ini": "ini", ".cfg": "ini",
  ".conf": "ini", ".env": "bash",
  ".go": "go", ".rs": "rust",
  ".java": "java", ".kt": "kotlin",
  ".c": "c", ".h": "c",
  ".cpp": "cpp", ".hpp": "cpp", ".cc": "cpp", ".hh": "cpp",
  ".cs": "csharp", ".swift": "swift",
  ".rb": "ruby", ".php": "php", ".pl": "perl",
  ".lua": "lua", ".r": "r",
  ".lisp": "lisp", ".clj": "clojure",
  ".el": "lisp", ".scm": "scheme",
  ".sql": "sql",
  ".tex": "latex", ".bib": "bibtex",
  ".dockerfile": "dockerfile",
  ".mk": "makefile",
  ".csv": "plaintext", ".tsv": "plaintext",
  ".log": "plaintext",
};

/** Filenames (no extension) mapped to a hljs language. */
const FILENAME_LANGUAGES: Record<string, string> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile",
};

function getExt(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i).toLowerCase();
}

function getBasename(path: string): string {
  const i = Math.max(
    path.lastIndexOf("/"), path.lastIndexOf("\\"),
  );
  return i < 0 ? path : path.slice(i + 1);
}

/**
 * Map common ``#!`` shebang interpreters to a hljs id.
 * Lets us detect extensionless scripts (``run``,
 * ``install``, etc.) as ``code`` and render them with
 * proper highlighting.
 */
const SHEBANG_LANGUAGES: Record<string, string> = {
  bash: "bash", sh: "bash", zsh: "bash", dash: "bash",
  ksh: "bash", fish: "bash",
  python: "python", python2: "python", python3: "python",
  node: "javascript", deno: "javascript",
  ruby: "ruby", perl: "perl", lua: "lua",
  Rscript: "r", php: "php",
  pwsh: "powershell", powershell: "powershell",
  tclsh: "tcl",
};

function detectShebangLanguage(
  content: string,
): string | null {
  if (!content.startsWith("#!")) return null;
  const firstLine = content.split("\n", 1)[0];
  // Match the last word on the shebang line, ignoring
  // ``env`` indirection and any flags. Examples:
  //   #!/bin/bash             -> bash
  //   #!/usr/bin/env python3  -> python3
  //   #!/usr/bin/env -S node  -> node
  const tokens = firstLine
    .replace(/^#!/, "")
    .trim()
    .split(/\s+/)
    .filter((tok) => !tok.startsWith("-"));
  for (let i = tokens.length - 1; i >= 0; i--) {
    const interp = tokens[i].split("/").pop() ?? "";
    if (interp === "env") continue;
    const lang = SHEBANG_LANGUAGES[interp];
    if (lang) return lang;
  }
  return null;
}

/** Detect the markup type from a file path extension.
 *
 * :param content: Optional file body. When given, lets us
 *     classify extensionless scripts via ``#!`` shebangs.
 */
export function detectFileType(
  path: string, content?: string,
): FileType {
  if (path.endsWith(".pdf")) return "pdf";
  if (path.endsWith(".org")) return "org";
  if (path.endsWith(".rst")) return "rst";
  if (path.endsWith(".md")) return "md";
  if (
    FILENAME_LANGUAGES[getBasename(path)] !== undefined
    || CODE_LANGUAGES[getExt(path)] !== undefined
  ) {
    return "code";
  }
  if (content && detectShebangLanguage(content)) {
    return "code";
  }
  return "txt";
}

/**
 * Return the highlight.js language id for a code file,
 * or ``null`` when no mapping is known.
 *
 * :param content: Optional file body, used to recover a
 *     language from a ``#!`` shebang when the path alone
 *     is ambiguous.
 */
export function detectCodeLanguage(
  path: string, content?: string,
): string | null {
  const byName = FILENAME_LANGUAGES[getBasename(path)];
  if (byName) return byName;
  const byExt = CODE_LANGUAGES[getExt(path)];
  if (byExt) return byExt;
  if (content) return detectShebangLanguage(content);
  return null;
}

export const FILE_TYPE_COLORS: Record<FileType, string> = {
  md: "bg-blue-900/40 text-blue-300",
  org: "bg-emerald-900/40 text-emerald-300",
  rst: "bg-amber-900/40 text-amber-300",
  txt: "bg-stone-700/40 text-stone-700",
  pdf: "bg-red-900/40 text-red-300",
  code: "bg-violet-900/40 text-violet-300",
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
