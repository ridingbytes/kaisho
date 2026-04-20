import { useTranslation } from "react-i18next";
import {
  ArrowRightLeft,
  Check,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ContentPopup } from "../common/ContentPopup";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { RelDate } from "../common/RelDate";
import { Markdown } from "../common/Markdown";
import {
  useDeleteItem,
  useMoveItem,
  useUpdateItem,
} from "../../hooks/useInbox";
import { useSetView } from "../../context/ViewContext";
import type { InboxItem } from "../../types";

import { useSettings } from "../../hooks/useSettings";

const CHANNEL_KEYS = [
  { value: "", labelKey: "anyChannel" },
  { value: "email", labelKey: "emailChannel" },
  { value: "phone", labelKey: "phoneChannel" },
  { value: "chat", labelKey: "chatChannel" },
  { value: "other", labelKey: "otherChannel" },
] as const;

const DIRECTION_KEYS = [
  { value: "", labelKey: "anyDirection" },
  { value: "in", labelKey: "in" },
  { value: "out", labelKey: "out" },
] as const;

const TYPE_STYLES: Record<string, string> = {
  NOTE: "bg-stone-500/15 text-stone-700",
  EMAIL: "bg-sky-500/15 text-sky-400",
  LEAD: "bg-emerald-500/15 text-emerald-400",
  IDEA: "bg-violet-500/15 text-violet-400",
  BUG: "bg-red-500/15 text-red-400",
  FEATURE: "bg-blue-500/15 text-blue-400",
};

const TITLE_STRIP_RE = /^(?:EMAIL|LEAD|IDEA|NOTE|BUG|FEATURE)\s+/i;
const CUSTOMER_STRIP_RE = /^\[[^\]]+\]\s*/;

