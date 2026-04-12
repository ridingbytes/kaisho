import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ChevronDown,
  ChevronRight,
  ArchiveRestore,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  useArchivedTasks,
  useDeleteArchivedTask,
  useMoveTask,
  useTasks,
  useUnarchiveTask,
} from "../../hooks/useTasks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reorderTasks as apiReorderTasks } from "../../api/client";
import { useReorderStates, useSettings } from "../../hooks/useSettings";
import type { ArchivedTask, Task } from "../../types";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { Toggle } from "../common/Toggle";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import { TaskCard } from "./TaskCard";
import { KanbanColumn } from "./KanbanColumn";
import { registerPanelAction } from "../../utils/panelActions";
import { usePendingSearch } from "../../context/ViewContext";
import { stripCustomerPrefix } from "../../utils/customerPrefix";

/**
 * Merge a prefixed filter token into a search string.
 * For "tags", appends comma-separated values (additive).
 * For others, replaces an existing token with same prefix.
 */
/**
 * Merge a prefixed filter token into a search string.
 * For "tags", appends comma-separated values (additive).
 * For others, replaces an existing token with same prefix.
 */
function mergeSearchToken(
  current: string, prefix: string, value: string,
): string {
  const re = new RegExp(`${prefix}:(\\S+)`);
  const m = current.match(re);
  if (m) {
    if (prefix === "tags") {
      const existing = m[1].split(",");
      if (existing.includes(value)) return current;
      const merged = [...existing, value].join(",");
      return current
        .replace(re, `${prefix}:${merged}`)
        .trim();
    }
    return current
      .replace(re, `${prefix}:${value}`)
      .trim();
  }
  return `${current} ${prefix}:${value}`.trim();
}

/** Remove a prefixed token from the search string. */
function removeSearchToken(
  current: string, prefix: string,
): string {
  const re = new RegExp(`${prefix}:\\S+`);
  return current.replace(re, "").replace(/\s+/g, " ").trim();
}

const FILTER_PREFIXES = ["customer", "tags", "status"];

/** Extract structured filter tokens from search. */
function parseSearchTokens(
  search: string,
): { prefix: string; value: string }[] {
  const tokens: { prefix: string; value: string }[] = [];
  for (const part of search.split(/\s+/)) {
    const idx = part.indexOf(":");
    if (idx < 1) continue;
    const prefix = part.slice(0, idx);
    if (FILTER_PREFIXES.includes(prefix)) {
      tokens.push({ prefix, value: part.slice(idx + 1) });
    }
  }
  return tokens;
}

/** Return the free-text portion of the search. */
function freeText(search: string): string {
  return search
    .split(/\s+/)
    .filter((p) => {
      const idx = p.indexOf(":");
      if (idx < 1) return true;
      return !FILTER_PREFIXES.includes(p.slice(0, idx));
    })
    .join(" ")
    .trim();
}

function fmtArchiveDate(dateStr: string): string {
  if (!dateStr) return "";
  return dateStr.slice(0, 10);
}

interface ArchiveDrawerProps {
  stateMap: Record<string, { color: string }>;
}

