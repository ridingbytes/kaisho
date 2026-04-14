/**
 * @module TreeNodeRow
 *
 * Recursive renderer for a single node in the knowledge
 * file tree. Handles both folder (collapsible) and leaf
 * (selectable file) nodes, with inline rename, move-to-
 * label, and delete actions.
 */

import {
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import type { TreeNode } from "./knowledgeTree";

/** Props for {@link TreeNodeRow}. */
export interface TreeNodeRowProps {
  /** The tree node to render. */
  node: TreeNode;
  /** Current nesting depth (controls indentation). */
  depth: number;
  /** Path of the currently selected file, if any. */
  selectedPath: string | null;
  /** All available library labels (for move menu). */
  labels: string[];
  /** Called when a leaf is clicked. */
  onSelect: (path: string, label: string) => void;
  /** Called when a folder chevron is toggled. */
  onToggle: (path: string) => void;
  /** Called to rename/move a file path. */
  onRename: (oldPath: string, newPath: string) => void;
  /** Called to move a file to a different label. */
  onMove: (
    oldPath: string,
    oldLabel: string,
    newLabel: string
  ) => void;
  /** Called to delete a file. */
  onDelete: (path: string) => void;
}

/**
 * Renders a single tree node. Folders show a chevron and
 * recursively render children; leaves show the file name
 * with hover actions for rename, move, and delete.
 */
export function TreeNodeRow({
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
            onChange={(e) =>
              setRenamePath(e.target.value)
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                renamePath.trim()
              ) {
                onRename(
                  node.path, renamePath.trim()
                );
                setRenaming(false);
              }
              if (e.key === "Escape") {
                setRenaming(false);
              }
            }}
            className={
              "flex-1 min-w-0 px-1 py-0.5 text-xs " +
              "rounded bg-surface-raised border " +
              "border-border text-stone-900 " +
              "focus:outline-none focus:border-cta"
            }
          />
          <button
            onClick={() => {
              if (renamePath.trim()) {
                onRename(
                  node.path, renamePath.trim()
                );
              }
              setRenaming(false);
            }}
            className={
              "p-0.5 text-cta " +
              "hover:bg-cta-muted rounded"
            }
          >
            <Check size={10} />
          </button>
          <button
            onClick={() => setRenaming(false)}
            className={
              "p-0.5 text-stone-500 " +
              "hover:text-stone-900 rounded"
            }
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
          isSelected
            ? "text-cta bg-cta-muted"
            : "text-stone-800",
        ].join(" ")}
        style={{ paddingLeft: indent + 6 }}
      >
        <button
          onClick={() =>
            onSelect(node.path, node.label)
          }
          className={
            "flex-1 min-w-0 text-left " +
            "text-xs truncate"
          }
          title={node.path}
        >
          {node.name}
        </button>
        <div
          className={
            "hidden group-hover/leaf:flex " +
            "items-center gap-0.5 shrink-0"
          }
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setRenamePath(node.path);
              setRenaming(true);
            }}
            className={
              "p-0.5 rounded text-stone-400 " +
              "hover:text-cta transition-colors"
            }
            title="Rename / move"
          >
            <Pencil size={9} />
          </button>
          {labels.length > 1 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  onMove(
                    node.path,
                    node.label,
                    e.target.value
                  );
                }
              }}
              className={
                "w-12 text-[9px] bg-transparent " +
                "text-stone-400 hover:text-stone-700 " +
                "cursor-pointer"
              }
              title="Move to source"
            >
              <option value="">To...</option>
              {labels
                .filter((l) => l !== node.label)
                .map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
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
        className={
          "w-full text-left py-1 pr-2 text-xs " +
          "text-stone-700 flex items-center gap-1 " +
          "hover:bg-surface-raised transition-colors"
        }
        style={{ paddingLeft: indent }}
      >
        {node.expanded ? (
          <ChevronDown
            size={10}
            className="shrink-0"
          />
        ) : (
          <ChevronRight
            size={10}
            className="shrink-0"
          />
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
