/**
 * TaskCardContent -- Read-only display section of a task card
 * showing customer badge, title, description, GitHub link,
 * tags, creation date, and clock entries.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  ListRestart,
  Tag,
} from "lucide-react";
import { RelDate } from "../common/RelDate";
import { ContentPopup } from "../common/ContentPopup";
import {
  handleLinkClick,
} from "../common/LinkPopover";
import { tagBadgeStyle } from "../../utils/tagColors";
import { Markdown } from "../common/Markdown";
import { TagDropdown } from "../common/TagDropdown";
import { useSetTaskTags } from "../../hooks/useTasks";
import { stripCustomerPrefix } from "../../utils/customerPrefix";
import { TimerBadge } from "./TimerBadge";
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
  const [bodyExpanded, setBodyExpanded] = useState(
    false,
  );
  const [tagging, setTagging] = useState(false);
  const setTaskTags = useSetTaskTags();

  return (
    <>
      {task.customer && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <button
            onPointerDown={(e) =>
              e.stopPropagation()
            }
            onClick={() =>
              onCustomerClick?.(task.customer!)
            }
            className={[
              "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded",
              "text-[10px] font-semibold tracking-wider uppercase",
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
          {isTimerRunning && activeTimerStart && (
            <TimerBadge
              start={activeTimerStart}
              onStop={onStopTimer}
            />
          )}
        </div>
      )}
      <p className="text-sm font-medium text-stone-900 leading-snug mb-1">
        {stripCustomerPrefix(task.title)}
      </p>
      {task.body && (
        <div className="mb-1.5">
          <div className="flex items-center gap-1">
            <button
              onPointerDown={(e) =>
                e.stopPropagation()
              }
              onClick={() =>
                setBodyExpanded((v) => !v)
              }
              className="flex items-center gap-1 text-[10px] text-stone-500 hover:text-stone-700 transition-colors"
            >
              {bodyExpanded ? (
                <ChevronDown size={10} />
              ) : (
                <ChevronRight size={10} />
              )}
              {tc("description")}
            </button>
            <span
              onPointerDown={(e) =>
                e.stopPropagation()
              }
            >
              <ContentPopup
                content={task.body}
                title={stripCustomerPrefix(
                  task.title,
                )}
                markdown
                iconSize={9}
              />
            </span>
          </div>
          {bodyExpanded && (
            <div
              className="mt-1 pl-1 border-l border-border-subtle"
              onPointerDown={(e) =>
                e.stopPropagation()
              }
            >
              <Markdown
                className="text-xs text-stone-700 [&_p]:mb-1 [&_p]:leading-relaxed break-words [&_a]:break-all"
                onLinkClick={openOverlay}
              >
                {task.body}
              </Markdown>
            </div>
          )}
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
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-overlay border border-border-subtle text-stone-700 hover:text-cta hover:border-cta transition-colors"
            title={task.github_url}
          >
            <GitBranch size={10} />
            #{extractIssueNumber(task.github_url)}
          </a>
        )}
        {tagging ? (
          <div
            onPointerDown={(e) =>
              e.stopPropagation()
            }
          >
            <TagDropdown
              selected={task.tags}
              allTags={allTags}
              autoOpen
              addOnly
              onChange={(tags) => {
                setTaskTags.mutate({
                  taskId: task.id,
                  tags,
                });
              }}
            />
          </div>
        ) : (
          <>
            {task.tags.map((tagName) => {
              const def = allTags.find(
                (t) => t.name === tagName,
              );
              return def ? (
                <button
                  key={tagName}
                  onPointerDown={(e) =>
                    e.stopPropagation()
                  }
                  onClick={() =>
                    onTagClick?.(tagName)
                  }
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold hover:opacity-80 transition-opacity"
                  style={tagBadgeStyle(def.color)}
                >
                  {tagName}
                </button>
              ) : (
                <button
                  key={tagName}
                  onPointerDown={(e) =>
                    e.stopPropagation()
                  }
                  onClick={() =>
                    onTagClick?.(tagName)
                  }
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-overlay text-stone-700 border border-border-subtle hover:border-cta hover:text-cta transition-colors"
                >
                  {tagName}
                </button>
              );
            })}
            <button
              onPointerDown={(e) =>
                e.stopPropagation()
              }
              onClick={() => setTagging(true)}
              className="p-0.5 rounded text-stone-400 hover:text-cta transition-colors"
              title={t("editTags")}
            >
              <Tag size={10} />
            </button>
          </>
        )}
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <RelDate
            date={task.created}
            className="text-[10px] text-stone-500"
          />
          {task.state_history &&
            task.state_history.length > 0 && (
              <button
                onPointerDown={(e) =>
                  e.stopPropagation()
                }
                onClick={onHistoryOpen}
                className="p-0.5 rounded text-stone-400 hover:text-cta transition-colors"
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
