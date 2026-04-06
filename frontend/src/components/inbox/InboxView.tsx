import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useInboxItems } from "../../hooks/useInbox";
import { AddInboxForm } from "./AddInboxForm";
import { InboxItemRow } from "./InboxItemRow";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";

export function InboxView() {
  const { data: items = [], isLoading } = useInboxItems();
  const [archiveOpen, setArchiveOpen] = useState(false);

  const active = items.filter(
    (i) => i.properties?.ARCHIVED !== "true"
  );
  const archived = items.filter(
    (i) => i.properties?.ARCHIVED === "true"
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-2 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-700 flex-1">
          Inbox
        </h1>
        <HelpButton title="Inbox" doc={DOCS.inbox} view="inbox" />
      </div>
      <AddInboxForm />

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-sm text-stone-500 text-center py-8">
            Loading…
          </p>
        )}
        {!isLoading && active.length === 0 && archived.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-stone-500 text-sm">Inbox is empty</p>
            <p className="text-stone-400 text-xs">
              Add something above to get started
            </p>
          </div>
        )}
        {active.map((item) => (
          <InboxItemRow key={item.id} item={item} />
        ))}

        {/* Archive drawer */}
        {archived.length > 0 && (
          <div className="border-t border-border-subtle mt-2">
            <button
              onClick={() => setArchiveOpen((v) => !v)}
              className="flex items-center gap-1 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-700 transition-colors w-full"
            >
              {archiveOpen
                ? <ChevronDown size={10} />
                : <ChevronRight size={10} />}
              Archive ({archived.length})
            </button>
            {archiveOpen &&
              archived.map((item) => (
                <div key={item.id} className="opacity-60">
                  <InboxItemRow item={item} />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