function cleanTitle(title: string): string {
  return title.replace(TITLE_STRIP_RE, "").replace(CUSTOMER_STRIP_RE, "");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const fieldCls = [
  "px-2 py-1 rounded-md text-xs",
  "bg-surface-overlay border border-border",
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
].join(" ");

const badgeCls =
  "shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider";

type MoveDestination = "todo" | "note" | "kb" | "archive";

interface Props {
  item: InboxItem;
}

export function InboxItemRow({ item }: Props) {
  const { t } = useTranslation("inbox");
  const { t: tc } = useTranslation("common");
  const setView = useSetView();
  const { data: settings } = useSettings();
  const inboxTypes: string[] =
    settings?.inbox_types ?? ["NOTE", "EMAIL"];
  const [expanded, setExpanded] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveDest, setMoveDest] = useState<MoveDestination | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
  const [editCustomer, setEditCustomer] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editChannel, setEditChannel] = useState("");
  const [editDirection, setEditDirection] = useState("");
  const [targetCustomer, setTargetCustomer] = useState(
    item.customer ?? ""
  );
  const [targetFilename, setTargetFilename] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const delRef = useRef<HTMLDivElement>(null);
  const del = useDeleteItem();
  const move = useMoveItem();
  const update = useUpdateItem();

  useEffect(() => {
    if (!confirmDel) return;
    function handleClick(e: MouseEvent) {
      if (
        delRef.current &&
        !delRef.current.contains(e.target as Node)
      ) {
        setConfirmDel(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () =>
      document.removeEventListener(
        "mousedown", handleClick,
      );
  }, [confirmDel]);

  const typeStyle =
    TYPE_STYLES[item.type?.toUpperCase()] ?? TYPE_STYLES["NOTE"];

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditTitle(cleanTitle(item.title));
    setEditType(item.type ?? "NOTE");
    setEditCustomer(item.customer ?? "");
    setEditBody(item.body ?? "");
    setEditChannel(item.channel ?? "");
    setEditDirection(item.direction ?? "");
    setEditing(true);
    setExpanded(true);
  }

  function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    update.mutate(
      {
        itemId: item.id,
        updates: {
          title: editTitle.trim(),
          type: editType,
          customer: editCustomer.trim() || undefined,
          body: editBody,
          channel: editChannel,
          direction: editDirection,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(false);
  }

  function openMovePanel(e: React.MouseEvent) {
    e.stopPropagation();
    setMoving((v) => !v);
    setMoveDest(null);
    setTargetCustomer(item.customer ?? "");
    setTargetFilename(slugify(cleanTitle(item.title)) + ".md");
  }

  function selectDest(dest: MoveDestination) {
    setMoveDest(dest);
    if (dest === "note" || dest === "archive") {
      move.mutate(
        { itemId: item.id, destination: dest },
        { onSuccess: () => setMoving(false) }
      );
    }
    if (dest === "todo" || dest === "kb") {
      setExpanded(true);
    }
  }

  function handleMoveTodo() {
    if (!targetCustomer.trim()) return;
    move.mutate(
      {
        itemId: item.id,
        destination: "todo",
        customer: targetCustomer.trim(),
      },
      { onSuccess: () => setMoving(false) }
    );
  }

  function handleMoveKb() {
    if (!targetFilename.trim()) return;
    move.mutate(
      {
        itemId: item.id,
        destination: "kb",
        filename: targetFilename.trim(),
      },
      { onSuccess: () => setMoving(false) }
    );
  }

  return (
    <div className="group border-b border-border-subtle last:border-0">
      <div
        className="flex items-start gap-3 px-4 py-3 hover:bg-surface-raised/40 transition-colors cursor-pointer"
        onClick={() => !editing && setExpanded((v) => !v)}
      >
        {/* Type badge */}
        <span className={[badgeCls, typeStyle].join(" ")}>
          {item.type ?? "NOTE"}
        </span>

        {/* Channel badge */}
        {item.channel && (
          <span
            className={[
              badgeCls,
              "bg-amber-500/15 text-amber-400",
            ].join(" ")}
          >
            {item.channel}
          </span>
        )}

        {/* Direction badge */}
        {item.direction && (
          <span
            className={[
              badgeCls,
              "bg-teal-500/15 text-teal-400",
            ].join(" ")}
          >
            {item.direction}
          </span>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {item.customer && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setView("customers", item.customer ?? "");
                }}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-cta-muted text-cta-hover cursor-pointer hover:bg-cta/20"
              >
                {item.customer}
              </span>
            )}
            <span className="text-sm text-stone-800 break-words">
              {cleanTitle(item.title)}
            </span>
            {item.body && (
              <ContentPopup
                content={item.body}
                title={cleanTitle(item.title)}
                markdown
              />
            )}
          </div>
          <RelDate
            date={item.created}
            className="text-[10px] text-stone-500 mt-0.5 block"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            title={tc("edit")}
            onClick={startEdit}
            className="p-1.5 rounded-md text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          >
            <Pencil size={13} strokeWidth={2} />
          </button>
          <div className="relative">
            <button
              title={tc("move")}
              onClick={openMovePanel}
              className={[
                "p-1.5 rounded-md transition-colors",
                moving
                  ? "text-cta bg-cta-muted"
                  : "text-stone-500 hover:text-cta hover:bg-cta-muted",
              ].join(" ")}
            >
              <ArrowRightLeft size={14} strokeWidth={2} />
            </button>
            {moving && !moveDest && (
              <div
                className="absolute right-0 top-full mt-1 z-50 w-32 rounded-lg bg-surface-overlay border border-border shadow-lg p-1 flex flex-col gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                {(
                  ["todo", "note", "kb", "archive"] as MoveDestination[]
                ).map((d) => (
                  <button
                    key={d}
                    onClick={() => selectDest(d)}
                    disabled={move.isPending}
                    className="w-full text-left px-2 py-1 rounded text-xs text-stone-800 hover:bg-surface-raised transition-colors capitalize disabled:opacity-40"
                  >
                    {d === "kb" ? tc("knowledge") : d === "todo" ? tc("todo") : d === "archive" ? tc("archive") : d}
                  </button>
                ))}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMoving(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded text-[10px] text-stone-500 hover:text-stone-900"
                >
                  {tc("cancel")}
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            {!confirmDel ? (
              <button
                title={tc("delete")}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDel(true);
                }}
                disabled={del.isPending}
                className="p-1.5 rounded-md text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            ) : (
              <div
                ref={delRef}
                className="absolute right-0 top-full mt-1 z-50 flex items-center gap-1 px-2 py-1 rounded bg-surface-overlay border border-border shadow-lg whitespace-nowrap"
              >
                <span className="text-[10px] text-stone-700">
                  {tc("deleteConfirm")}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    del.mutate(item.id);
                    setConfirmDel(false);
                  }}
                  className="p-0.5 rounded text-red-400 hover:bg-red-500/10"
                >
                  <Check size={10} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDel(false);
                  }}
                  className="p-0.5 rounded text-stone-600 hover:text-stone-900"
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          className="px-4 pb-3 flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {editing ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className={`${fieldCls} w-28 shrink-0`}
                >
                  {inboxTypes.map((t: string) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <CustomerAutocomplete
                  value={editCustomer}
                  onChange={setEditCustomer}
                  placeholder={tc("customer")}
                  className="flex-1 min-w-0"
                  inputClassName={fieldCls}
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={editChannel}
                  onChange={(e) => setEditChannel(e.target.value)}
                  className={`${fieldCls} flex-1`}
                >
                  {CHANNEL_KEYS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.labelKey)}
                    </option>
                  ))}
                </select>
                <select
                  value={editDirection}
                  onChange={(e) => setEditDirection(e.target.value)}
                  className={`${fieldCls} flex-1`}
                >
                  {DIRECTION_KEYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {t(d.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={tc("title")}
                className={`${fieldCls} w-full`}
              />
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder={t("bodyOptional")}
                rows={3}
                className={`${fieldCls} w-full resize-none`}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={update.isPending}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-cta text-white disabled:opacity-40"
                >
                  <Check size={11} />
                  {update.isPending ? tc("saving") : tc("save")}
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-stone-600 hover:text-stone-900"
                >
                  <X size={11} />
                  {tc("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {item.body && (
                <Markdown className="text-sm text-stone-700">
                  {item.body}
                </Markdown>
              )}
            </>
          )}

          {/* Move sub-panel (todo/kb need input) */}
          {moving && moveDest === "todo" && (
            <div
              className="mt-1 p-2 rounded-md bg-surface-overlay border border-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-2">
                <CustomerAutocomplete
                  autoFocus
                  value={targetCustomer}
                  onChange={setTargetCustomer}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleMoveTodo()
                  }
                  className="flex-1 min-w-0"
                  inputClassName={fieldCls}
                />
                <button
                  onClick={handleMoveTodo}
                  disabled={
                    move.isPending || !targetCustomer.trim()
                  }
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-cta text-white disabled:opacity-40"
                >
                  {move.isPending ? "…" : tc("move")}
                </button>
                <button
                  onClick={() => { setMoveDest(null); setMoving(false); }}
                  className="px-2 py-1 rounded-md text-xs text-stone-600 hover:text-stone-900"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          )}
          {moving && moveDest === "kb" && (
            <div
              className="mt-1 p-2 rounded-md bg-surface-overlay border border-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={targetFilename}
                  onChange={(e) => setTargetFilename(e.target.value)}
                  placeholder="filename.md"
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleMoveKb()
                  }
                  className={`${fieldCls} flex-1`}
                />
                <button
                  onClick={handleMoveKb}
                  disabled={
                    move.isPending || !targetFilename.trim()
                  }
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-cta text-white disabled:opacity-40"
                >
                  {move.isPending ? "…" : tc("move")}
                </button>
                <button
                  onClick={() => { setMoveDest(null); setMoving(false); }}
                  className="px-2 py-1 rounded-md text-xs text-stone-600 hover:text-stone-900"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
