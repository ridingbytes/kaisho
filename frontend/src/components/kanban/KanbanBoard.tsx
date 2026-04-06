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
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  useArchivedTasks,
  useMoveTask,
  useTasks,
  useUnarchiveTask,
} from "../../hooks/useTasks";
import { useReorderStates, useSettings } from "../../hooks/useSettings";
import type { ArchivedTask, Task } from "../../types";
import { Toggle } from "../common/Toggle";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import { TaskCard } from "./TaskCard";
import { KanbanColumn } from "./KanbanColumn";
import { registerPanelAction } from "../../utils/panelActions";
import { usePendingSearch } from "../../context/ViewContext";

const CUSTOMER_PREFIX_RE = /^\[[^\]]+\]:?\s*/;

function stripCustomerPrefix(title: string): string {
  return title.replace(CUSTOMER_PREFIX_RE, "");
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
                  <th className="pb-1 w-8" />
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
                        <button
                          onClick={() => unarchive.mutate(task.id)}
                          disabled={unarchive.isPending}
                          title="Unarchive"
                          className="opacity-0 group-hover/row:opacity-100 p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-all disabled:opacity-40"
                        >
                          <ArchiveRestore size={11} />
                        </button>
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

function matchesSearch(task: Task, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (task.title.toLowerCase().includes(q)) return true;
  if (task.customer?.toLowerCase().includes(q)) return true;
  if (task.tags.some((t) => t.toLowerCase().includes(q))) return true;
  return false;
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
    () => registerPanelAction("board", () => setOpenAddInFirst(true)),
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
      moveTask.mutate({ taskId: activeId, status: newStatus });
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
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
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
        <div className="relative flex items-center ml-2">
          <Search
            size={11}
            className="absolute left-2 text-stone-500 pointer-events-none"
          />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                searchRef.current?.blur();
              }
            }}
            placeholder="Search tasks…"
            className={[
              "pl-6 pr-6 py-1 text-xs rounded",
              "bg-surface-raised border border-border",
              "text-stone-800 placeholder-stone-500",
              "focus:outline-none focus:border-cta",
              "w-44",
            ].join(" ")}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 text-stone-500 hover:text-stone-700"
            >
              <X size={10} />
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
      <div className="flex-1 overflow-x-auto overflow-y-hidden min-h-0">
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
            <div className="flex gap-4 p-6 h-full items-start">
              {states.map((state, idx) => (
                <KanbanColumn
                  key={state.name}
                  state={state}
                  tasks={tasksByStatus(state.name)}
                  openAdd={idx === 0 && openAddInFirst}
                  onAddOpened={() => setOpenAddInFirst(false)}
                  onTagClick={(tag) => setSearch(tag)}
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
