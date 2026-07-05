import { FolderKanban } from "lucide-react";
import { useProjects } from "../../hooks/useProjects";
import { useSetView } from "../../context/ViewContext";

interface Props {
  projectId: string;
}

/** A small clickable badge showing a task's project.
 * Navigates to the project workspace. Renders nothing if
 * the project no longer exists. */
export function ProjectBadge({ projectId }: Props) {
  const { data: projects = [] } = useProjects(true);
  const setView = useSetView();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;

  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => setView("projects", projectId)}
      className={[
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded",
        "text-2xs font-medium bg-surface-overlay text-fg-muted",
        "hover:text-cta transition-colors cursor-pointer",
        "max-w-full truncate",
      ].join(" ")}
      title={project.name}
    >
      <FolderKanban size={10} className="shrink-0" />
      <span className="truncate">{project.name}</span>
    </button>
  );
}
