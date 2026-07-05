import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ProjectCard } from "./ProjectCard";
import { PROJECT_STATUSES } from "./projectStatus";
import { useUpdateProject } from "../../hooks/useProjects";
import type { Project } from "../../types";

const STATUSES: readonly string[] = PROJECT_STATUSES;

/** Colored status dot, matching the task board's column
 * headers. */
function statusDot(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-500";
    case "ON_HOLD":
      return "bg-amber-500";
    case "COMPLETED":
      return "bg-cta";
    default:
      return "bg-fg-subtle";
  }
}

function DraggableCard({
  project, onOpen,
}: {
  project: Project;
  onOpen: (id: string) => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, isDragging,
  } = useDraggable({ id: project.id });
  const style = transform
    ? {
        transform:
          `translate(${transform.x}px, ${transform.y}px)`,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
    >
      <ProjectCard project={project} onOpen={onOpen} />
    </div>
  );
}

function Column({
  status, projects, onOpen,
}: {
  status: string;
  projects: Project[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation("projects");
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={[
        "w-80 shrink-0 rounded-lg border p-2",
        "flex flex-col transition-colors",
        isOver
          ? "border-cta bg-cta-muted/20"
          : "border-border bg-surface-card/40",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 px-1 pb-2">
        <span
          className={[
            "w-2 h-2 rounded-full shrink-0",
            statusDot(status),
          ].join(" ")}
        />
        <span className="text-2xs font-semibold uppercase tracking-wider text-fg-muted">
          {t(`status_${status}`, status)}
        </span>
        <span className="text-2xs text-fg-subtle tabular-nums">
          {projects.length}
        </span>
      </div>
      <div className="space-y-2 min-h-[40px]">
        {projects.map((p) => (
          <DraggableCard
            key={p.id}
            project={p}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

/** Projects as status columns; drag a card to another
 * column to change its status (like the task board). */
export function ProjectsBoard({
  projects, onOpen,
}: {
  projects: Project[];
  onOpen: (id: string) => void;
}) {
  const update = useUpdateProject();
  const sensors = useSensors(
    // A small activation distance so a plain click still
    // opens the project instead of starting a drag.
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const byStatus = useMemo(() => {
    const map: Record<string, Project[]> = {};
    STATUSES.forEach((s) => (map[s] = []));
    for (const p of projects) {
      const s = STATUSES.includes(p.status) ? p.status : "ACTIVE";
      map[s].push(p);
    }
    return map;
  }, [projects]);

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const status = String(over.id);
    const proj = projects.find((p) => p.id === active.id);
    if (
      proj && proj.status !== status && STATUSES.includes(status)
    ) {
      update.mutate({
        id: proj.id, updates: { status },
      });
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            projects={byStatus[s]}
            onOpen={onOpen}
          />
        ))}
      </div>
    </DndContext>
  );
}
