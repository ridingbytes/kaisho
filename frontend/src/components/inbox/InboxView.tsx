import { useInboxItems } from "../../hooks/useInbox";
import { AddInboxForm } from "./AddInboxForm";
import { InboxItemRow } from "./InboxItemRow";

export function InboxView() {
  const { data: items = [], isLoading } = useInboxItems();

  return (
    <div className="flex flex-col h-full">
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
