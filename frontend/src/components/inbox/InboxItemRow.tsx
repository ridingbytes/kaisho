import { ArrowUpRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { useDeleteItem, usePromoteItem } from "../../hooks/useInbox";
import type { InboxItem } from "../../types";

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

interface Props {
  item: InboxItem;
}

export function InboxItemRow({ item }: Props) {
  const [promoting, setPromoting] = useState(false);
  const [targetCustomer, setTargetCustomer] = useState(
    item.customer ?? ""
  );
  const del = useDeleteItem();
  const promote = usePromoteItem();

  const typeStyle =
    TYPE_STYLES[item.type?.toUpperCase()] ?? TYPE_STYLES["NOTIZ"];

  function handlePromote() {
    if (!targetCustomer.trim()) return;
    promote.mutate(
      { itemId: item.id, customer: targetCustomer.trim() },
      { onSuccess: () => setPromoting(false) }
    );
  }

  return (
    <div className="group px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-surface-raised/40 transition-colors">
      <div className="flex items-start gap-3">
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

          {/* Promote form */}
          {promoting && (
            <div className="flex gap-2 mt-2">
              <CustomerAutocomplete
                autoFocus
                value={targetCustomer}
                onChange={setTargetCustomer}
                onKeyDown={(e) =>
                  e.key === "Enter" && handlePromote()
                }
                className="flex-1 min-w-0"
                inputClassName={[
                  "px-2 py-1 rounded-md text-xs",
                  "bg-surface-overlay border border-border",
                  "text-slate-200 placeholder-slate-600",
                  "focus:outline-none focus:border-accent",
                ].join(" ")}
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

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            title="Promote to task"
            onClick={() => setPromoting((v) => !v)}
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
            onClick={() => del.mutate(item.id)}
            disabled={del.isPending}
            className="p-1.5 rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          >
            <Trash2 size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
