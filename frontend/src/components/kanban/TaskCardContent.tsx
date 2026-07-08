/**
 * TaskCardContent -- Read-only display section of a task card
 * showing customer badge, title, description, GitHub link,
 * tags, creation date, and clock entries.
 */
import { useTranslation } from "react-i18next";
import {
  GitBranch,
  ListRestart,
} from "lucide-react";
import { RelDate } from "../common/RelDate";
import { NotesBubble } from "../common/NotesBubble";
import {
  handleLinkClick,
} from "../common/LinkPopover";
import { tagBadgeStyle } from "../../utils/tagColors";
import { useUpdateTask } from "../../hooks/useTasks";
import { stripCustomerPrefix } from "../../utils/customerPrefix";
import { TimerBadge } from "./TimerBadge";
import { ProjectBadge } from "../projects/ProjectBadge";
import { TaskClockSection } from "./TaskClockSection";
import type { Task } from "../../types";

function extractIssueNumber(url: string): string {
  const m = url.match(/\/(\d+)$/);
  return m ? m[1] : "issue";
}

interface TagDef {
  name: string;
  color: string;
}

interface TaskCardContentProps {
  task: Task;
  customerColors: Record<string, string>;
  allTags: TagDef[];
  isTimerRunning: boolean;
  activeTimerStart?: string;
  onStopTimer: () => void;
  onCustomerClick?: (customer: string) => void;
  onTagClick?: (tag: string) => void;
  onHistoryOpen: () => void;
  openOverlay: (url: string) => void;
}

/**
 * Renders the read-only body of a task card: customer
 * badge, title, collapsible description with markdown,
 * GitHub issue link, tag badges, timestamps, and the
 * clock entries section.
 */
export function TaskCardContent({
  task,
  customerColors,
  allTags,
  isTimerRunning,
  activeTimerStart,
  onStopTimer,
  onCustomerClick,
  onTagClick,
  onHistoryOpen,
  openOverlay,
}: TaskCardContentProps) {
  const { t } = useTranslation("kanban");
  const { t: tc } = useTranslation("common");
  const updateTask = useUpdateTask();

  function handleBodyToggle(md: string) {
    updateTask.mutate({
      taskId: task.id,
      updates: { body: md },
    });
  }

  return (
    <>
      {(task.customer ||
        task.project ||
        (isTimerRunning && activeTimerStart)) && (
        <div className="mb-1.5 flex items-center gap-1.5 flex-wrap">
          {task.customer && (
            <button
              onPointerDown={(e) =>
                e.stopPropagation()
              }
              onClick={() =>
                onCustomerClick?.(task.customer!)
              }
              className={[
                "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded",
                "text-2xs font-semibold tracking-wider uppercase",
                "bg-cta-muted text-cta-hover",
                "hover:bg-cta/10 transition-colors cursor-pointer",
              ].join(" ")}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  background:
                    customerColors[task.customer] ||
                    "#a1a1aa",
                }}
              />
              {task.customer}
            </button>
          )}
          {task.project && (
            <ProjectBadge projectId={task.project} />
          )}
          {isTimerRunning && activeTimerStart && (
            <TimerBadge
              start={activeTimerStart}
              onStop={onStopTimer}
            />
          )}
        </div>
      )}
      <p className="text-sm font-medium text-fg-strong leading-snug mb-1">
        {stripCustomerPrefix(task.title)}
      </p>
      {task.body && (
        <div className="mb-1.5">
          <NotesBubble
            icon="description"
            label={tc("description")}
            value={task.body}
            title={stripCustomerPrefix(task.title)}
            bucketId={task.id}
            saving={updateTask.isPending}
            onSave={handleBodyToggle}
          />
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {task.github_url && (
          <a
            href={task.github_url}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(e) =>
              e.stopPropagation()
            }
            onClick={(e) =>
              handleLinkClick(e, openOverlay)
            }
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium bg-surface-overlay border border-border-subtle text-fg hover:text-cta hover:border-cta transition-colors"
            title={task.github_url}
          >
            <GitBranch size={10} />
            #{extractIssueNumber(task.github_url)}
          </a>
        )}
        {task.tags.map((tagName) => {
          const def = allTags.find(
            (t) => t.name === tagName,
          );
          return def ? (
            <button
              key={tagName}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onTagClick?.(tagName)}
              className="px-1.5 py-0.5 rounded text-2xs font-semibold hover:opacity-80 transition-opacity"
              style={tagBadgeStyle(def.color)}
            >
              {tagName}
            </button>
          ) : (
            <button
              key={tagName}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onTagClick?.(tagName)}
              className="px-1.5 py-0.5 rounded text-2xs font-medium bg-surface-overlay text-fg border border-border-subtle hover:border-cta hover:text-cta transition-colors"
            >
              {tagName}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <RelDate
            date={task.created}
            className="text-2xs text-fg-muted"
          />
          {task.state_history &&
            task.state_history.length > 0 && (
              <button
                onPointerDown={(e) =>
                  e.stopPropagation()
                }
                onClick={onHistoryOpen}
                className="p-0.5 rounded text-fg-subtle hover:text-cta transition-colors"
                title={t("stateHistory")}
              >
                <ListRestart size={9} />
              </button>
            )}
        </span>
      </div>
      <TaskClockSection task={task} />
    </>
  );
}
