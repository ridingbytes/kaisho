import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Clock,
  ListChecks,
  SquareCheck,
} from "lucide-react";
import type { Project } from "../../types";
import { formatDateLabel } from "../../utils/dateLabel";
import { formatHours } from "../../utils/formatting";
import {
  milestoneProgress,
  statusClasses,
} from "./projectStatus";

interface Props {
  project: Project;
  onOpen: (id: string) => void;
}

/** A project tile in the projects grid. */
export function ProjectCard({ project, onOpen }: Props) {
  const { t } = useTranslation("projects");
  const progress = milestoneProgress(project.milestones);
  const doneCount = project.milestones.filter(
    (m) => m.done,
  ).length;

  return (
    <button
      onClick={() => onOpen(project.id)}
      style={{
        borderLeftColor: project.color || undefined,
      }}
      className={[
        "text-left rounded-lg border border-border border-l-4",
        "bg-surface-card p-4 transition-colors min-h-[8rem]",
        "hover:border-cta/50 flex flex-col gap-3 w-full",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-fg-strong truncate">
            {project.name}
          </div>
          {project.customer && (
            <div className={[
              "mt-0.5 inline-block px-1.5 py-0.5 rounded",
              "text-2xs font-semibold uppercase",
              "tracking-wider bg-cta-muted text-cta-hover",
            ].join(" ")}>
              {project.customer}
            </div>
          )}
        </div>
        <span className={[
          "shrink-0 px-1.5 py-0.5 rounded text-2xs",
          "font-semibold uppercase tracking-wider",
          statusClasses(project.status),
        ].join(" ")}>
          {t(`status_${project.status}`, project.status)}
        </span>
      </div>

      {project.tags && project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded text-2xs bg-surface-overlay text-fg-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {project.description && (
        <p className="text-xs text-fg-muted line-clamp-2">
          {project.description}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2">
        {progress !== null && (
          <div className="flex items-center gap-2">
            <ListChecks
              size={13} className="text-fg-subtle shrink-0"
            />
            <div className="flex-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
              <div
                className="h-full bg-cta rounded-full"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="text-2xs text-fg-muted tabular-nums">
              {doneCount}/{project.milestones.length}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 text-2xs text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <SquareCheck size={12} className="text-fg-subtle" />
            {project.task_count ?? 0}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock size={12} className="text-fg-subtle" />
            {formatHours(project.minutes ?? 0)}
          </span>
          {project.due && (
            <span className="inline-flex items-center gap-1 ml-auto">
              <CalendarClock size={12} />
              {formatDateLabel(project.due)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
