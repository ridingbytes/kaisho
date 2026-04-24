import { useEffect, useMemo } from "react";
import { useCustomers } from "./useCustomers";
import { useInboxItems } from "./useInbox";
import { useKnowledgeTree } from "./useKnowledge";
import { useNotes } from "./useNotes";
import { useTasks } from "./useTasks";
import { useCronHistory } from "./useCron";
import { useUnreadBadge } from "./useUnreadBadge";

/**
 * Aggregates unread counts for all tracked nav panels.
 * Marks a panel as seen automatically when it becomes active.
 * Returns a record of panel → unread count.
 */
export function useUnreadBadges(active: string): Record<string, number> {
  const taskQ = useTasks();
  const inboxQ = useInboxItems();
  const notesQ = useNotes();
  const customersQ = useCustomers();
  const kbQ = useKnowledgeTree();
  const cronQ = useCronHistory();

  const tasks = taskQ.data ?? [];
  const inboxItems = inboxQ.data ?? [];
  const notes = notesQ.data ?? [];
  const customers = customersQ.data ?? [];
  const kbFiles = kbQ.data ?? [];
  const history = cronQ.data ?? [];

  const cronDone = useMemo(
    () => history.filter(
      (r) => r.status === "ok" || r.status === "error",
    ).length,
    [history],
  );

  const board = useUnreadBadge(
    "board", tasks.length, taskQ.isLoading,
  );
  const inbox = useUnreadBadge(
    "inbox", inboxItems.length, inboxQ.isLoading,
  );
  const notesBadge = useUnreadBadge(
    "notes", notes.length, notesQ.isLoading,
  );
  const customersBadge = useUnreadBadge(
    "customers", customers.length, customersQ.isLoading,
  );
  const knowledge = useUnreadBadge(
    "knowledge", kbFiles.length, kbQ.isLoading,
  );
  const cron = useUnreadBadge(
    "cron", cronDone, cronQ.isLoading,
  );

  useEffect(() => {
    const badgeMap: Record<
      string,
      { markSeen: () => void }
    > = {
      board,
      inbox,
      notes: notesBadge,
      customers: customersBadge,
      knowledge,
      cron,
    };
    badgeMap[active]?.markSeen();
  }, [
    active,
    board.markSeen,
    inbox.markSeen,
    notesBadge.markSeen,
    customersBadge.markSeen,
    knowledge.markSeen,
    cron.markSeen,
  ]);

  return {
    board: board.unread,
    inbox: inbox.unread,
    notes: notesBadge.unread,
    customers: customersBadge.unread,
    knowledge: knowledge.unread,
    cron: cron.unread,
  };
}
