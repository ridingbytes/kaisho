import { ArrowUpRight, Check, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { Markdown } from "../common/Markdown";
import {
  useDeleteItem,
  usePromoteItem,
  useUpdateItem,
} from "../../hooks/useInbox";
import type { InboxItem } from "../../types";

const TYPES = ["NOTIZ", "EMAIL", "LEAD", "IDEE"] as const;

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

const fieldCls = [
  "px-2 py-1 rounded-md text-xs",
  "bg-surface-overlay border border-border",
  "text-slate-200 placeholder-slate-600",
  "focus:outline-none focus:border-accent",
].join(" ");

interface Props {
  item: InboxItem;
}

export function InboxItemRow({ item }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
  const [editCustomer, setEditCustomer] = useState("");
  const [editBody, setEditBody] = useState("");
  const [targetCustomer, setTargetCustomer] = useState(
    item.customer ?? ""
  );
  const del = useDeleteItem();
  const promote = usePromoteItem();
  const update = useUpdateItem();

  const typeStyle =
    TYPE_STYLES[item.type?.toUpperCase()] ?? TYPE_STYLES["NOTIZ"];

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditTitle(cleanTitle(item.title));
    setEditType(item.type ?? "NOTIZ");
    setEditCustomer(item.customer ?? "");
    setEditBody(item.body ?? "");
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
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(false);
  }

  function handlePromote() {
    if (!targetCustomer.trim()) return;
    promote.mutate(
      { itemId: item.id, customer: targetCustomer.trim() },
      { onSuccess: () => setPromoting(false) }
    );
  }

  return (
    <div className="group border-b border-border-subtle last:border-0">
      <div
        className="flex items-start gap-3 px-4 py-3 hover:bg-surface-raised/40 transition-colors cursor-pointer"
        onClick={() => !editing && setExpanded((v) => !v)}
      >
        {/* Type badge */}
        <span
          className={[
            "shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px]",
            "font-bold uppercase tracking-wider",
            typeStyle,
          ].join(" ")}
        >
          {item.type ?? "NOTIZ"}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {item.customer && (
              <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">
                {item.customer}
              </span>
            )}
            <span className="text-sm text-slate-300 break-words">
              {cleanTitle(item.title)}
            </span>
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
          <button
            title="Promote to task"
            onClick={(e) => {
              e.stopPropagation();
              setPromoting((v) => !v);
              setExpanded(true);
            }}
            className={[
              "p-1.5 rounded-md transition-colors",
              promoting
                ? "text-accent bg-accent-muted"
                : "text-slate-600 hover:text-accent hover:bg-accent-muted",
            ].join(" ")}
          >
            <ArrowUpRight size={14} strokeWidth={2} />
          </button>
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

          {/* Promote form */}
          {promoting && !editing && (
            <div className="flex gap-2 mt-1">
              <CustomerAutocomplete
                autoFocus
                value={targetCustomer}
                onChange={setTargetCustomer}
                onKeyDown={(e) =>
                  e.key === "Enter" && handlePromote()
                }
                className="flex-1 min-w-0"
                inputClassName={fieldCls}
              />
              <button
                onClick={handlePromote}
                disabled={
                  promote.isPending || !targetCustomer.trim()
                }
                className="px-2 py-1 rounded-md text-xs font-semibold bg-accent text-white disabled:opacity-40"
              >
                {promote.isPending ? "…" : "Move"}
              </button>
              <button
                onClick={() => setPromoting(false)}
                className="px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