function ArchiveDrawer({ stateMap }: ArchiveDrawerProps) {
  const [open, setOpen] = useState(false);
  const { data: archived = [] } = useArchivedTasks();
  const unarchive = useUnarchiveTask();
  const deleteArchived = useDeleteArchivedTask();

  return (
    <div className="border-t border-border-subtle bg-surface shrink-0">
      <button
        className="flex items-center gap-2 w-full px-6 py-2.5 text-xs text-stone-600 hover:text-stone-900 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown size={12} />
        ) : (
          <ChevronRight size={12} />
        )}
        <span className="font-semibold uppercase tracking-wide">
          Archive
        </span>
        <span className="ml-1 text-stone-500">({archived.length})</span>
      </button>
      {open && (
        <div className="px-6 pb-4 max-h-64 overflow-y-auto">
          {archived.length === 0 ? (
            <p className="text-xs text-stone-500 py-2">No archived tasks.</p>
          ) : (
            <table className="w-full text-xs text-stone-700 border-separate border-spacing-y-0.5">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-stone-500">
                  <th className="text-left pb-1 pr-3 font-medium w-20">
                    Archived
                  </th>
                  <th className="text-left pb-1 pr-3 font-medium w-24">
                    Customer
                  </th>
                  <th className="text-left pb-1 pr-3 font-medium">Title</th>
                  <th className="text-left pb-1 pr-3 font-medium w-20">
                    Status
                  </th>
                  <th className="pb-1 w-16" />
                </tr>
              </thead>
              <tbody>
                {archived.map((task: ArchivedTask) => {
                  const state = stateMap[task.archive_status];
                  return (
                    <tr
                      key={task.id}
                      className="group/row hover:bg-surface-overlay rounded"
                    >
                      <td className="pr-3 py-1 font-mono text-stone-500 whitespace-nowrap">
                        {fmtArchiveDate(task.archived_at)}
                      </td>
                      <td className="pr-3 py-1 whitespace-nowrap">
                        {task.customer && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-cta-muted text-cta-hover">
                            {task.customer}
                          </span>
                        )}
                      </td>
                      <td className="pr-3 py-1 text-stone-800 truncate max-w-xs">
                        {stripCustomerPrefix(task.title)}
                      </td>
                      <td className="pr-3 py-1 whitespace-nowrap">
                        {state ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                            style={{ backgroundColor: state.color }}
                          >
                            {task.archive_status}
                          </span>
                        ) : (
                          <span className="text-stone-500">
                            {task.archive_status}
                          </span>
                        )}
                      </td>
                      <td className="py-1">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100">
                          <button
                            onClick={() => unarchive.mutate(task.id)}
                            disabled={unarchive.isPending}
                            title="Unarchive"
                            className="p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-all disabled:opacity-40"
                          >
                            <ArchiveRestore size={11} />
                          </button>
                          <ConfirmPopover
                            label={
                              task.clock_count > 0
                                ? `Delete? (${task.clock_count} clock ${task.clock_count === 1 ? "entry" : "entries"} will lose task link)`
                                : "Delete?"
                            }
                            onConfirm={() =>
                              deleteArchived.mutate(task.id)
                            }
                          >
                            <button
                              title="Delete permanently"
                              className="p-1 rounded text-stone-500 hover:text-red-400 transition-all"
                            >
                              <Trash2 size={11} />
                            </button>
                          </ConfirmPopover>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function matchesSearch(
  task: Task, query: string,
): boolean {
  if (!query) return true;
  const parts = query.split(/\s+/);
  return parts.every((part) => {
    const p = part.toLowerCase();
    // customer:NAME filter
    if (p.startsWith("customer:")) {
      const val = p.slice(9);
      return (
        task.customer?.toLowerCase().includes(val)
        ?? false
      );
    }
    // tags:tag1,tag2 filter (all must match)
    if (p.startsWith("tags:")) {
      const vals = p.slice(5).split(",");
      return vals.every((v) =>
        task.tags.some(
          (t) => t.toLowerCase().includes(v),
        ),
      );
    }
    // status:X filter
    if (p.startsWith("status:")) {
      return task.status.toLowerCase()
        === p.slice(7);
    }
    // plain text: match title, customer, or tags
    if (task.title.toLowerCase().includes(p)) {
      return true;
    }
    if (task.customer?.toLowerCase().includes(p)) {
      return true;
    }
    if (
      task.tags.some(
        (t) => t.toLowerCase().includes(p),
      )
    ) {
      return true;
    }
    return false;
  });
}

export function KanbanBoard() {
  const [showDone, setShowDone] = useState(
    () => localStorage.getItem("board_show_done") === "true"
  );
  const [openAddInFirst, setOpenAddInFirst] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: rawTasks = [], isLoading } = useTasks(showDone);
  const tasks = rawTasks.filter((t) => matchesSearch(t, search));
  const { pendingSearch, clearPendingSearch } = usePendingSearch();

  useEffect(
    () => registerPanelAction("board", () =>
      setTimeout(() => setOpenAddInFirst(true), 0),
    ),
    []
  );

  useEffect(() => {
    if (pendingSearch) {
      setSearch(pendingSearch);
      clearPendingSearch();
    }
  }, [pendingSearch, clearPendingSearch]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const { data: settings } = useSettings();
  const moveTask = useMoveTask();
  const reorderStates = useReorderStates();
  const qc = useQueryClient();
  const reorderTasksMut = useMutation({
    mutationFn: (ids: string[]) =>
      apiReorderTasks(ids),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["tasks"],
      });
    },
  });
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [pendingStatus, setPendingStatus] = useState<
    Record<string, string>
  >({});

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const states =
    settings?.task_states.filter((s) => showDone || !s.done) ?? [];
  const colCount = states.length;

  // Responsive column width: snap to 2, 3, or all columns
  const boardRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState<
    number | undefined
  >(undefined);

  useEffect(() => {
    const el = boardRef.current;
    if (!el || colCount === 0) return;
    const GAP = 16; // gap-4
    const PAD = 48; // p-6 * 2
    function calc() {
      if (!el) return;
      const avail = el.clientWidth - PAD;
      // How many columns fit at min 220px each?
      const fit = Math.min(
        colCount,
        Math.max(1, Math.floor(
          (avail + GAP) / (220 + GAP),
        )),
      );
      setColWidth(
        Math.floor((avail - (fit - 1) * GAP) / fit),
      );
    }
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [colCount]);

  const stateMap = Object.fromEntries(
    (settings?.task_states ?? []).map((s) => [s.name, s])
  );

  function isColumnId(id: string): boolean {
    return states.some((s) => s.name === id);
  }

  function getTaskStatus(task: Task): string {
    return pendingStatus[task.id] ?? task.status;
  }

  function tasksByStatus(statusName: string): Task[] {
    return tasks.filter((t) => getTaskStatus(t) === statusName);
  }

  function onDragStart({ active }: DragStartEvent) {
    if (isColumnId(String(active.id))) return;
    const task = tasks.find((t) => t.id === String(active.id));
    setActiveTask(task ?? null);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    // Don't handle card-hover logic when dragging a column
    if (isColumnId(String(active.id))) return;
    const overId = String(over.id);
    // Check if dragging over a column (droppable id = status name)
    if (states.some((s) => s.name === overId)) {
      setPendingStatus((prev) => ({
        ...prev,
        [String(active.id)]: overId,
      }));
    } else {
      // Dragging over another card — use that card's status
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        setPendingStatus((prev) => ({
          ...prev,
          [String(active.id)]: getTaskStatus(overTask),
        }));
      }
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const activeId = String(active.id);

    // Column reorder
    if (isColumnId(activeId)) {
      if (over && activeId !== String(over.id)) {
        const oldIdx = states.findIndex((s) => s.name === activeId);
        const newIdx = states.findIndex((s) => s.name === String(over.id));
        if (oldIdx !== -1 && newIdx !== -1) {
          const reordered = arrayMove(states, oldIdx, newIdx);
          reorderStates.mutate(reordered.map((s) => s.name));
        }
      }
      setActiveTask(null);
      setPendingStatus({});
      return;
    }

    // Card move
    const newStatus = pendingStatus[activeId];
    const task = tasks.find((t) => t.id === activeId);

    if (newStatus && task && newStatus !== task.status) {
      moveTask.mutate({
        taskId: activeId, status: newStatus,
      });
    } else if (over && activeId !== String(over.id)) {
      // Within-column reorder
      const status = task?.status;
      if (status) {
        const column = tasksByStatus(status);
        const oldIdx = column.findIndex(
          (t) => t.id === activeId,
        );
        const newIdx = column.findIndex(
          (t) => t.id === String(over.id),
        );
        if (oldIdx !== -1 && newIdx !== -1) {
          const reordered = arrayMove(
            column, oldIdx, newIdx,
          );
          reorderTasksMut.mutate(
            reordered.map((t) => t.id),
          );
        }
      }
    }

    setActiveTask(null);
    setPendingStatus({});
  }

  function onDragCancel() {
    setActiveTask(null);
    setPendingStatus({});
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-stone-500 text-sm">Loading tasks…</div>
      </div>
    );
  }

  const activeState = activeTask
    ? stateMap[getTaskStatus(activeTask)]
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-sm font-semibold text-stone-800 tracking-wide uppercase">
          Board
        </h1>
        <button
          onClick={() => setOpenAddInFirst(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-stone-600 hover:text-cta hover:bg-cta-muted transition-colors"
          title="New task (double-tap B)"
        >
          <Plus size={12} />
          New
        </button>
        <div className="flex items-center gap-1.5 ml-2">
          <div className="relative flex items-center">
            <Search
              size={11}
              className={[
                "absolute left-2 pointer-events-none",
                "text-stone-500",
              ].join(" ")}
            />
            <input
              ref={searchRef}
              value={freeText(search)}
              onChange={(e) => {
                const text = e.target.value;
                setSearch((prev) => {
                  const tokens = parseSearchTokens(prev);
                  const parts = tokens.map(
                    (t) => `${t.prefix}:${t.value}`,
                  );
                  return [...parts, text]
                    .filter(Boolean)
                    .join(" ");
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearch("");
                  searchRef.current?.blur();
                }
              }}
              placeholder={
                parseSearchTokens(search).length
                  ? "Add text…"
                  : "Search tasks…"
              }
              className={[
                "pl-6 pr-6 py-1 text-xs rounded",
                "bg-surface-raised border border-border",
                "text-stone-800 placeholder-stone-500",
                "focus:outline-none focus:border-cta",
                "w-44",
              ].join(" ")}
            />
            {freeText(search) && (
              <button
                onClick={() =>
                  setSearch((prev) =>
                    parseSearchTokens(prev)
                      .map((t) => `${t.prefix}:${t.value}`)
                      .join(" "),
                  )
                }
                className={[
                  "absolute right-1.5",
                  "text-stone-500 hover:text-stone-700",
                ].join(" ")}
              >
                <X size={10} />
              </button>
            )}
          </div>
          {parseSearchTokens(search).map((t) => (
            <button
              key={t.prefix}
              onClick={() =>
                setSearch((s) => removeSearchToken(s, t.prefix))
              }
              className={[
                "inline-flex items-center gap-1",
                "px-1.5 py-0.5 rounded text-[10px]",
                "font-semibold transition-colors",
                "bg-cta-muted text-cta-hover",
                "hover:bg-red-100 hover:text-red-600",
                "group/badge",
              ].join(" ")}
              title={`Remove ${t.prefix} filter`}
            >
              <span className="uppercase tracking-wider">
                {t.prefix}
              </span>
              <span className="font-normal">{t.value}</span>
              <X
                size={9}
                className={[
                  "opacity-0 group-hover/badge:opacity-100",
                  "transition-opacity",
                ].join(" ")}
              />
            </button>
          ))}
          {search && (
            <button
              onClick={() => setSearch("")}
              className={[
                "p-1 rounded text-stone-400",
                "hover:text-stone-700 hover:bg-stone-100",
                "transition-colors",
              ].join(" ")}
              title="Clear all filters"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 ml-auto cursor-pointer">
          <span className="text-xs text-stone-600">Show done</span>
          <Toggle
            checked={showDone}
            onChange={(v) => {
              localStorage.setItem("board_show_done", String(v));
              setShowDone(v);
            }}
          />
        </label>
        <HelpButton title="Board" doc={DOCS.board} view="board" />
      </div>

      {/* Board */}
      <div
        ref={boardRef}
        className="flex-1 overflow-x-auto overflow-y-hidden min-h-0"
      >
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <SortableContext
            items={states.map((s) => s.name)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-4 p-6 h-full items-stretch">
              {states.map((state, idx) => (
                <KanbanColumn
                  key={state.name}
                  state={state}
                  tasks={tasksByStatus(state.name)}
                  columnWidth={colWidth}
                  openAdd={idx === 0 && openAddInFirst}
                  onAddOpened={() => setOpenAddInFirst(false)}
                  onTagClick={(tag) =>
                    setSearch((s) =>
                      mergeSearchToken(s, "tags", tag)
                    )
                  }
                  onCustomerClick={(c) =>
                    setSearch((s) =>
                      mergeSearchToken(s, "customer", c)
                    )
                  }
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeTask && activeState ? (
              <TaskCard
                task={activeTask}
                statusColor={activeState.color}
                isDragOverlay
              />
            ) : null}
          </DragOverlay>

        </DndContext>
      </div>

      {/* Archive drawer */}
      <ArchiveDrawer stateMap={stateMap} />
    </div>
  );
}
