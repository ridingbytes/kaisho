/**
 * TaskCard -- Main draggable kanban card that composes
 * sub-components for display, editing, status picking,
 * hover actions, and state history.
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import { useMoveTask } from "../../hooks/useTasks";
import {
  useActiveTimer,
  useStartTimer,
  useStopTimer,
} from "../../hooks/useClocks";
import {
  LinkOverlay,
  useLinkOverlay,
} from "../common/LinkPopover";
import {
  useUpdateTask,
  useArchiveTask,
  useSetTaskTags,
} from "../../hooks/useTasks";
import { useSettings } from "../../hooks/useSettings";
import { stripCustomerPrefix } from "../../utils/customerPrefix";
import type { Task } from "../../types";

import { StatusPicker } from "./StatusPicker";
import { TaskEditForm } from "./TaskEditForm";
import { TaskCardActions } from "./TaskCardActions";
import { TaskCardContent } from "./TaskCardContent";
import { StateHistoryPopup } from "./StateHistoryPopup";

interface TaskCardProps {
  task: Task;
  statusColor: string;
  isDragOverlay?: boolean;
  onTagClick?: (tag: string) => void;
  onCustomerClick?: (customer: string) => void;
}

/**
 * Draggable kanban card. Serves as the composition root
 * for all task card sub-components: content display,
 * inline edit form, clock entries, and hover actions.
 */
export function TaskCard({
  task,
  statusColor,
  isDragOverlay = false,
  onTagClick,
  onCustomerClick,
}: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const customerColors = useCustomerColors();
  const startClock = useStartTimer();
  const markDone = useMoveTask();
  const stopClock = useStopTimer();
  const { data: activeTimer } = useActiveTimer();
  const isTimerRunning = !!(
    activeTimer?.active &&
    activeTimer?.customer === task.customer &&
    activeTimer?.description ===
      stripCustomerPrefix(task.title)
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statePicker, setStatePicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCustomer, setEditCustomer] = useState("");
  const [editTags, setEditTags] = useState<string[]>(
    [],
  );
  const [editBody, setEditBody] = useState("");
  const [editGithubUrl, setEditGithubUrl] = useState(
    "",
  );
  const { overlayUrl, openOverlay, closeOverlay } =
    useLinkOverlay();
  const updateTask = useUpdateTask();
  const setTaskTags = useSetTaskTags();
  const archiveTask = useArchiveTask();
  const { data: settings } = useSettings();
  const allTags = settings?.tags ?? [];

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function startEdit() {
    setEditTitle(stripCustomerPrefix(task.title));
    setEditCustomer(task.customer ?? "");
    setEditTags([...task.tags]);
    setEditBody(task.body ?? "");
    setEditGithubUrl(task.github_url ?? "");
    setEditing(true);
  }

  function handleSave() {
    const tagsChanged =
      JSON.stringify([...editTags].sort()) !==
      JSON.stringify([...task.tags].sort());
    updateTask.mutate(
      {
        taskId: task.id,
        updates: {
          title: editTitle.trim(),
          customer: editCustomer.trim(),
          body: editBody,
          github_url: editGithubUrl,
        },
      },
      {
        onSuccess: () => {
          if (tagsChanged) {
            setTaskTags.mutate(
              {
                taskId: task.id,
                tags: editTags,
              },
              {
                onSuccess: () => {
                  setEditing(false);
                },
              },
            );
          } else {
            setEditing(false);
          }
        },
      },
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={[
        "group relative rounded-lg border",
        "bg-surface-card border-border",
        "shadow-card hover:shadow-card-hover",
        "transition-all duration-150",
        isDragging ? "opacity-40" : "opacity-100",
        isDragOverlay
          ? "shadow-card-drag rotate-1 scale-105"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Status color stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg"
        style={{ backgroundColor: statusColor }}
      />

      <div className="flex items-stretch">
        {/* Drag handle + state picker */}
        <div className="flex flex-col items-center shrink-0 relative">
          <div
            {...listeners}
            className="flex-1 flex items-center pl-3 pr-1 cursor-grab active:cursor-grabbing text-stone-400 hover:text-stone-600"
          >
            <GripVertical
              size={12}
              strokeWidth={2}
            />
          </div>
          <button
            onPointerDown={(e) =>
              e.stopPropagation()
            }
            onClick={(e) => {
              e.stopPropagation();
              setStatePicker((v) => !v);
            }}
            className={[
              "mb-2 ml-2 mr-1 w-4 h-4 rounded-full",
              "border-2 border-white shadow-sm",
              "hover:scale-125 transition-transform",
              "shrink-0",
            ].join(" ")}
            style={{ backgroundColor: statusColor }}
            title="Change status"
          />
          {statePicker && (
            <StatusPicker
              current={task.status}
              states={settings?.task_states ?? []}
              onSelect={(s) => {
                markDone.mutate({
                  taskId: task.id,
                  status: s,
                });
                setStatePicker(false);
              }}
              onClose={() => setStatePicker(false)}
            />
          )}
        </div>

        {/* Card content */}
        <div className="flex-1 min-w-0 py-3 pr-3">
          {editing ? (
            <TaskEditForm
              editCustomer={editCustomer}
              editTitle={editTitle}
              editBody={editBody}
              editGithubUrl={editGithubUrl}
              editTags={editTags}
              allTags={allTags}
              isSaving={
                updateTask.isPending ||
                setTaskTags.isPending
              }
              onCustomerChange={setEditCustomer}
              onTitleChange={setEditTitle}
              onBodyChange={setEditBody}
              onGithubUrlChange={setEditGithubUrl}
              onTagsChange={setEditTags}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <TaskCardContent
              task={task}
              customerColors={customerColors}
              allTags={allTags}
              isTimerRunning={isTimerRunning}
              activeTimerStart={
                activeTimer?.start
              }
              onStopTimer={() =>
                stopClock.mutate()
              }
              onCustomerClick={onCustomerClick}
              onTagClick={onTagClick}
              onHistoryOpen={() =>
                setHistoryOpen(true)
              }
              openOverlay={openOverlay}
            />
          )}
        </div>

        {/* Hover actions */}
        {!editing && !isDragOverlay && (
          <TaskCardActions
            status={task.status}
            isTimerRunning={isTimerRunning}
            hasCustomer={!!task.customer}
            isMarkDonePending={markDone.isPending}
            isStartClockPending={
              startClock.isPending
            }
            isStopClockPending={stopClock.isPending}
            isArchivePending={archiveTask.isPending}
            onMarkDone={() =>
              markDone.mutate({
                taskId: task.id,
                status: "DONE",
              })
            }
            onStartTimer={async () => {
              if (activeTimer?.active) {
                await stopClock.mutateAsync();
              }
              startClock.mutate({
                customer: task.customer!,
                description: stripCustomerPrefix(
                  task.title,
                ),
                taskId: task.id,
              });
            }}
            onEdit={startEdit}
            onArchive={() =>
              archiveTask.mutate(task.id)
            }
          />
        )}
      </div>

      {/* State history popup */}
      {historyOpen && task.state_history && (
        <StateHistoryPopup
          history={task.state_history}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {overlayUrl && (
        <LinkOverlay
          url={overlayUrl}
          onClose={closeOverlay}
        />
      )}
    </div>
  );
}
