/**
 * @module KnowledgeSidebar
 *
 * Collapsible sidebar that displays the knowledge file tree
 * grouped by label, with inline search results when a query
 * is active. Includes a draggable resize handle and a
 * collapsed-state toggle.
 */

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  FolderPlus,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import { useReindexKnowledge } from "../../hooks/useKnowledge";
import { freeTagBadgeStyle } from "../../utils/tagColors";
import { TreeNodeRow } from "./TreeNodeRow";
import { MAX_WIDTH, MIN_WIDTH } from "./knowledgeEditorUtils";
import {
  collectFolderPaths,
  type TreeNode,
} from "./knowledgeTree";
import type { KnowledgeFile } from "../../types";
import { RelDate } from "../common/RelDate";

/** A single search hit returned by the knowledge API. */
interface SearchResult {
  path: string;
  label: string;
  line_number: number;
  snippet: string;
}

/** Props for {@link KnowledgeSidebar}. */
export interface KnowledgeSidebarProps {
  /** Whether the sidebar panel is open. */
  sidebarOpen: boolean;
  /** Current sidebar width in pixels. */
  sidebarWidth: number;
  /** Toggle sidebar open/closed. */
  onSetSidebarOpen: (open: boolean) => void;
  /** Update sidebar width (during drag). */
  onSetSidebarWidth: (width: number) => void;
  /** Whether a search query is active. */
  isSearching: boolean;
  /** Whether search results are loading. */
  searchLoading: boolean;
  /** Search result items. */
  searchResults: SearchResult[];
  /** Whether the tree is loading. */
  treeLoading: boolean;
  /** Sorted label keys. */
  labels: string[];
  /** Tree nodes keyed by label. */
  treeNodes: Record<string, TreeNode[]>;
  /** Set of collapsed label keys. */
  collapsedLabels: Set<string>;
  /** Currently selected file path. */
  selectedPath: string | null;
  /** Select a file and clear search. */
  onSelectFile: (path: string, label: string) => void;
  /** Clear the active search. */
  onClearSearch: () => void;
  /** Toggle a label section collapsed/expanded. */
  onToggleLabel: (label: string) => void;
  /** Toggle a folder node expanded/collapsed. */
  onToggleFolder: (path: string) => void;
  /** Rename a file path. */
  onRename: (oldPath: string, newPath: string) => void;
  /** Move a file to a different label. */
  onMove: (
    oldPath: string,
    oldLabel: string,
    newLabel: string
  ) => void;
  /** Delete a file. */
  onDelete: (path: string) => void;
  /** Create a subfolder. */
  onCreateFolder: (
    label: string, path: string, name: string,
  ) => void;
  /** Set of starred file paths. */
  starred: Set<string>;
  /** Toggle star on a file. */
  onToggleStar: (path: string) => void;
  /** Show only starred files. */
  showStarredOnly?: boolean;
  /** Show a flat list of recently-modified files instead
   *  of the tree. Mutually exclusive with starred. */
  showRecentOnly?: boolean;
  /** Top-N most recently modified files (already filter-
   *  scoped by the parent). */
  recentFiles?: KnowledgeFile[];
  /** Live filename-filter input value. */
  filenameFilter: string;
  /** Update the filename filter. */
  onFilenameFilterChange: (next: string) => void;
  /** Active tag filter set; chips render in a row
   *  beneath the funnel input when non-empty. */
  activeTagFilters: ReadonlySet<string>;
  /** Toggle a tag in/out of the filter set. */
  onToggleTagFilter: (tag: string) => void;
  /** Drop all active tag filters at once. */
  onClearTagFilters: () => void;
}

/**
 * Resizable sidebar showing either search results or the
 * label-grouped file tree, plus a drag handle and a
 * collapsed toggle button.
 */
