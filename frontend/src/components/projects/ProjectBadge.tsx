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

  // Color-code the whole badge with the project's color: a
  // low-alpha tint behind the color as text/icon.
  const color = project.color || "#71717a";
  const style = {
    backgroundColor: `${color}1f`,
    color,
  };

  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => setView("projects", projectId)}
      style={style}
      className={[
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded",
        "text-2xs font-semibold uppercase tracking-wider",
        "hover:brightness-110 transition-all cursor-pointer",
        "max-w-full truncate align-middle",
      ].join(" ")}
      title={project.name}
    >
      <FolderKanban size={10} className="shrink-0" />
      <span className="truncate">{project.name}</span>
    </button>
  );
}
