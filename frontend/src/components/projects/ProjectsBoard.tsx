import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BoardColumnShell } from "../board/BoardColumnShell";
import { ProjectCard } from "./ProjectCard";
import { PROJECT_STATUSES } from "./projectStatus";
import {
  useReorderProjects,
  useUpdateProject,
} from "../../hooks/useProjects";
import { useCollapsedColumns } from "../../hooks/useCollapsedColumns";
import type { Project } from "../../types";

const STATUSES: readonly string[] = PROJECT_STATUSES;
const ORDER_KEY = "projects_board_order";

function statusColor(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "#10b981";
    case "ON_HOLD":
      return "#f59e0b";
    case "COMPLETED":
      return "#6366f1";
    default:
      return "#a1a1aa";
  }
}

/** Load a persisted column order, healing against added or
 * removed statuses so it always covers exactly STATUSES. */
function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    const saved: string[] = raw ? JSON.parse(raw) : [];
    const kept = saved.filter((s) => STATUSES.includes(s));
    const missing = STATUSES.filter((s) => !kept.includes(s));
    return [...kept, ...missing];
  } catch {
    return [...STATUSES];
  }
}

/** A project card that can be dragged between columns. */
function SortableCard({
  project, onOpen,
}: {
  project: Project;
  onOpen: (id: string) => void;
}) {
  const {
    setNodeRef, attributes, listeners, transform,
    transition, isDragging,
  } = useSortable({ id: project.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <ProjectCard project={project} onOpen={onOpen} />
    </div>
  );
}

/** Projects as status columns, matching the task board:
 * grip-drag to reorder columns, chevron to collapse (both
 * persisted), and drag a card to another column to change
 * its status. */
export function ProjectsBoard({
  projects, onOpen,
}: {
  projects: Project[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation("projects");
  const update = useUpdateProject();
  const reorder = useReorderProjects();
  const { isCollapsed, toggle } = useCollapsedColumns(
    "projects_collapsed_columns",
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const [order, setOrder] = useState<string[]>(loadOrder);
  useEffect(() => {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  }, [order]);

  function byStatus(status: string): Project[] {
    return projects.filter((p) => {
      const s = STATUSES.includes(p.status)
        ? p.status
        : "ACTIVE";
      return s === status;
    });
  }

  function isColumnId(id: string): boolean {
    return STATUSES.includes(id);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Column reorder. The pointer often sits over a card
    // rather than the column itself, so resolve the target
    // column from the card under it — otherwise the drop is
    // ignored and the column snaps back.
    if (isColumnId(activeId)) {
      let target = overId;
      if (!isColumnId(target)) {
        const overCard = projects.find((p) => p.id === target);
        target = overCard
          ? (STATUSES.includes(overCard.status)
              ? overCard.status
              : "ACTIVE")
          : activeId;
      }
      if (activeId !== target && isColumnId(target)) {
        const from = order.indexOf(activeId);
        const to = order.indexOf(target);
        if (from !== -1 && to !== -1) {
          setOrder(arrayMove(order, from, to));
        }
      }
      return;
    }

    // Card drag.
    const proj = projects.find((p) => p.id === activeId);
    if (!proj) return;
    const overCard = projects.find((p) => p.id === overId);
    const status = isColumnId(overId)
      ? overId
      : (overCard?.status ?? proj.status);

    // Dropped in a different column → change status.
    if (STATUSES.includes(status) && proj.status !== status) {
      update.mutate({ id: proj.id, updates: { status } });
      return;
    }
    // Dropped on another card in the same column → reorder.
    if (overCard && overCard.id !== proj.id) {
      const ids = projects.map((p) => p.id);
      const from = ids.indexOf(proj.id);
      const to = ids.indexOf(overCard.id);
      if (from !== -1 && to !== -1) {
        reorder.mutate(arrayMove(ids, from, to));
      }
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2 h-[calc(100vh-220px)]">
        <SortableContext
          items={order}
          strategy={horizontalListSortingStrategy}
        >
          {order.map((s) => {
            const items = byStatus(s);
            return (
              <BoardColumnShell
                key={s}
                id={s}
                label={t(`status_${s}`, s.replace("_", " "))}
                color={statusColor(s)}
                count={items.length}
                collapsed={isCollapsed(s)}
                onToggleCollapsed={() => toggle(s)}
                width={320}
              >
                <SortableContext
                  items={items.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {items.map((p) => (
                    <SortableCard
                      key={p.id}
                      project={p}
                      onOpen={onOpen}
                    />
                  ))}
                </SortableContext>
              </BoardColumnShell>
            );
          })}
        </SortableContext>
      </div>
    </DndContext>
  );
}
