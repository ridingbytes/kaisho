/**
 * @module kbDnd
 *
 * Drag-and-drop for the knowledge file tree. A file or
 * folder can be dragged onto a folder (or a label root); on
 * drop the user is asked whether to Move or Copy into that
 * location via a small popover. This supersedes the old
 * per-file "move" dropdown.
 *
 * State lives in a context so deeply-nested tree rows can
 * register as drag sources and drop targets without prop
 * drilling. The actual relocate is delegated to the parent
 * via ``onRelocate`` so the mutation hooks stay in
 * KnowledgeView.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Copy, FolderInput } from "lucide-react";

/** A dragged tree item. */
export interface KbDragItem {
  path: string;
  label: string;
  kind: "leaf" | "folder";
  name: string;
}

/** A drop location: a folder path, or "" for a label root. */
export interface KbDropTarget {
  path: string;
  label: string;
}

/** Whether the user chose to move or copy. */
export type KbRelocateOp = "move" | "copy";

/** An item on the cut/copy clipboard, awaiting a paste. */
export interface KbClipboard {
  item: KbDragItem;
  op: KbRelocateOp;
}

interface KbDndValue {
  dragItem: KbDragItem | null;
  startDrag: (item: KbDragItem) => void;
  endDrag: () => void;
  canDrop: (target: KbDropTarget) => boolean;
  requestDrop: (
    target: KbDropTarget, x: number, y: number,
  ) => void;
  clipboard: KbClipboard | null;
  cut: (item: KbDragItem) => void;
  copy: (item: KbDragItem) => void;
  clearClipboard: () => void;
  canPaste: (target: KbDropTarget) => boolean;
  paste: (target: KbDropTarget) => void;
}

const KbDndContext = createContext<KbDndValue | null>(null);

/** Access the KB drag-and-drop controller. */
export function useKbDnd(): KbDndValue {
  const ctx = useContext(KbDndContext);
  if (!ctx) {
    throw new Error("useKbDnd used outside KbDndProvider");
  }
  return ctx;
}

/** Parent directory of a path; "" if at the root. */
function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Whether ``item`` can land in ``target``. Rejects a no-op
 *  (same label + same parent dir) and moving a folder into
 *  itself or one of its own descendants. Shared by drop and
 *  paste so both enforce the same rules. */
function isValidTarget(
  item: KbDragItem, target: KbDropTarget,
): boolean {
  const sameLabel = item.label === target.label;
  if (sameLabel && dirOf(item.path) === target.path) {
    return false;
  }
  if (item.kind === "folder" && sameLabel) {
    if (
      target.path === item.path ||
      target.path.startsWith(item.path + "/")
    ) {
      return false;
    }
  }
  return true;
}

interface Pending {
  source: KbDragItem;
  target: KbDropTarget;
  x: number;
  y: number;
}

/** Provider that tracks the drag source and renders the
 *  Move/Copy popover on drop. */
export function KbDndProvider({
  onRelocate,
  children,
}: {
  onRelocate: (
    source: KbDragItem,
    target: KbDropTarget,
    op: KbRelocateOp,
  ) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation("knowledge");
  const { t: tc } = useTranslation("common");
  const [dragItem, setDragItem] = useState<KbDragItem | null>(
    null,
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [clipboard, setClipboard] =
    useState<KbClipboard | null>(null);

  const startDrag = useCallback(
    (item: KbDragItem) => setDragItem(item), [],
  );
  const endDrag = useCallback(() => setDragItem(null), []);

  const canDrop = useCallback(
    (target: KbDropTarget): boolean =>
      !!dragItem && isValidTarget(dragItem, target),
    [dragItem],
  );

  const cut = useCallback(
    (item: KbDragItem) =>
      setClipboard({ item, op: "move" }), [],
  );
  const copy = useCallback(
    (item: KbDragItem) =>
      setClipboard({ item, op: "copy" }), [],
  );
  const clearClipboard = useCallback(
    () => setClipboard(null), [],
  );
  const canPaste = useCallback(
    (target: KbDropTarget): boolean =>
      !!clipboard && isValidTarget(clipboard.item, target),
    [clipboard],
  );
  const paste = useCallback(
    (target: KbDropTarget) => {
      if (!clipboard || !isValidTarget(clipboard.item, target)) {
        return;
      }
      onRelocate(clipboard.item, target, clipboard.op);
      setClipboard(null);
    },
    [clipboard, onRelocate],
  );

  const requestDrop = useCallback(
    (target: KbDropTarget, x: number, y: number) => {
      if (!dragItem || !canDrop(target)) return;
      setPending({ source: dragItem, target, x, y });
      setDragItem(null);
    },
    [dragItem, canDrop],
  );

  const resolve = useCallback(
    (op: KbRelocateOp) => {
      if (pending) {
        onRelocate(pending.source, pending.target, op);
      }
      setPending(null);
    },
    [pending, onRelocate],
  );

  // Close the popover on Escape or any outside click.
  useEffect(() => {
    if (!pending) return;
    const close = () => setPending(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", close);
    };
  }, [pending]);

  const value = useMemo(
    () => ({
      dragItem, startDrag, endDrag, canDrop, requestDrop,
      clipboard, cut, copy, clearClipboard, canPaste, paste,
    }),
    [
      dragItem, startDrag, endDrag, canDrop, requestDrop,
      clipboard, cut, copy, clearClipboard, canPaste, paste,
    ],
  );

  const destName = pending
    ? (pending.target.path
      ? pending.target.path.split("/").pop()
      : pending.target.label)
    : "";

  return (
    <KbDndContext.Provider value={value}>
      {children}
      {pending && (
        <div
          className={
            "fixed z-[60] min-w-40 rounded-md border " +
            "border-border bg-surface-raised shadow-lg " +
            "py-1 text-sm"
          }
          style={{ left: pending.x, top: pending.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            className={
              "px-3 py-1 text-2xs text-fg-subtle truncate"
            }
            title={destName ?? ""}
          >
            {t("dropInto", { name: destName })}
          </div>
          <button
            type="button"
            onClick={() => resolve("move")}
            className={
              "w-full flex items-center gap-2 px-3 py-1.5 " +
              "text-left text-fg-strong " +
              "hover:bg-cta-muted hover:text-cta"
            }
          >
            <FolderInput size={13} />
            {t("moveHere")}
          </button>
          <button
            type="button"
            onClick={() => resolve("copy")}
            className={
              "w-full flex items-center gap-2 px-3 py-1.5 " +
              "text-left text-fg-strong " +
              "hover:bg-cta-muted hover:text-cta"
            }
          >
            <Copy size={13} />
            {t("copyHere")}
          </button>
          <button
            type="button"
            onClick={() => setPending(null)}
            className={
              "w-full px-3 py-1.5 text-left text-fg-muted " +
              "hover:text-fg-strong"
            }
          >
            {tc("cancel")}
          </button>
        </div>
      )}
    </KbDndContext.Provider>
  );
}
