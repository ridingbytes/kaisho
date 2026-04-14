/**
 * @module KnowledgeSidebar
 *
 * Collapsible sidebar that displays the knowledge file tree
 * grouped by label, with inline search results when a query
 * is active. Includes a draggable resize handle and a
 * collapsed-state toggle.
 */

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import React, { useRef } from "react";
import { TreeNodeRow } from "./TreeNodeRow";
import { MAX_WIDTH, MIN_WIDTH } from "./knowledgeEditorUtils";
import type { TreeNode } from "./knowledgeTree";

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
}: KnowledgeSidebarProps) {
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
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
        {/* Header */}
        <div
          className={
            "flex items-center justify-between " +
            "px-2 py-1.5 shrink-0 " +
            "border-b border-border-subtle"
          }
        >
          <span
            className={
              "text-[10px] text-stone-500 " +
              "uppercase tracking-wider"
            }
          >
            Files
          </span>
          <button
            onClick={() => onSetSidebarOpen(false)}
            className={
              "p-0.5 rounded text-stone-500 " +
              "hover:text-stone-900 transition-colors"
            }
            title="Collapse sidebar"
          >
            <ChevronLeft size={12} />
          </button>
        </div>

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
              Loading…
            </p>
          ) : (
            labels.map((label) => (
              <div key={label}>
                <button
                  onClick={() =>
                    onToggleLabel(label)
                  }
                  className={
                    "w-full text-left flex " +
                    "items-center gap-1 px-3 " +
                    "pt-2 pb-1 select-none " +
                    "hover:bg-surface-raised " +
                    "transition-colors"
                  }
                >
                  {collapsedLabels.has(label) ? (
                    <ChevronRight
                      size={10}
                      className={
                        "shrink-0 text-stone-600"
                      }
                    />
                  ) : (
                    <ChevronDown
                      size={10}
                      className={
                        "shrink-0 text-stone-600"
                      }
                    />
                  )}
                  <span
                    className={
                      "text-[10px] text-stone-600 " +
                      "uppercase tracking-wider"
                    }
                  >
                    {label}
                  </span>
                </button>
                {!collapsedLabels.has(label) &&
                  (treeNodes[label] ?? []).map(
                    (node) => (
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
                      />
                    )
                  )}
              </div>
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
            title="Expand sidebar"
          >
            <ChevronRight size={10} />
          </button>
        )}
      </div>
    </>
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
  if (loading) {
    return (
      <p className="text-xs text-stone-500 px-4 py-2">
        Loading…
      </p>
    );
  }
  if (results.length === 0) {
    return (
      <p className="text-xs text-stone-500 px-4 py-2">
        No results.
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
            Line {r.line_number}
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
