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
  const { data: tasks = [] } = useTasks();
  const { data: inboxItems = [] } = useInboxItems();
  const { data: notes = [] } = useNotes();
  const { data: customers = [] } = useCustomers();
  const { data: kbFiles = [] } = useKnowledgeTree();
  const { data: history = [] } = useCronHistory();

  const cronDone = useMemo(
    () => history.filter(
      (r) => r.status === "ok" || r.status === "error",
    ).length,
    [history],
  );

  const board = useUnreadBadge("board", tasks.length);
  const inbox = useUnreadBadge("inbox", inboxItems.length);
  const notesBadge = useUnreadBadge("notes", notes.length);
  const customersBadge = useUnreadBadge("customers", customers.length);
  const knowledge = useUnreadBadge("knowledge", kbFiles.length);
  const cron = useUnreadBadge("cron", cronDone);

  useEffect(() => {
    if (active === "board") board.markSeen();
  }, [active, tasks.length, board.markSeen]);

  useEffect(() => {
    if (active === "inbox") inbox.markSeen();
  }, [active, inboxItems.length, inbox.markSeen]);

  useEffect(() => {
    if (active === "notes") notesBadge.markSeen();
  }, [active, notes.length, notesBadge.markSeen]);

  useEffect(() => {
    if (active === "customers") customersBadge.markSeen();
  }, [active, customers.length, customersBadge.markSeen]);

  useEffect(() => {
    if (active === "knowledge") knowledge.markSeen();
  }, [active, kbFiles.length, knowledge.markSeen]);

  useEffect(() => {
    if (active === "cron") cron.markSeen();
  }, [active, cronDone, cron.markSeen]);

  return {
    board: board.unread,
    inbox: inbox.unread,
    notes: notesBadge.unread,
    customers: customersBadge.unread,
    knowledge: knowledge.unread,
    cron: cron.unread,
  };
}
