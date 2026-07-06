import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
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
const ORDER_KEY = "projects_board_order";
const COLLAPSED_KEY = "projects_board_collapsed";

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

function loadCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
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
  status, projects, onOpen, collapsed, onToggleCollapse,
  canMoveLeft, canMoveRight, onMove,
}: {
  status: string;
  projects: Project[];
  onOpen: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useTranslation("projects");
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const label = t(`status_${status}`, status);

  if (collapsed) {
    return (
      <button
        ref={setNodeRef}
        onClick={onToggleCollapse}
        title={label}
        className={[
          "w-10 shrink-0 rounded-lg border border-dashed",
          "min-h-[70vh] flex flex-col items-center gap-2 py-2",
          "transition-colors",
          isOver
            ? "border-cta bg-cta-muted/20"
            : "border-border bg-surface-card/30 hover:border-cta/50",
        ].join(" ")}
      >
        <span
          className={[
            "w-2 h-2 rounded-full shrink-0",
            statusDot(status),
          ].join(" ")}
        />
        <span className="text-2xs text-fg-subtle tabular-nums">
          {projects.length}
        </span>
        <span
          className="text-2xs font-semibold uppercase tracking-wider text-fg-muted"
          style={{ writingMode: "vertical-rl" }}
        >
          {label}
        </span>
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={[
        "w-80 shrink-0 rounded-lg border border-dashed p-2",
        "flex flex-col min-h-[70vh] transition-colors",
        isOver
          ? "border-cta bg-cta-muted/20"
          : "border-border bg-surface-card/30",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 px-1 pb-2">
        <span
          className={[
            "w-2 h-2 rounded-full shrink-0",
            statusDot(status),
          ].join(" ")}
        />
        <span className="text-2xs font-semibold uppercase tracking-wider text-fg-muted">
          {label}
        </span>
        <span className="text-2xs text-fg-subtle tabular-nums">
          {projects.length}
        </span>
        <div className="ml-auto flex items-center text-fg-subtle">
          <button
            onClick={() => onMove(-1)}
            disabled={!canMoveLeft}
            className="p-0.5 rounded hover:text-fg disabled:opacity-30"
            title={t("moveLeft")}
          >
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={!canMoveRight}
            className="p-0.5 rounded hover:text-fg disabled:opacity-30"
            title={t("moveRight")}
          >
            <ChevronRight size={13} />
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-0.5 rounded hover:text-fg"
            title={t("collapse")}
          >
            <ChevronsLeft size={13} />
          </button>
        </div>
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
 * column to change its status. Columns are collapsible and
 * reorderable, persisted to localStorage. */
export function ProjectsBoard({
  projects, onOpen,
}: {
  projects: Project[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation("projects");
  const update = useUpdateProject();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const [order, setOrder] = useState<string[]>(loadOrder);
  const [collapsed, setCollapsed] = useState<string[]>(
    loadCollapsed,
  );

  useEffect(() => {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  }, [order]);
  useEffect(() => {
    localStorage.setItem(
      COLLAPSED_KEY, JSON.stringify(collapsed),
    );
  }, [collapsed]);

  const byStatus = useMemo(() => {
    const map: Record<string, Project[]> = {};
    STATUSES.forEach((s) => (map[s] = []));
    for (const p of projects) {
      const s = STATUSES.includes(p.status) ? p.status : "ACTIVE";
      map[s].push(p);
    }
    return map;
  }, [projects]);

  function moveColumn(status: string, dir: -1 | 1) {
    setOrder((cur) => {
      const i = cur.indexOf(status);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function toggleCollapse(status: string) {
    setCollapsed((cur) =>
      cur.includes(status)
        ? cur.filter((s) => s !== status)
        : [...cur, status],
    );
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const status = String(over.id);
    const proj = projects.find((p) => p.id === active.id);
    if (
      proj && proj.status !== status && STATUSES.includes(status)
    ) {
      update.mutate({ id: proj.id, updates: { status } });
    }
  }

  const collapsedSet = new Set(collapsed);
  const allCollapsed = order.every((s) => collapsedSet.has(s));

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {collapsed.length > 0 && (
        <button
          onClick={() => setCollapsed([])}
          className="mb-2 inline-flex items-center gap-1 text-2xs text-cta hover:underline"
        >
          <ChevronsRight size={12} /> {t("expandAll")}
        </button>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {order.map((s, i) => (
          <Column
            key={s}
            status={s}
            projects={byStatus[s]}
            onOpen={onOpen}
            collapsed={collapsedSet.has(s)}
            onToggleCollapse={() => toggleCollapse(s)}
            canMoveLeft={i > 0}
            canMoveRight={i < order.length - 1}
            onMove={(dir) => moveColumn(s, dir)}
          />
        ))}
      </div>
      {allCollapsed && (
        <p className="text-xs text-fg-muted mt-2">
          {t("allColumnsCollapsed")}
        </p>
      )}
    </DndContext>
  );
}
