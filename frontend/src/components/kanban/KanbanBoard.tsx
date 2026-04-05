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
import { ChevronDown, ChevronRight, ArchiveRestore } from "lucide-react";
import { useState } from "react";
import {
  useArchivedTasks,
  useMoveTask,
  useTasks,
  useUnarchiveTask,
} from "../../hooks/useTasks";
import { useSettings } from "../../hooks/useSettings";
import type { ArchivedTask, Task } from "../../types";
import { Toggle } from "../common/Toggle";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import { TaskCard } from "./TaskCard";
import { KanbanColumn } from "./KanbanColumn";

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
        className="flex items-center gap-2 w-full px-6 py-2.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
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
        <span className="ml-1 text-slate-600">({archived.length})</span>
      </button>
      {open && (
        <div className="px-6 pb-4 max-h-64 overflow-y-auto">
          {archived.length === 0 ? (
            <p className="text-xs text-slate-600 py-2">No archived tasks.</p>
          ) : (
            <table className="w-full text-xs text-slate-400 border-separate border-spacing-y-0.5">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-600">
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
                      <td className="pr-3 py-1 font-mono text-slate-600 whitespace-nowrap">
                        {fmtArchiveDate(task.archived_at)}
                      </td>
                      <td className="pr-3 py-1 whitespace-nowrap">
                        {task.customer && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-accent-muted text-accent-hover">
                            {task.customer}
                          </span>
                        )}
                      </td>
                      <td className="pr-3 py-1 text-slate-300 truncate max-w-xs">
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
                          <span className="text-slate-600">
                            {task.archive_status}
                          </span>
                        )}
                      </td>
                      <td className="py-1">
                        <button
                          onClick={() => unarchive.mutate(task.id)}
                          disabled={unarchive.isPending}
                          title="Unarchive"
                          className="opacity-0 group-hover/row:opacity-100 p-1 rounded text-slate-600 hover:text-accent hover:bg-accent-muted transition-all disabled:opacity-40"
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

export function KanbanBoard() {
  const [showDone, setShowDone] = useState(false);
  const { data: tasks = [], isLoading } = useTasks(showDone);
  const { data: settings } = useSettings();
  const moveTask = useMoveTask();
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

  function getTaskStatus(task: Task): string {
    return pendingStatus[task.id] ?? task.status;
  }

  function tasksByStatus(statusName: string): Task[] {
    return tasks.filter((t) => getTaskStatus(t) === statusName);
  }

  function onDragStart({ active }: DragStartEvent) {
    const task = tasks.find((t) => t.id === String(active.id));
    setActiveTask(task ?? null);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
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

  function onDragEnd({ active }: DragEndEvent) {
    const taskId = String(active.id);
    const newStatus = pendingStatus[taskId];
    const task = tasks.find((t) => t.id === taskId);

    if (newStatus && task && newStatus !== task.status) {
      moveTask.mutate({ taskId, status: newStatus });
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
        <div className="text-slate-600 text-sm">Loading tasks…</div>
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
        <h1 className="text-sm font-semibold text-slate-300 tracking-wide uppercase">
          Board
        </h1>
        <label className="flex items-center gap-2 ml-auto cursor-pointer">
          <span className="text-xs text-slate-500">Show done</span>
          <Toggle checked={showDone} onChange={setShowDone} />
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
          <div className="flex gap-4 p-6 h-full items-start">
            {states.map((state) => (
              <KanbanColumn
                key={state.name}
                state={state}
                tasks={tasksByStatus(state.name)}
              />
            ))}
          </div>

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
