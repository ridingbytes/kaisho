import { useTranslation } from "react-i18next";
import {
  ArrowUpToLine, Pencil, RotateCw, Trash2,
} from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { ContentPopup } from "../common/ContentPopup";
import { TimeEntryDialog } from "../projects/TimeEntryDialog";
import {
  useInvoicedContracts,
  isInvoiced,
} from "../../hooks/useInvoicedContracts";
import { useState } from "react";
import {
  useClockEntries,
  useDeleteClockEntry,
  useMergeClockEntries,
  useStartTimer,
} from "../../hooks/useClocks";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import { useTasks } from "../../hooks/useTasks";
import { useSetView } from "../../context/ViewContext";
import { taskTitleById } from "../../utils/customerPrefix";
import type { ClockEntry, Task } from "../../types";

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeLabel(iso: string | null): string {
  if (!iso) return "…";
  return iso.slice(11, 16);
}

interface TaskGroup {
  customer: string;
  description: string;
  entries: ClockEntry[];
  totalMinutes: number;
}

function groupEntries(entries: ClockEntry[]): TaskGroup[] {
  const map = new Map<string, TaskGroup>();
  for (const entry of entries) {
    const key = `${entry.customer}|${entry.description}`;
    if (!map.has(key)) {
      map.set(key, {
        customer: entry.customer,
        description: entry.description,
        entries: [],
        totalMinutes: 0,
      });
    }
    const group = map.get(key)!;
    group.entries.push(entry);
    group.totalMinutes += entry.duration_minutes ?? 0;
  }
  return Array.from(map.values());
}

// --- Individual slot row (edit/delete per clock stamp) ---

interface SlotRowProps {
  invoicedSet: Set<string>;
  entry: ClockEntry;
  previousEntry?: ClockEntry;
  tasks: Task[];
}

function SlotRow({
  entry,
  previousEntry,
  tasks,
  invoicedSet,
}: SlotRowProps) {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const [editing, setEditing] = useState(false);
  const setView = useSetView();
  const deleteEntry = useDeleteClockEntry();
  const mergeEntry = useMergeClockEntries();
  const canMerge = Boolean(
    previousEntry?.sync_id &&
    entry.sync_id &&
    entry.end &&
    previousEntry?.end &&
    previousEntry?.customer === entry.customer,
  );

  return (
    <>
    {editing && (
      <TimeEntryDialog
        entry={entry}
        onClose={() => setEditing(false)}
      />
    )}
    <div className="group/slot flex items-center gap-2 pl-3 py-0.5">
      <span className="text-2xs font-mono text-fg-muted tabular-nums">
        {timeLabel(entry.start)}–{timeLabel(entry.end)}
      </span>
      {entry.contract && (
        <span
          className={[
            "text-2xs px-1 py-0.5 rounded truncate max-w-[80px]",
            isInvoiced(invoicedSet, entry.customer, entry.contract)
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-surface-overlay text-fg-muted",
          ].join(" ")}
        >
          {entry.contract}
          {isInvoiced(invoicedSet, entry.customer, entry.contract) && " ✓"}
        </span>
      )}
      {entry.task_id && (
        <button
          onClick={() => setView(
            "board",
            taskTitleById(tasks, entry.task_id) || ""
          )}
          className="text-2xs px-1 py-0.5 rounded bg-cta-muted text-cta/70 truncate max-w-[80px] hover:bg-cta/20 transition-colors"
          title={taskTitleById(tasks, entry.task_id) || entry.task_id}
        >
          {taskTitleById(tasks, entry.task_id) || entry.task_id}
        </button>
      )}
      {entry.invoiced && (
        <span
          className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
          title={tc("invoiced")}
        />
      )}
      <span className={`text-2xs text-fg-muted tabular-nums ${entry.invoiced ? "" : "ml-auto"}`}>
        {entry.duration_minutes !== null
          ? formatDuration(entry.duration_minutes)
          : "…"}
      </span>
      {entry.notes && (
        <ContentPopup
          content={entry.notes}
          title={tc("notes")}
          icon="notes"
          iconSize={10}
        />
      )}
      <button
        onClick={() => setEditing(true)}
        className={actionBtn}
        title={tc("edit")}
      >
        <Pencil size={10} />
      </button>
      {canMerge && (
        <ConfirmPopover
          label={t("mergeIntoPreviousConfirm")}
          onConfirm={() =>
            mergeEntry.mutate({
              into: previousEntry!,
              from: entry,
            })
          }
          disabled={mergeEntry.isPending}
        >
          <button
            disabled={mergeEntry.isPending}
            className={[actionBtn, "hover:text-cta"].join(
              " ",
            )}
            title={t("mergeIntoPrevious")}
          >
            <ArrowUpToLine size={10} />
          </button>
        </ConfirmPopover>
      )}
      <ConfirmPopover
        onConfirm={() => deleteEntry.mutate(entry)}
        disabled={deleteEntry.isPending}
      >
        <button
          disabled={deleteEntry.isPending}
          className={[actionBtn, "hover:text-red-400 hover:bg-red-500/10"].join(" ")}
          title={tc("delete")}
        >
          <Trash2 size={10} />
        </button>
      </ConfirmPopover>
    </div>
    </>
  );
}

