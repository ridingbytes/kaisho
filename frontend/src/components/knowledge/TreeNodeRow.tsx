/**
 * @module TreeNodeRow
 *
 * Recursive renderer for a single node in the knowledge
 * file tree. Handles both folder (collapsible) and leaf
 * (selectable file) nodes. Rename, move/copy, and delete
 * live in the right-click context menu; the row itself
 * shows only the star toggle and the drag handle.
 */

import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  Pencil,
  Scissors,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchKnowledgeAbsolutePath } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import type { TreeNode } from "./knowledgeTree";
import { useKbDnd } from "./kbDnd";
import { TreeContextMenu, type MenuItem } from "./TreeContextMenu";

/** Props for {@link TreeNodeRow}. */
export interface TreeNodeRowProps {
  /** The tree node to render. */
  node: TreeNode;
  /** Current nesting depth (controls indentation). */
  depth: number;
  /** Path of the currently selected file, if any. */
  selectedPath: string | null;
  /** Called when a leaf is clicked. */
  onSelect: (path: string, label: string) => void;
  /** Called when a folder chevron is toggled. */
  onToggle: (path: string) => void;
  /** Called to rename a file path (inline rename). */
  onRename: (oldPath: string, newPath: string) => void;
  /** Called to delete a file. */
  onDelete: (path: string) => void;
  /** Called to delete a folder and its contents. */
  onDeleteFolder: (path: string) => void;
  /** Called to create a subfolder inside a folder. */
  onCreateFolder: (
    label: string, parentPath: string, name: string,
  ) => void;
  /** Set of starred file paths. */
  starred: Set<string>;
  /** Toggle star on a file path. */
  onToggleStar: (path: string) => void;
}

/**
 * Renders a single tree node. Folders show a chevron and
 * recursively render children; leaves show the file name
 * and a star toggle. Rename, move/copy, and delete are in
 * the right-click context menu.
 */