export function KnowledgeSidebar({
  sidebarOpen,
  sidebarWidth,
  onSetSidebarOpen,
  onSetSidebarWidth,
  isSearching,
  searchLoading,
  searchResults,
  treeLoading,
  labels,
  treeNodes,
  collapsedLabels,
  selectedPath,
  onSelectFile,
  onClearSearch,
  onToggleLabel,
  onToggleFolder,
  onRename,
  onMove,
  onDelete,
  onCreateFolder,
  starred,
  onToggleStar,
  showStarredOnly,
  showRecentOnly,
  recentFiles,
  filenameFilter,
  onFilenameFilterChange,
  activeTagFilters,
  onToggleTagFilter,
  onClearTagFilters,
}: KnowledgeSidebarProps) {
  const { t } = useTranslation("knowledge");
  const { t: tc } = useTranslation("common");
  const toast = useToast();
  const reindex = useReindexKnowledge();
  const [resizing, setResizing] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    setResizing(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;

    function onMouseMove(ev: MouseEvent) {
      if (!isDragging.current) return;
      const delta = ev.clientX - dragStartX.current;
      const next = Math.min(
        MAX_WIDTH,
        Math.max(
          MIN_WIDTH, dragStartWidth.current + delta
        )
      );
      onSetSidebarWidth(next);
    }

    function onMouseUp() {
      isDragging.current = false;
      setResizing(false);
      window.removeEventListener(
        "mousemove", onMouseMove
      );
      window.removeEventListener(
        "mouseup", onMouseUp
      );
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <>
      {/* Transparent overlay during resize to prevent
          iframes from capturing mouse events */}
      {resizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
      {/* Sidebar panel */}
      <div
        className={
          "shrink-0 border-r border-border-subtle " +
          "overflow-hidden flex flex-col " +
          "transition-[width] duration-150"
        }
        style={{
          width: sidebarOpen ? sidebarWidth : 0,
        }}
      >
        {/* Header: funnel filter (always visible) +
            collapse */}
        <div
          className={
            "flex items-center gap-1 " +
            "px-2 py-1.5 shrink-0 " +
            "border-b border-border-subtle"
          }
        >
          <Filter
            size={11}
            className="text-stone-400 shrink-0"
          />
          <input
            type="text"
            value={filenameFilter}
            onChange={(e) =>
              onFilenameFilterChange(e.target.value)
            }
            placeholder={t("filterPlaceholder")}
            aria-label={t("filterPlaceholder")}
            className={
              "flex-1 min-w-0 bg-transparent " +
              "text-[11px] text-stone-700 " +
              "placeholder:text-stone-400 " +
              "focus:outline-none"
            }
          />
          {filenameFilter && (
            <button
              onClick={() => onFilenameFilterChange("")}
              className={
                "p-0.5 rounded text-stone-400 " +
                "hover:text-stone-900 transition-colors"
              }
              title={tc("clear")}
              aria-label={tc("clear")}
            >
              <X size={11} />
            </button>
          )}
          <button
            onClick={() =>
              reindex.mutate(undefined, {
                onSuccess: (r) =>
                  toast(
                    t("reindexedToast", {
                      scanned: r.scanned,
                      added: r.added,
                      renamed: r.renamed,
                      pruned: r.pruned,
                    }),
                    "success",
                  ),
                onError: (e) =>
                  toast(String(e), "error"),
              })
            }
            disabled={reindex.isPending}
            className={
              "p-0.5 rounded text-stone-500 " +
              "hover:text-cta transition-colors " +
              "disabled:opacity-40"
            }
            title={t("reindex")}
            aria-label={t("reindex")}
          >
            <RefreshCw
              size={11}
              className={
                reindex.isPending ? "animate-spin" : ""
              }
            />
          </button>
          <button
            onClick={() => onSetSidebarOpen(false)}
            className={
              "p-0.5 rounded text-stone-500 " +
              "hover:text-stone-900 transition-colors"
            }
            title={tc("collapse")}
            aria-label={tc("collapse")}
          >
            <ChevronLeft size={12} />
          </button>
        </div>

        {/* Active tag filters */}
        {activeTagFilters.size > 0 && (
          <div
            className={
              "flex flex-wrap items-center gap-1 " +
              "px-2 py-1.5 shrink-0 " +
              "border-b border-border-subtle " +
              "bg-cta-muted/30"
            }
          >
            {[...activeTagFilters].sort().map((tag) => (
              <button
                key={tag}
                onClick={() => onToggleTagFilter(tag)}
                style={freeTagBadgeStyle(tag)}
                className={
                  "inline-flex items-center gap-0.5 " +
                  "px-1.5 py-0.5 rounded text-[10px] " +
                  "font-medium hover:shadow-sm"
                }
                title={tc("clear")}
              >
                {tag}
                <X size={9} />
              </button>
            ))}
            <button
              onClick={onClearTagFilters}
              className={
                "ml-auto text-[10px] text-stone-500 " +
                "hover:text-stone-900 px-1"
              }
            >
              {tc("clearAllFilters")}
            </button>
          </div>
        )}

        {/* Tree / search content */}
        <div className="flex-1 overflow-y-auto py-1">
          {isSearching ? (
            <SearchResultsList
              loading={searchLoading}
              results={searchResults}
              onSelect={(path, label) => {
                onSelectFile(path, label);
                onClearSearch();
              }}
            />
          ) : treeLoading ? (
            <p
              className={
                "text-xs text-stone-500 px-4 py-2"
              }
            >
              {tc("loading")}
            </p>
          ) : showRecentOnly ? (
            /* Flat list of recently-modified files */
            (recentFiles ?? []).length === 0 ? (
              <p className="text-xs text-stone-400 px-4 py-3">
                No matching files
              </p>
            ) : (
              (recentFiles ?? []).map((f) => {
                const isSel = selectedPath === f.path;
                return (
                  <button
                    key={`${f.label}/${f.path}`}
                    type="button"
                    onClick={() =>
                      onSelectFile(f.path, f.label)
                    }
                    className={[
                      "flex items-center gap-2 w-full",
                      "px-4 py-1.5 text-xs",
                      "hover:bg-surface-raised",
                      "transition-colors text-left",
                      isSel
                        ? "text-cta bg-cta-muted"
                        : "text-stone-800",
                    ].join(" ")}
                  >
                    <span className="flex-1 min-w-0 truncate">
                      {f.title || f.name}
                    </span>
                    {f.mtime !== undefined && (
                      <RelDate
                        date={new Date(
                          f.mtime * 1000,
                        ).toISOString()}
                        className="shrink-0 text-[10px] text-stone-400 tabular-nums"
                      />
                    )}
                  </button>
                );
              })
            )
          ) : showStarredOnly ? (
            /* Flat list of starred files */
            [...starred].length === 0 ? (
              <p className="text-xs text-stone-400 px-4 py-3">
                No starred files
              </p>
            ) : (
              [...starred].map((path) => {
                const name = path.split("/").pop()
                  || path;
                const isSel =
                  selectedPath === path;
                return (
                  <div
                    key={path}
                    className={[
                      "flex items-center gap-2",
                      "w-full px-4 py-1.5",
                      "text-xs hover:bg-surface-raised",
                      "transition-colors",
                      isSel
                        ? "text-cta bg-cta-muted"
                        : "text-stone-800",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(path);
                      }}
                      title="Unstar"
                      className="shrink-0 p-0.5 rounded text-amber-400 hover:text-amber-500 transition-colors"
                    >
                      <Star
                        size={10}
                        fill="currentColor"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectFile(path, "")
                      }
                      className="flex-1 min-w-0 text-left truncate"
                    >
                      {name}
                    </button>
                  </div>
                );
              })
            )
          ) : (
            labels.map((label) => (
              <LabelSection
                key={label}
                label={label}
                collapsed={collapsedLabels.has(label)}
                nodes={treeNodes[label] ?? []}
                selectedPath={selectedPath}
                labels={labels}
                onToggleLabel={onToggleLabel}
                onSelectFile={onSelectFile}
                onToggleFolder={onToggleFolder}
                onRename={onRename}
                onMove={onMove}
                onDelete={onDelete}
                onCreateFolder={onCreateFolder}
                starred={starred}
                onToggleStar={onToggleStar}
              />
            ))
          )}
        </div>
      </div>

      {/* Resize handle + collapsed toggle */}
      <div className="relative flex flex-col shrink-0">
        <div
          className={
            "w-1 flex-1 bg-border-subtle " +
            "cursor-col-resize hover:bg-cta/40 " +
            "transition-colors"
          }
          onMouseDown={startResize}
        />
        {!sidebarOpen && (
          <button
            onClick={() => onSetSidebarOpen(true)}
            className={
              "absolute top-2 left-0 w-4 h-6 " +
              "flex items-center justify-center " +
              "rounded-r bg-surface-raised " +
              "text-stone-600 " +
              "hover:text-stone-900 " +
              "transition-colors"
            }
            title={tc("expand")}
          >
            <ChevronRight size={10} />
          </button>
        )}
      </div>
    </>
  );
}

// -----------------------------------------------------------------
// Label section with root-level "add folder" support
// -----------------------------------------------------------------

interface LabelSectionProps {
  label: string;
  collapsed: boolean;
  nodes: TreeNode[];
  selectedPath: string | null;
  labels: string[];
  onToggleLabel: (label: string) => void;
  onSelectFile: (path: string, label: string) => void;
  onToggleFolder: (path: string) => void;
  onRename: (old: string, next: string) => void;
  onMove: (old: string, oldL: string, newL: string) => void;
  onDelete: (path: string) => void;
  onCreateFolder: (
    label: string, path: string, name: string,
  ) => void;
  starred: Set<string>;
  onToggleStar: (path: string) => void;
}

function LabelSection({
  label,
  collapsed,
  nodes,
  selectedPath,
  labels,
  onToggleLabel,
  onSelectFile,
  onToggleFolder,
  onRename,
  onMove,
  onDelete,
  onCreateFolder,
  starred,
  onToggleStar,
}: LabelSectionProps) {
  const { t } = useTranslation("knowledge");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const folderPaths = collectFolderPaths(nodes);

  function handleAdd() {
    const n = name.trim();
    if (!n) return;
    onCreateFolder(label, n, n);
    setName("");
    setAdding(false);
  }

  return (
    <div>
      <div
        className={
          "group/label flex items-center "
          + "hover:bg-surface-raised "
          + "transition-colors"
        }
      >
        <button
          onClick={() => onToggleLabel(label)}
          className={
            "flex-1 text-left flex "
            + "items-center gap-1 px-3 "
            + "pt-2 pb-1 select-none"
          }
        >
          {collapsed ? (
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
          <span
            className={
              "text-[10px] text-stone-600 "
              + "uppercase tracking-wider"
            }
          >
            {label}
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAdding(true);
            setName("");
          }}
          className={
            "hidden group-hover/label:block "
            + "p-0.5 mr-2 rounded text-stone-400 "
            + "hover:text-cta hover:bg-cta-muted "
            + "transition-colors shrink-0"
          }
          title={t("addFolder")}
        >
          <FolderPlus size={11} />
        </button>
      </div>
      {adding && (
        <div
          className={
            "flex items-center gap-1 py-0.5 "
            + "px-3 ml-3"
          }
        >
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder={t("folderName")}
            className={
              "flex-1 min-w-0 px-1 py-0.5 text-xs "
              + "rounded bg-surface-raised border "
              + "border-border text-stone-900 "
              + "focus:outline-none focus:border-cta"
            }
          />
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className={
              "p-0.5 text-cta "
              + "hover:bg-cta-muted rounded "
              + "disabled:opacity-40"
            }
          >
            <Check size={10} />
          </button>
          <button
            onClick={() => setAdding(false)}
            className={
              "p-0.5 text-stone-500 "
              + "hover:text-stone-900 rounded"
            }
          >
            <X size={10} />
          </button>
        </div>
      )}
      {!collapsed &&
        nodes.map((node) => (
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
            onSelect={onSelectFile}
            onToggle={onToggleFolder}
            onRename={onRename}
            onMove={onMove}
            onDelete={onDelete}
            onCreateFolder={onCreateFolder}
            folders={folderPaths}
            starred={starred}
            onToggleStar={onToggleStar}
          />
        ))}
    </div>
  );
}

// -----------------------------------------------------------------
// Internal sub-component for search results
// -----------------------------------------------------------------

interface SearchResultsListProps {
  loading: boolean;
  results: SearchResult[];
  onSelect: (path: string, label: string) => void;
}

function SearchResultsList({
  loading,
  results,
  onSelect,
}: SearchResultsListProps) {
  const { t } = useTranslation("knowledge");
  const { t: tc } = useTranslation("common");
  if (loading) {
    return (
      <p className="text-xs text-stone-500 px-4 py-2">
        {tc("loading")}
      </p>
    );
  }
  if (results.length === 0) {
    return (
      <p className="text-xs text-stone-500 px-4 py-2">
        {t("noResults")}
      </p>
    );
  }
  return (
    <>
      {results.map((r, i) => (
        <button
          key={i}
          onClick={() => onSelect(r.path, r.label)}
          className={
            "w-full text-left px-4 py-2 " +
            "hover:bg-surface-raised transition-colors"
          }
        >
          <p className="text-xs text-stone-800 truncate">
            {r.label}/{r.path.split("/").pop()}
          </p>
          <p className="text-xs text-stone-600">
            {t("line", { n: r.line_number })}
          </p>
          <p
            className={
              "text-xs text-stone-700 truncate mt-0.5"
            }
          >
            {r.snippet}
          </p>
        </button>
      ))}
    </>
  );
}
