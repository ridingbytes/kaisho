import { useTranslation } from "react-i18next";
import { FolderKanban } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { useProjects } from "../../hooks/useProjects";
import { useSetView } from "../../context/ViewContext";
import { statusClasses } from "../projects/projectStatus";
import { formatHours } from "../../utils/formatting";

interface Props {
  customerName: string;
}

/** Projects belonging to a customer, shown on the customer
 * card like tasks and time entries. */
export function CustomerProjectsSection({ customerName }: Props) {
  const { t } = useTranslation("customers");
  const { t: tp } = useTranslation("projects");
  const { data: projects = [] } = useProjects(true);
  const setView = useSetView();

  const mine = projects.filter(
    (p) =>
      (p.customer || "").toLowerCase()
      === customerName.toLowerCase(),
  );

  return (
    <CollapsibleSection
      label={t("projects")}
      count={mine.length}
      icon={<FolderKanban size={12} />}
    >
      <div className="ml-5">
        {mine.length === 0 ? (
          <p className="text-2xs text-fg-muted py-1">
            {t("noProjects")}
          </p>
        ) : (
          mine.map((p) => (
            <button
              key={p.id}
              onClick={() => setView("projects", p.id)}
              className="flex items-center gap-2 w-full text-left py-1 px-1 rounded hover:bg-surface-overlay/40"
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: p.color || "#a1a1aa" }}
              />
              <span className="flex-1 text-xs truncate">
                {p.name}
              </span>
              {(p.minutes ?? 0) > 0 && (
                <span className="text-2xs text-fg-muted tabular-nums">
                  {formatHours(p.minutes ?? 0)}
                </span>
              )}
              <span
                className={[
                  "px-1 py-0.5 rounded text-2xs font-semibold",
                  "uppercase tracking-wider",
                  statusClasses(p.status),
                ].join(" ")}
              >
                {tp(`status_${p.status}`, p.status)}
              </span>
            </button>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}