export function TreeNodeRow({
  node,
  depth,
  selectedPath,
  onSelect,
  onToggle,
  onRename,
  onDelete,
  onDeleteFolder,
  onCreateFolder,
  starred,
  onToggleStar,
}: TreeNodeRowProps) {
  const { t } = useTranslation("knowledge");
  const dnd = useKbDnd();
  const toast = useToast();
  const indent = depth * 16;
  const [renaming, setRenaming] = useState(false);
  const [renamePath, setRenamePath] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number }
    | null>(null);

  const selfItem = {
    path: node.path,
    label: node.label,
    kind: node.kind,
    name: node.name,
  };
  const selfTarget = { path: node.path, label: node.label };

  async function copyPath() {
    try {
      const res = await fetchKnowledgeAbsolutePath(node.path);
      await navigator.clipboard.writeText(res.path);
      toast(t("pathCopied"), "success");
    } catch (err) {
      toast(String(err), "error");
    }
  }

  function startRename() {
    setRenamePath(node.path);
    setRenaming(true);
  }

  function startAddFolder() {
    setAddingFolder(true);
    setNewFolderName("");
    if (node.kind === "folder" && !node.expanded) {
      onToggle(node.path);
    }
  }

  function leafMenuItems(): MenuItem[] {
    return [
      {
        key: "open", label: t("ctxOpen"),
        icon: <FileText size={13} />,
        onClick: () => onSelect(node.path, node.label),
      },
      { key: "s1", label: "", separator: true },
      {
        key: "cut", label: t("ctxCut"),
        icon: <Scissors size={13} />,
        onClick: () => dnd.cut(selfItem),
      },
      {
        key: "copy", label: t("ctxCopy"),
        icon: <Copy size={13} />,
        onClick: () => dnd.copy(selfItem),
      },
      {
        key: "path", label: t("copyPath"),
        icon: <Link2 size={13} />, onClick: copyPath,
      },
      {
        key: "rename", label: t("ctxRename"),
        icon: <Pencil size={13} />, onClick: startRename,
      },
      { key: "s2", label: "", separator: true },
      {
        key: "delete", label: t("deleteFile"),
        confirmLabel: t("ctxConfirmDelete"),
        icon: <Trash2 size={13} />, danger: true,
        onClick: () => onDelete(node.path),
      },
    ];
  }

  function folderMenuItems(): MenuItem[] {
    const expanded =
      node.kind === "folder" && node.expanded;
    return [
      {
        key: "open",
        label: expanded ? t("ctxCollapse") : t("ctxOpen"),
        icon: expanded
          ? <FolderOpen size={13} />
          : <Folder size={13} />,
        onClick: () => onToggle(node.path),
      },
      {
        key: "paste", label: t("ctxPaste"),
        icon: <ClipboardPaste size={13} />,
        disabled: !dnd.canPaste(selfTarget),
        onClick: () => dnd.paste(selfTarget),
      },
      { key: "s1", label: "", separator: true },
      {
        key: "cut", label: t("ctxCut"),
        icon: <Scissors size={13} />,
        onClick: () => dnd.cut(selfItem),
      },
      {
        key: "copy", label: t("ctxCopy"),
        icon: <Copy size={13} />,
        onClick: () => dnd.copy(selfItem),
      },
      {
        key: "newfolder", label: t("addSubfolder"),
        icon: <FolderPlus size={13} />,
        onClick: startAddFolder,
      },
      { key: "s2", label: "", separator: true },
      {
        key: "delete", label: t("ctxDeleteFolder"),
        confirmLabel: t("ctxConfirmDelete"),
        icon: <Trash2 size={13} />, danger: true,
        onClick: () => onDeleteFolder(node.path),
      },
    ];
  }

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  const contextMenu = menu ? (
    <TreeContextMenu
      x={menu.x}
      y={menu.y}
      items={
        node.kind === "leaf"
          ? leafMenuItems() : folderMenuItems()
      }
      onClose={() => setMenu(null)}
    />
  ) : null;

  const dragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      // Firefox only starts a drag when data is set.
      e.dataTransfer.setData("text/plain", node.path);
      e.dataTransfer.effectAllowed = "copyMove";
      dnd.startDrag({
        path: node.path,
        label: node.label,
        kind: node.kind,
        name: node.name,
      });
    },
    onDragEnd: () => dnd.endDrag(),
  };

  if (node.kind === "leaf") {
    const isSelected = selectedPath === node.path;
    const isStarred = starred.has(node.path);
    // Reveal the selected file when the tree first renders
    // it (e.g. on app reload after we restore selectedPath
    // from localStorage, or when the user navigates back
    // to the KB panel). ``block: "nearest"`` avoids
    // snapping mid-list when the leaf is already in view.
    const rowRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      if (isSelected) {
        rowRef.current?.scrollIntoView({ block: "nearest" });
      }
    }, [isSelected]);

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
              "border-border text-fg-strong " +
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
              "p-0.5 text-fg-muted " +
              "hover:text-fg-strong rounded"
            }
          >
            <X size={10} />
          </button>
        </div>
      );
    }

    return (
      <>
      <div
        ref={rowRef}
        {...dragProps}
        onContextMenu={openMenu}
        className={[
          "group/leaf flex items-center py-1 pr-1",
          "hover:bg-surface-raised transition-colors",
          "cursor-grab active:cursor-grabbing",
          isSelected
            ? "text-cta bg-cta-muted"
            : "text-fg-strong",
        ].join(" ")}
        style={{ paddingLeft: indent + 6 }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(node.path);
          }}
          className={[
            "shrink-0 p-0.5 rounded",
            "transition-colors",
            isStarred
              ? "text-amber-400"
              : "text-transparent " +
                "group-hover/leaf:text-fg-disabled " +
                "hover:!text-amber-400",
          ].join(" ")}
        >
          <Star
            size={10}
            fill={isStarred ? "currentColor" : "none"}
          />
        </button>
        <button
          onClick={() =>
            onSelect(node.path, node.label)
          }
          className={
            "flex-1 min-w-0 text-left " +
            "text-sm truncate flex items-center gap-1.5"
          }
          title={node.path}
        >
          <FileText
            size={10}
            className={
              "shrink-0 " + (
                isSelected
                  ? "text-cta"
                  : "text-fg-subtle"
              )
            }
          />
          <span className="truncate">{node.name}</span>
        </button>
      </div>
      {contextMenu}
      </>
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

  const dropTarget = { path: node.path, label: node.label };

  return (
    <>
      <div
        {...dragProps}
        onDragOver={(e) => {
          if (!dnd.canDrop(dropTarget)) return;
          e.preventDefault();
          e.stopPropagation();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropActive(false);
          dnd.requestDrop(dropTarget, e.clientX, e.clientY);
        }}
        onContextMenu={openMenu}
        className={[
          "group/folder flex items-center transition-colors",
          "cursor-grab active:cursor-grabbing",
          dropActive
            ? "bg-cta-muted ring-1 ring-cta/50"
            : "hover:bg-surface-raised",
        ].join(" ")}
      >
        <button
          onClick={() => onToggle(node.path)}
          className={
            "flex-1 text-left py-1 pr-2 text-sm "
            + "font-semibold text-fg "
            + "flex items-center gap-1"
          }
          style={{ paddingLeft: indent }}
        >
          {node.expanded ? (
            <ChevronDown
              size={10}
              className="shrink-0 text-fg-muted"
            />
          ) : (
            <ChevronRight
              size={10}
              className="shrink-0 text-fg-muted"
            />
          )}
          {node.expanded ? (
            <FolderOpen
              size={11}
              className="shrink-0 text-amber-500/80"
            />
          ) : (
            <Folder
              size={11}
              className="shrink-0 text-amber-500/80"
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
            // Single-button reveal: ``invisible`` keeps the
            // slot occupied so the folder row height stays
            // steady across hover.
            "block invisible pointer-events-none "
            + "group-hover/folder:visible "
            + "group-hover/folder:pointer-events-auto "
            + "p-0.5 mr-1 rounded text-fg-subtle "
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
              + "border-border text-fg-strong "
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
              "p-0.5 text-fg-muted "
              + "hover:text-fg-strong rounded"
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
            onSelect={onSelect}
            onToggle={onToggle}
            onRename={onRename}
            onDelete={onDelete}
            onDeleteFolder={onDeleteFolder}
            onCreateFolder={onCreateFolder}
            starred={starred}
            onToggleStar={onToggleStar}
          />
        ))}
      {contextMenu}
    </>
  );
}
