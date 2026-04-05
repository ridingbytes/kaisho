import { useInboxItems } from "../../hooks/useInbox";
import { AddInboxForm } from "./AddInboxForm";
import { InboxItemRow } from "./InboxItemRow";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";

export function InboxView() {
  const { data: items = [], isLoading } = useInboxItems();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-2 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400 flex-1">
          Inbox
        </h1>
        <HelpButton title="Inbox" doc={DOCS.inbox} view="inbox" />
      </div>
      <AddInboxForm />

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-sm text-slate-600 text-center py-8">
            Loading…
          </p>
        )}
        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-slate-600 text-sm">Inbox is empty</p>
            <p className="text-slate-700 text-xs">
              Add something above to get started
            </p>
          </div>
        )}
        {items.map((item) => (
          <InboxItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
