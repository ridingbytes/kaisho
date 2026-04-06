import {
  ArrowRightLeft,
  Check,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { ContentPopup } from "../common/ContentPopup";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { Markdown } from "../common/Markdown";
import {
  useDeleteItem,
  useMoveItem,
  useUpdateItem,
} from "../../hooks/useInbox";
import { useSetView } from "../../context/ViewContext";
import type { InboxItem } from "../../types";

const TYPES = ["NOTIZ", "EMAIL", "LEAD", "IDEE"] as const;

const CHANNELS = [
  { value: "", label: "Any" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "chat", label: "Chat" },
  { value: "other", label: "Other" },
] as const;

const DIRECTIONS = [
  { value: "", label: "Any" },
  { value: "in", label: "In" },
  { value: "out", label: "Out" },
] as const;

const TYPE_STYLES: Record<string, string> = {
  EMAIL: "bg-sky-500/15 text-sky-400",
  LEAD: "bg-emerald-500/15 text-emerald-400",
  IDEE: "bg-violet-500/15 text-violet-400",
  NOTIZ: "bg-slate-500/15 text-slate-400",
};

const TITLE_STRIP_RE = /^(?:EMAIL|LEAD|IDEE|NOTIZ|NOTE|IDEA)\s+/i;
const CUSTOMER_STRIP_RE = /^\[[^\]]+\]\s*/;

function cleanTitle(title: string): string {
  return title.replace(TITLE_STRIP_RE, "").replace(CUSTOMER_STRIP_RE, "");
}

function formatDate(dateStr: string): string {
  return dateStr.replace(/^\[/, "").replace(/\]$/, "").slice(0, 10);
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
  "text-slate-200 placeholder-slate-600",
  "focus:outline-none focus:border-accent",
].join(" ");

const badgeCls =
  "shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider";

type MoveDestination = "todo" | "note" | "kb" | "archive";

interface Props {
  item: InboxItem;
}

export function InboxItemRow({ item }: Props) {
  const setView = useSetView();
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
  const del = useDeleteItem();
  const move = useMoveItem();
  const update = useUpdateItem();

  const typeStyle =
    TYPE_STYLES[item.type?.toUpperCase()] ?? TYPE_STYLES["NOTIZ"];

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditTitle(cleanTitle(item.title));
    setEditType(item.type ?? "NOTIZ");
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
          {item.type ?? "NOTIZ"}
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
                  setView("customers");
                }}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-accent-muted text-accent-hover cursor-pointer hover:bg-accent/20"
              >
                {item.customer}
              </span>
            )}
            <span className="text-sm text-slate-300 break-words">
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
          <p className="text-[10px] text-slate-600 mt-0.5">
            {formatDate(item.created)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            title="Edit"
            onClick={startEdit}
            className="p-1.5 rounded-md text-slate-600 hover:text-accent hover:bg-accent-muted transition-colors"
          >
            <Pencil size={13} strokeWidth={2} />
          </button>
          <div className="relative">
            <button
              title="Move"
              onClick={openMovePanel}
              className={[
                "p-1.5 rounded-md transition-colors",
                moving
                  ? "text-accent bg-accent-muted"
                  : "text-slate-600 hover:text-accent hover:bg-accent-muted",
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
                    className="w-full text-left px-2 py-1 rounded text-xs text-slate-300 hover:bg-surface-raised transition-colors capitalize disabled:opacity-40"
                  >
                    {d === "kb" ? "Knowledge" : d}
                  </button>
                ))}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMoving(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded text-[10px] text-slate-600 hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <button
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              del.mutate(item.id);
            }}
            disabled={del.isPending}
            className="p-1.5 rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          >
            <Trash2 size={14} strokeWidth={2} />
          </button>
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
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <CustomerAutocomplete
                  value={editCustomer}
                  onChange={setEditCustomer}
                  placeholder="Customer"
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
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select
                  value={editDirection}
                  onChange={(e) => setEditDirection(e.target.value)}
                  className={`${fieldCls} flex-1`}
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Title"
                className={`${fieldCls} w-full`}
              />
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Body (optional)"
                rows={3}
                className={`${fieldCls} w-full resize-none`}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={update.isPending}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-accent text-white disabled:opacity-40"
                >
                  <Check size={11} />
                  {update.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-300"
                >
                  <X size={11} />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {item.body && (
                <Markdown className="text-sm text-slate-400">
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
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-accent text-white disabled:opacity-40"
                >
                  {move.isPending ? "…" : "Move"}
                </button>
                <button
                  onClick={() => { setMoveDest(null); setMoving(false); }}
                  className="px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-300"
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
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-accent text-white disabled:opacity-40"
                >
                  {move.isPending ? "…" : "Move"}
                </button>
                <button
                  onClick={() => { setMoveDest(null); setMoving(false); }}
                  className="px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-300"
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
