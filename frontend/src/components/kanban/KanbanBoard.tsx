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
import { useState } from "react";
import { useMoveTask, useTasks } from "../../hooks/useTasks";
import { useSettings } from "../../hooks/useSettings";
import type { Task } from "../../types";
import { Toggle } from "../common/Toggle";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import { TaskCard } from "./TaskCard";
import { KanbanColumn } from "./KanbanColumn";

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
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
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
    </div>
  );
}
