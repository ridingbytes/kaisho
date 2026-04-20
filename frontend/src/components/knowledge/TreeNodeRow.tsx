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
  FolderPlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmPopover } from "../common/ConfirmPopover";
import type { TreeNode } from "./knowledgeTree";

/** Combined dropdown: move to folder or another label. */
function MovePicker({
  filePath,
  fileLabel,
  folders,
  labels,
  onRename,
  onMove,
}: {
  filePath: string;
  fileLabel: string;
  folders: string[];
  labels: string[];
  onRename: (old: string, next: string) => void;
  onMove: (
    old: string, oldLabel: string, newLabel: string,
  ) => void;
}) {
  const { t } = useTranslation("knowledge");
  const fileName = filePath.split("/").pop() ?? "";
  const currentDir = filePath.includes("/")
    ? filePath.slice(0, filePath.lastIndexOf("/"))
    : "";
  const otherLabels = labels.filter(
    (l) => l !== fileLabel,
  );
  const availableFolders = folders.filter(
    (f) => f !== currentDir,
  );
  const showRoot = currentDir !== "";
  const hasFolders = showRoot
    || availableFolders.length > 0;

  if (!hasFolders && otherLabels.length === 0) {
    return null;
  }

  function handleChange(val: string) {
    if (val.startsWith("label:")) {
      onMove(filePath, fileLabel, val.slice(6));
    } else {
      const dir = val === "/" ? "" : val;
      const newPath = dir
        ? `${dir}/${fileName}` : fileName;
      onRename(filePath, newPath);
    }
  }

  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) handleChange(e.target.value);
      }}
      className={
        "w-12 text-[9px] bg-transparent "
        + "text-stone-400 hover:text-stone-700 "
        + "cursor-pointer"
      }
      title={t("moveTo")}
    >
      <option value="">{t("moveOption")}</option>
      {hasFolders && (
        <optgroup label={t("folders")}>
          {showRoot && (
            <option value="/">{t("rootOption")}</option>
          )}
          {availableFolders.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </optgroup>
      )}
      {otherLabels.length > 0 && (
        <optgroup label={t("sources")}>
          {otherLabels.map((l) => (
            <option key={l} value={`label:${l}`}>
              {l}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

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
  /** Folder paths within the same label (for move-to). */
  folders: string[];
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
  /** Called to create a subfolder inside a folder. */
  onCreateFolder: (
    label: string, parentPath: string, name: string,
  ) => void;
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
  folders,
  onSelect,
  onToggle,
  onRename,
  onMove,
  onDelete,
  onCreateFolder,
}: TreeNodeRowProps) {
  const { t } = useTranslation("knowledge");
  const indent = depth * 16;
  const [renaming, setRenaming] = useState(false);
  const [renamePath, setRenamePath] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

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
            title={t("editFile")}
          >
            <Pencil size={9} />
          </button>
          <MovePicker
            filePath={node.path}
            fileLabel={node.label}
            folders={folders}
            labels={labels}
            onRename={onRename}
            onMove={onMove}
          />
          <ConfirmPopover
            onConfirm={() => onDelete(node.path)}
          >
            <button
              className={
                "p-0.5 rounded text-stone-400 " +
                "hover:text-red-400 transition-colors"
              }
              title={t("deleteFile")}
            >
              <Trash2 size={9} />
            </button>
          </ConfirmPopover>
        </div>
      </div>
    );
  }

  function handleAddFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const parentPath = node.kind === "folder"
      ? node.path : "";
    const fullPath = parentPath
      ? `${parentPath}/${name}` : name;
    onCreateFolder(node.label, fullPath, name);
    setNewFolderName("");
    setAddingFolder(false);
  }

  return (
    <>
      <div
        className={
          "group/folder flex items-center "
          + "hover:bg-surface-raised "
          + "transition-colors"
        }
      >
        <button
          onClick={() => onToggle(node.path)}
          className={
            "flex-1 text-left py-1 pr-2 text-xs "
            + "text-stone-700 flex items-center "
            + "gap-1"
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
          <span className="truncate">
            {node.name}
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAddingFolder(true);
            setNewFolderName("");
            if (!node.expanded) onToggle(node.path);
          }}
          className={
            "hidden group-hover/folder:block "
            + "p-0.5 mr-1 rounded text-stone-400 "
            + "hover:text-cta hover:bg-cta-muted "
            + "transition-colors shrink-0"
          }
          title={t("addSubfolder")}
        >
          <FolderPlus size={11} />
        </button>
      </div>
      {addingFolder && (
        <div
          className="flex items-center gap-1 py-0.5 pr-2"
          style={{ paddingLeft: (depth + 1) * 16 + 6 }}
        >
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={(e) =>
              setNewFolderName(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddFolder();
              if (e.key === "Escape") {
                setAddingFolder(false);
              }
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
            onClick={handleAddFolder}
            disabled={!newFolderName.trim()}
            className={
              "p-0.5 text-cta "
              + "hover:bg-cta-muted rounded "
              + "disabled:opacity-40"
            }
          >
            <Check size={10} />
          </button>
          <button
            onClick={() => setAddingFolder(false)}
            className={
              "p-0.5 text-stone-500 "
              + "hover:text-stone-900 rounded"
            }
          >
            <X size={10} />
          </button>
        </div>
      )}
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
            onCreateFolder={onCreateFolder}
            folders={folders}
          />
        ))}
    </>
  );
}
