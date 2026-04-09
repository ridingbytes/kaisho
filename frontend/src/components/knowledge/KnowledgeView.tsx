import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { useEffect, useRef, useState } from "react";
import {
  useDeleteKnowledgeFile,
  useKnowledgeFile,
  useKnowledgeSearch,
  useKnowledgeTree,
  useMoveKnowledgeFile,
  useRenameKnowledgeFile,
  useSaveKnowledgeFile,
} from "../../hooks/useKnowledge";
import { HelpButton } from "../common/HelpButton";
import { Markdown } from "../common/Markdown";
import { DOCS } from "../../docs/panelDocs";
import type { KnowledgeFile } from "../../types";

const inputCls =
  "bg-surface-raised border border-border rounded px-2 py-1 text-sm " +
  "text-stone-900 placeholder-stone-500 focus:outline-none focus:border-cta";

// ---------------------------------------------------------------------------
// Tree data structures
// ---------------------------------------------------------------------------

interface TreeFolder {
  kind: "folder";
  name: string;
  label: string;
  path: string;
  children: TreeNode[];
  expanded: boolean;
}

interface TreeLeaf {
  kind: "leaf";
  name: string;
  label: string;
  path: string;
}

type TreeNode = TreeFolder | TreeLeaf;

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

function insertIntoFolder(
  nodes: TreeNode[],
  segments: string[],
  file: KnowledgeFile
): void {
  if (segments.length === 1) {
    nodes.push({
      kind: "leaf",
      name: segments[0].replace(/\.md$/, ""),
      label: file.label,
      path: file.path,
    });
    return;
  }

  const folderName = segments[0];
  const existing = nodes.find(
    (n): n is TreeFolder =>
      n.kind === "folder" && n.name === folderName
  );

  if (existing) {
    insertIntoFolder(existing.children, segments.slice(1), file);
    return;
  }

  const folder: TreeFolder = {
    kind: "folder",
    name: folderName,
    label: file.label,
    path: segments[0],
    children: [],
    expanded: false,
  };
  insertIntoFolder(folder.children, segments.slice(1), file);
  nodes.push(folder);
}

function buildLabelNodes(
  files: KnowledgeFile[],
  label: string
): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const file of files) {
    if (file.label !== label) continue;
    const segments = file.path.split("/").filter(Boolean);
    insertIntoFolder(nodes, segments, file);
  }
  return nodes;
}

function buildTree(
  files: KnowledgeFile[]
): Record<string, TreeNode[]> {
  const labels = Array.from(new Set(files.map((f) => f.label))).sort();
  const result: Record<string, TreeNode[]> = {};
  for (const label of labels) {
    result[label] = buildLabelNodes(files, label);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Expand folders that contain matching paths
// ---------------------------------------------------------------------------

function expandMatchingFolders(
  nodes: TreeNode[],
  matchingPaths: Set<string>
): TreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "leaf") return node;
    const leafPaths = collectLeafPaths(node);
    const hasMatch = leafPaths.some((p) => matchingPaths.has(p));
    return {
      ...node,
      expanded: hasMatch ? true : node.expanded,
      children: expandMatchingFolders(node.children, matchingPaths),
    };
  });
}

function collectLeafPaths(node: TreeNode): string[] {
  if (node.kind === "leaf") return [node.path];
  return node.children.flatMap(collectLeafPaths);
}

// ---------------------------------------------------------------------------
// Toggle a folder node by path within a tree
// ---------------------------------------------------------------------------

function toggleFolder(nodes: TreeNode[], targetPath: string): TreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "leaf") return node;
    if (node.path === targetPath) {
      return { ...node, expanded: !node.expanded };
    }
    return {
      ...node,
      children: toggleFolder(node.children, targetPath),
    };
  });
}

// ---------------------------------------------------------------------------
// File type helpers
// ---------------------------------------------------------------------------

type FileType = "md" | "org" | "rst" | "txt";

function detectFileType(path: string): FileType {
  if (path.endsWith(".org")) return "org";
  if (path.endsWith(".rst")) return "rst";
  if (path.endsWith(".md")) return "md";
  return "txt";
}

const FILE_TYPE_COLORS: Record<FileType, string> = {
  md: "bg-blue-900/40 text-blue-300",
  org: "bg-emerald-900/40 text-emerald-300",
  rst: "bg-amber-900/40 text-amber-300",
  txt: "bg-stone-700/40 text-stone-700",
};