// --- Group row (resume/book per task) ---

interface TaskGroupRowProps {
  group: TaskGroup;
  isRunning: boolean;
  showResume: boolean;
  tasks: Task[];
  customerColors: Record<string, string>;
  invoicedSet: Set<string>;
}

function TaskGroupRow({
  group,
  isRunning,
  tasks,
  showResume,
  customerColors,
  invoicedSet,
}: TaskGroupRowProps) {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const resumeTimer = useStartTimer();
  const setView = useSetView();
  const latest = group.entries[group.entries.length - 1];

  const isActive = group.entries.some(
    (e) => e.end === null
  );

  return (
    <div className="border-b border-border-subtle last:border-0 py-2">
      {/* Header */}
      <div className="group flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {group.customer ? (
            <button
              onClick={() => setView("customers", group.customer)}
              className="text-xs font-medium text-fg-strong truncate max-w-full hover:text-cta transition-colors text-left inline-flex items-center gap-1.5"
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  background:
                    customerColors[group.customer]
                    || "#a1a1aa",
                }}
              />
              {group.customer}
            </button>
          ) : (
            <span className="text-xs text-fg-subtle italic">
              {tc("noCustomer")}
            </span>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            {isActive && (
              <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-green-500/10">
                <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                <span className="text-2xs font-semibold tracking-wider uppercase text-green-600">
                  {tc("active")}
                </span>
              </span>
            )}
            <p className="text-xs text-fg-muted truncate">
              {group.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {showResume && (
            <button
              onClick={() =>
                resumeTimer.mutate({
                  customer: group.customer,
                  description: group.description,
                  contract: latest?.contract ?? undefined,
                  taskId: latest?.task_id ?? undefined,
                })
              }
              disabled={isRunning || resumeTimer.isPending}
              className={[
                actionBtn,
                "opacity-0 group-hover:opacity-100",
                "disabled:cursor-not-allowed",
              ].join(" ")}
              title={t("resume")}
            >
              <RotateCw size={10} />
            </button>
          )}
          <span className="text-xs font-semibold text-fg-muted tabular-nums ml-1">
            {formatDuration(group.totalMinutes)}
          </span>
        </div>
      </div>

      {/* Slots */}
      <div className="mt-0.5">
        {group.entries.map((entry, i) => (
          <SlotRow
            key={entry.start}
            entry={entry}
            previousEntry={
              i > 0 ? group.entries[i - 1] : undefined
            }
            tasks={tasks}
            invoicedSet={invoicedSet}
          />
        ))}
      </div>
    </div>
  );
}

// --- List ---

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface ClockListProps {
  isRunning: boolean;
  selectedDate: string | null;
}

export function ClockList({
  isRunning,
  selectedDate,
}: ClockListProps) {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const effectiveDate = selectedDate ?? todayIso();
  const { data: entries = [], isLoading } = useClockEntries(
    "today",
    effectiveDate
  );
  const { data: allTasks = [] } = useTasks(true);
  const customerColors = useCustomerColors();
  const invoicedSet = useInvoicedContracts();

  const groups = groupEntries(entries);
  const totalMin = groups.reduce((sum, g) => sum + g.totalMinutes, 0);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;

  if (isLoading) {
    return (
      <p className="text-xs text-fg-subtle text-center py-4">{tc("loading")}</p>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="text-xs text-fg-subtle text-center py-4">
        {tc("noEntries")}
      </p>
    );
  }

  return (
    <div>
      {groups.map((group) => (
        <TaskGroupRow
          key={`${group.customer}|${group.description}`}
          group={group}
          isRunning={isRunning}
          showResume
          tasks={allTasks}
          customerColors={customerColors}
          invoicedSet={invoicedSet}
        />
      ))}
      <div className="flex justify-between pt-2 mt-1">
        <span className="text-2xs font-semibold uppercase tracking-wider text-fg-muted">
          {t("totalToday")}
        </span>
        <span className="text-xs font-semibold text-fg tabular-nums">
          {totalH}h {totalM}m
        </span>
      </div>
    </div>
  );
}

const actionBtn = [
  "p-0.5 rounded text-fg-subtle",
  "hover:text-cta hover:bg-cta-muted",
  "transition-colors",
].join(" ");