// ---------------------------------------------------------------------------
// Syntax toolbar definitions
// ---------------------------------------------------------------------------

interface SyntaxAction {
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

function actionsForType(ft: FileType): SyntaxAction[] {
  if (ft === "md") return MD_ACTIONS;
  if (ft === "org") return ORG_ACTIONS;
  return [];
}

function applySyntax(
  textarea: HTMLTextAreaElement,
  action: SyntaxAction,
  content: string,
  setContent: (v: string) => void,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = content.slice(start, end);
  const [pre, post] = action.wrap;
  const replacement = pre + (selected || action.title) + post;
  const next =
    content.slice(0, start) + replacement + content.slice(end);
  setContent(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursorPos = start + pre.length
      + (selected ? selected.length : action.title.length);
    textarea.setSelectionRange(cursorPos, cursorPos);
  });
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const LS_WIDTH = "kb_sidebar_width";
const LS_OPEN = "kb_sidebar_open";
const LS_COLLAPSED = "kb_collapsed_labels";
const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 140;
const MAX_WIDTH = 400;

function readStoredWidth(): number {
  const raw = localStorage.getItem(LS_WIDTH);
  if (!raw) return DEFAULT_WIDTH;
  const n = parseInt(raw, 10);
  return isNaN(n) ? DEFAULT_WIDTH : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

function readStoredOpen(): boolean {
  const raw = localStorage.getItem(LS_OPEN);
  return raw === null ? true : raw === "true";
}

function readCollapsedLabels(): Set<string> {
  const raw = localStorage.getItem(LS_COLLAPSED);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// New-file form
// ---------------------------------------------------------------------------

interface NewFileFormProps {
  onCreated: (file: KnowledgeFile) => void;
  onClose: () => void;
}

function NewFileForm({ onCreated, onClose }: NewFileFormProps) {
  const [label, setLabel] = useState<"wissen" | "research">("wissen");
  const [path, setPath] = useState("");
  const save = useSaveKnowledgeFile();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const p = path.trim().replace(/^\/+/, "");
    if (!p) return;
    const rel = p.endsWith(".md") ? p : `${p}.md`;
    save.mutate(
      {
        label,
        path: rel,
        content: `# ${rel.split("/").pop()?.replace(/\.md$/, "") ?? ""}\n`,
      },
      {
        onSuccess: (file) => {
          onCreated(file);
          onClose();
        },
      }
    );
  }

  return (
    <form
      onSubmit={handleCreate}
      className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-border-subtle bg-surface-card/60 shrink-0"
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          Library
        </label>
        <select
          className={`${inputCls} w-28`}
          value={label}
          onChange={(e) =>
            setLabel(e.target.value as "wissen" | "research")
          }
        >
          <option value="wissen">wissen</option>
          <option value="research">research</option>
        </select>
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-40">
        <label className="text-[10px] text-stone-600 uppercase tracking-wider">
          Path *
        </label>
        <input
          autoFocus
          className={inputCls}
          placeholder="subfolder/article-name.md"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
      </div>
      <div className="flex gap-2 pb-0.5">
        <button
          type="submit"
          disabled={save.isPending || !path.trim()}
          className="px-3 py-1.5 rounded bg-cta text-white text-xs font-semibold disabled:opacity-40"
        >
          Create
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded bg-surface-raised text-stone-700 text-xs"
        >
          Cancel
        </button>
      </div>
      {save.isError && (
        <p className="w-full text-xs text-red-400">
          {(save.error as Error).message}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Editor panel
// ---------------------------------------------------------------------------

interface EditorPanelProps {
  file: KnowledgeFile;
  initialContent: string;
  onSaved: () => void;
  onClose: () => void;
  onDeleted: () => void;
}

function EditorPanel({
  file,
  initialContent,
  onSaved,
  onClose,
  onDeleted,
}: EditorPanelProps) {
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const save = useSaveKnowledgeFile();
  const remove = useDeleteKnowledgeFile();

  useEffect(() => {
    if (!preview) textareaRef.current?.focus();
  }, [preview]);

  function handleSave() {
    save.mutate(
      { label: file.label, path: file.path, content },
      { onSuccess: onSaved }
    );
  }

  function handleDelete() {
    remove.mutate(file.path, { onSuccess: onDeleted });
  }

  const dirty = content !== initialContent;
  const fileType = detectFileType(file.path);
  const syntaxActions = actionsForType(fileType);

  return (
    <div className="flex flex-col h-full">
      {/* Editor toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle shrink-0">
        <span className="text-xs text-stone-600 font-mono truncate">
          {file.label}/{file.path}
        </span>
        <span
          className={[
            "shrink-0 px-1.5 py-0.5 rounded text-[10px]",
            "font-semibold uppercase tracking-wider",
            FILE_TYPE_COLORS[fileType],
          ].join(" ")}
        >
          {fileType}
        </span>
        {dirty && (
          <span className="text-[10px] text-amber-500 shrink-0">
            unsaved
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPreview((v) => !v)}
            className={[
              "px-2 py-0.5 rounded text-xs",
              preview
                ? "bg-cta-muted text-cta"
                : "text-stone-600 hover:text-stone-900",
            ].join(" ")}
          >
            {preview ? "Edit" : "Preview"}
          </button>
          <ConfirmPopover
            onConfirm={handleDelete}
            disabled={remove.isPending}
          >
            <button
              className="p-1 rounded text-stone-500 hover:text-red-400"
              title="Delete file"
            >
              <Trash2 size={13} />
            </button>
          </ConfirmPopover>
          <button
            onClick={onClose}
            className="p-1 rounded text-stone-500 hover:text-stone-900"
            title="Discard changes"
          >
            <X size={13} />
          </button>
          <button
            onClick={handleSave}
            disabled={save.isPending || !dirty}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-cta text-white text-xs font-semibold disabled:opacity-40"
          >
            <Check size={11} />
            {save.isPending ? "Saving\u2026" : "Save"}
          </button>
        </div>
      </div>

      {/* Content area */}
      {preview ? (
        <div className="flex-1 overflow-y-auto p-6">
          <Markdown className="p-1">{content}</Markdown>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Syntax toolbar */}
          {syntaxActions.length > 0 && (
            <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border-subtle bg-surface-card/60 shrink-0">
              {syntaxActions.map((action) => (
                <button
                  key={action.title}
                  type="button"
                  title={action.title}
                  onClick={() => {
                    if (!textareaRef.current) return;
                    applySyntax(
                      textareaRef.current,
                      action,
                      content,
                      setContent,
                    );
                  }}
                  className="px-2 py-0.5 rounded text-xs font-mono text-stone-700 hover:text-stone-900 hover:bg-surface-raised transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={[
              "flex-1 resize-none p-4 font-mono",
              "text-sm leading-relaxed",
              "bg-surface-card text-stone-900",
              "placeholder-stone-500",
              "focus:outline-none",
            ].join(" ")}
            placeholder="Write here\u2026"
            spellCheck={false}
          />
        </div>
      )}

      {save.isError && (
        <p className="px-4 py-1 text-xs text-red-400 shrink-0">
          {(save.error as Error).message}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree node renderer
// ---------------------------------------------------------------------------

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  labels: string[];
  onSelect: (path: string, label: string) => void;
  onToggle: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onMove: (
    oldPath: string,
    oldLabel: string,
    newLabel: string
  ) => void;
  onDelete: (path: string) => void;
}

function TreeNodeRow({
  node,
  depth,
  selectedPath,
  labels,
  onSelect,
  onToggle,
  onRename,
  onMove,
  onDelete,
}: TreeNodeRowProps) {
  const indent = depth * 16;
  const [renaming, setRenaming] = useState(false);
  const [renamePath, setRenamePath] = useState("");

  if (node.kind === "leaf") {
    const isSelected = selectedPath === node.path;

    if (renaming) {
      return (
        <div
          className="flex items-center gap-1 py-0.5 pr-2"
          style={{ paddingLeft: indent + 6 }}
        >
          <input
            autoFocus
            type="text"
            value={renamePath}
            onChange={(e) => setRenamePath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renamePath.trim()) {
                onRename(node.path, renamePath.trim());
                setRenaming(false);
              }
              if (e.key === "Escape") setRenaming(false);
            }}
            className="flex-1 min-w-0 px-1 py-0.5 text-xs rounded bg-surface-raised border border-border text-stone-900 focus:outline-none focus:border-cta"
          />
          <button
            onClick={() => {
              if (renamePath.trim()) {
                onRename(node.path, renamePath.trim());
              }
              setRenaming(false);
            }}
            className="p-0.5 text-cta hover:bg-cta-muted rounded"
          >
            <Check size={10} />
          </button>
          <button
            onClick={() => setRenaming(false)}
            className="p-0.5 text-stone-500 hover:text-stone-900 rounded"
          >
            <X size={10} />
          </button>
        </div>
      );
    }

    return (
      <div
        className={[
          "group/leaf flex items-center py-1 pr-1",
          "hover:bg-surface-raised transition-colors",
          isSelected ? "text-cta bg-cta-muted" : "text-stone-800",
        ].join(" ")}
        style={{ paddingLeft: indent + 6 }}
      >
        <button
          onClick={() => onSelect(node.path, node.label)}
          className="flex-1 min-w-0 text-left text-xs truncate"
          title={node.path}
        >
          {node.name}
        </button>
        <div className="hidden group-hover/leaf:flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setRenamePath(node.path);
              setRenaming(true);
            }}
            className="p-0.5 rounded text-stone-400 hover:text-cta transition-colors"
            title="Rename / move"
          >
            <Pencil size={9} />
          </button>
          {labels.length > 1 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  onMove(node.path, node.label, e.target.value);
                }
              }}
              className="w-12 text-[9px] bg-transparent text-stone-400 hover:text-stone-700 cursor-pointer"
              title="Move to source"
            >
              <option value="">To...</option>
              {labels
                .filter((l) => l !== node.label)
                .map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
            </select>
          )}
          <ConfirmPopover
            onConfirm={() => onDelete(node.path)}
          >
            <button
              className={
                "p-0.5 rounded text-stone-400 " +
                "hover:text-red-400 transition-colors"
              }
              title="Delete (irreversible)"
            >
              <Trash2 size={9} />
            </button>
          </ConfirmPopover>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => onToggle(node.path)}
        className="w-full text-left py-1 pr-2 text-xs text-stone-700 flex items-center gap-1 hover:bg-surface-raised transition-colors"
        style={{ paddingLeft: indent }}
      >
        {node.expanded ? (
          <ChevronDown size={10} className="shrink-0" />
        ) : (
          <ChevronRight size={10} className="shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {node.expanded &&
        node.children.map((child) => (
          <TreeNodeRow
            key={
              child.kind === "leaf"
                ? child.path
                : child.path + "/"
            }
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            labels={labels}
            onSelect={onSelect}
            onToggle={onToggle}
            onRename={onRename}
            onMove={onMove}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function KnowledgeView() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>("wissen");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(readStoredOpen);
  const [sidebarWidth, setSidebarWidth] = useState<number>(readStoredWidth);

  // Tree state: per-label node lists with expanded flags
  const [treeNodes, setTreeNodes] = useState<Record<string, TreeNode[]>>({});

  // Collapsible root labels
  const [collapsedLabels, setCollapsedLabels] = useState<Set<string>>(
    readCollapsedLabels
  );

  // Resize drag state
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: tree = [], isLoading: treeLoading } = useKnowledgeTree();
  const { data: fileData, isLoading: fileLoading } =
    useKnowledgeFile(selectedPath);
  const { data: searchResults = [], isLoading: searchLoading } =
    useKnowledgeSearch(debouncedQ);

  const isSearching = debouncedQ.length > 1;

  // Rebuild tree when files change
  useEffect(() => {
    if (!tree.length) return;
    setTreeNodes((prev) => {
      const fresh = buildTree(tree);
      // Preserve expanded state from previous tree
      const merged: Record<string, TreeNode[]> = {};
      for (const label of Object.keys(fresh)) {
        merged[label] = preserveExpanded(fresh[label], prev[label] ?? []);
      }
      return merged;
    });
  }, [tree]);

  // Auto-expand folders containing search results
  useEffect(() => {
    if (!isSearching || searchResults.length === 0) return;
    const matchingPaths = new Set(searchResults.map((r) => r.path));
    setTreeNodes((prev) => {
      const next: Record<string, TreeNode[]> = {};
      for (const label of Object.keys(prev)) {
        next[label] = expandMatchingFolders(prev[label], matchingPaths);
      }
      return next;
    });
  }, [isSearching, searchResults]);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem(LS_OPEN, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem(LS_WIDTH, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(
      LS_COLLAPSED,
      JSON.stringify([...collapsedLabels])
    );
  }, [collapsedLabels]);

  // Resize mouse handlers
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;

    function onMove(ev: MouseEvent) {
      if (!isDragging.current) return;
      const delta = ev.clientX - dragStartX.current;
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, dragStartWidth.current + delta)
      );
      setSidebarWidth(next);
    }

    function onUp() {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function selectFile(path: string, label: string) {
    setSelectedPath(path);
    setSelectedLabel(label);
    setEditing(false);
  }

  function handleCreated(file: KnowledgeFile) {
    setSelectedPath(file.path);
    setSelectedLabel(file.label);
    setEditing(true);
    setCreating(false);
  }

  function handleDeleted() {
    setSelectedPath(null);
    setEditing(false);
  }

  function handleToggleLabel(label: string) {
    setCollapsedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function handleToggleFolder(path: string) {
    setTreeNodes((prev) => {
      const next: Record<string, TreeNode[]> = {};
      for (const label of Object.keys(prev)) {
        next[label] = toggleFolder(prev[label], path);
      }
      return next;
    });
  }

  const renameFile = useRenameKnowledgeFile();
  const moveFile = useMoveKnowledgeFile();

  function handleRename(oldPath: string, newPath: string) {
    if (oldPath === newPath) return;
    renameFile.mutate(
      { oldPath, newPath },
      {
        onSuccess: (f) => {
          if (selectedPath === oldPath) {
            setSelectedPath(f.path);
          }
        },
      }
    );
  }

  function handleMove(
    oldPath: string,
    oldLabel: string,
    newLabel: string
  ) {
    moveFile.mutate(
      { oldPath, oldLabel, newLabel },
      {
        onSuccess: (f) => {
          if (selectedPath === oldPath) {
            setSelectedPath(f.path);
            setSelectedLabel(f.label);
          }
        },
      }
    );
  }

  const deleteFile = useDeleteKnowledgeFile();

  function handleDeleteFile(path: string) {
    deleteFile.mutate(path, {
      onSuccess: () => {
        if (selectedPath === path) {
          setSelectedPath(null);
          setEditing(false);
        }
      },
    });
  }

  const showEditor =
    editing && fileData && selectedPath && !fileLoading;

  const labels = Object.keys(treeNodes).sort();

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-700">
          Knowledge
        </h1>
        {!editing && (
          <input
            type="text"
            placeholder="Search…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={[
              "ml-auto w-56 px-3 py-1 rounded-lg text-sm",
              "bg-surface-raised border border-border text-stone-900",
              "placeholder-stone-500 focus:outline-none focus:border-border-strong",
            ].join(" ")}
          />
        )}
        {!editing && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-cta-muted text-cta text-xs font-semibold hover:bg-cta hover:text-white transition-colors"
          >
            <FilePlus size={12} />
            New
          </button>
        )}
        {!editing && selectedPath && !fileLoading && fileData && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-stone-700 text-xs hover:text-stone-900 hover:bg-surface-raised transition-colors"
          >
            <Pencil size={12} />
            Edit
          </button>
        )}
        <HelpButton
          title="Knowledge"
          doc={DOCS.knowledge}
          view="knowledge"
        />
      </div>

      {/* New-file form */}
      {creating && (
        <NewFileForm
          onCreated={handleCreated}
          onClose={() => setCreating(false)}
        />
      )}

      {/* Body */}
      {showEditor ? (
        <EditorPanel
          file={
            tree.find((f) => f.path === selectedPath) ?? {
              path: selectedPath!,
              label: selectedLabel,
              name:
                selectedPath!.split("/").pop()?.replace(/\.md$/, "") ??
                "",
              size: 0,
            }
          }
          initialContent={fileData!.content}
          onSaved={() => setEditing(false)}
          onClose={() => setEditing(false)}
          onDeleted={handleDeleted}
        />
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Sidebar: folder tree or collapsed sliver */}
          <div
            className="shrink-0 border-r border-border-subtle overflow-hidden flex flex-col transition-[width] duration-150"
            style={{ width: sidebarOpen ? sidebarWidth : 0 }}
          >
            {/* Toggle button row */}
            <div className="flex items-center justify-between px-2 py-1.5 shrink-0 border-b border-border-subtle">
              <span className="text-[10px] text-stone-500 uppercase tracking-wider">
                Files
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-0.5 rounded text-stone-500 hover:text-stone-900 transition-colors"
                title="Collapse sidebar"
              >
                <ChevronLeft size={12} />
              </button>
            </div>

            {/* Tree content */}
            <div className="flex-1 overflow-y-auto py-1">
              {isSearching ? (
                searchLoading ? (
                  <p className="text-xs text-stone-500 px-4 py-2">
                    Loading…
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="text-xs text-stone-500 px-4 py-2">
                    No results.
                  </p>
                ) : (
                  searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        selectFile(r.path, r.label);
                        setSearchInput("");
                        setDebouncedQ("");
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-surface-raised transition-colors"
                    >
                      <p className="text-xs text-stone-800 truncate">
                        {r.label}/{r.path.split("/").pop()}
                      </p>
                      <p className="text-xs text-stone-600">
                        Line {r.line_number}
                      </p>
                      <p className="text-xs text-stone-700 truncate mt-0.5">
                        {r.snippet}
                      </p>
                    </button>
                  ))
                )
              ) : treeLoading ? (
                <p className="text-xs text-stone-500 px-4 py-2">
                  Loading…
                </p>
              ) : (
                labels.map((label) => (
                  <div key={label}>
                    <button
                      onClick={() => handleToggleLabel(label)}
                      className="w-full text-left flex items-center gap-1 px-3 pt-2 pb-1 select-none hover:bg-surface-raised transition-colors"
                    >
                      {collapsedLabels.has(label) ? (
                        <ChevronRight
                          size={10}
                          className="shrink-0 text-stone-600"
                        />
                      ) : (
                        <ChevronDown
                          size={10}
                          className="shrink-0 text-stone-600"
                        />
                      )}
                      <span className="text-[10px] text-stone-600 uppercase tracking-wider">
                        {label}
                      </span>
                    </button>
                    {!collapsedLabels.has(label) &&
                      (treeNodes[label] ?? []).map((node) => (
                        <TreeNodeRow
                          key={
                            node.kind === "leaf"
                              ? node.path
                              : node.path + "/"
                          }
                          node={node}
                          depth={1}
                          selectedPath={selectedPath}
                          labels={labels}
                          onSelect={selectFile}
                          onToggle={handleToggleFolder}
                          onRename={handleRename}
                          onMove={handleMove}
                          onDelete={handleDeleteFile}
                        />
                      ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Resize handle + collapsed toggle */}
          <div className="relative flex flex-col shrink-0">
            <div
              className="w-1 flex-1 bg-border-subtle cursor-col-resize hover:bg-cta/40 transition-colors"
              onMouseDown={startResize}
            />
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="absolute top-2 left-0 w-4 h-6 flex items-center justify-center rounded-r bg-surface-raised text-stone-600 hover:text-stone-900 transition-colors"
                title="Expand sidebar"
              >
                <ChevronRight size={10} />
              </button>
            )}
          </div>

          {/* Right panel: file content */}
          <div className="flex-1 overflow-y-auto p-6">
            {fileLoading && (
              <p className="text-sm text-stone-500">Loading…</p>
            )}
            {!fileLoading && !fileData && !selectedPath && (
              <p className="text-sm text-stone-500">
                Select a file to view its contents.
              </p>
            )}
            {!fileLoading && fileData && (
              <Markdown className="p-1">{fileData.content}</Markdown>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFolderExpanded(
  nodes: TreeNode[],
  path: string
): boolean | undefined {
  for (const node of nodes) {
    if (node.kind === "folder") {
      if (node.path === path) return node.expanded;
      const nested = findFolderExpanded(node.children, path);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function preserveExpanded(
  fresh: TreeNode[],
  prev: TreeNode[]
): TreeNode[] {
  return fresh.map((node) => {
    if (node.kind === "leaf") return node;
    const wasExpanded = findFolderExpanded(prev, node.path);
    return {
      ...node,
      expanded: wasExpanded ?? node.expanded,
      children: preserveExpanded(node.children, prev),
    };
  });
}
