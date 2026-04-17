import {
  Check,
  ChevronDown,
  ChevronRight,
  Inbox,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { ContentPopup } from "../common/ContentPopup";
import { Markdown } from "../common/Markdown";
import { HelpButton } from "../common/HelpButton";
import { ResizeHandle } from "../common/ResizeHandle";
import { useResizableColumns } from "../../hooks/useResizableColumns";
import { DOCS } from "../../docs/panelDocs";
import {
  useCloudSyncStatus,
  useKbSources,
} from "../../hooks/useSettings";
import {
  useAddCronJob,
  useCronHistory,
  useCronJobs,
  useDeleteCronJob,
  useDeleteCronRun,
  useDisableCronJob,
  useEnableCronJob,
  useJobPrompt,
  useMoveCronOutput,
  useSaveJobPrompt,
  useTriggerCronJob,
  useUpdateCronJob,
} from "../../hooks/useCron";
import { useAvailableModels } from "../../hooks/useSettings";
import { Toggle } from "../common/Toggle";
import type { CronJob, CronRun } from "../../types";

const MODEL_DATALIST = "cron-model-list";

const CRON_HISTORY_COLUMNS = [
  { key: "toggle", defaultPct: 3 },
  { key: "id", defaultPct: 6 },
  { key: "job", defaultPct: 18 },
  { key: "model", defaultPct: 14 },
  { key: "started", defaultPct: 15 },
  { key: "finished", defaultPct: 15 },
  { key: "status", defaultPct: 10 },
  { key: "error", defaultPct: 15 },
  { key: "actions", defaultPct: 4 },
];

const fieldCls =
  "px-2 py-1 rounded text-xs bg-surface-raised border border-border " +
  "text-stone-900 placeholder-stone-500 focus:outline-none " +
  "focus:border-border-strong font-mono";

function CopyToInboxBtn({ runId }: { runId: number }) {
  const moveOutput = useMoveCronOutput();
  const [done, setDone] = useState(false);

  return (
    <button
      onClick={() => {
        moveOutput.mutate(
          { runId, destination: "inbox" },
          {
            onSuccess: () => {
              setDone(true);
              setTimeout(() => setDone(false), 2000);
            },
          }
        );
      }}
      disabled={moveOutput.isPending || done}
      className={[
        "p-1 rounded transition-colors",
        done
          ? "text-green-400"
          : "text-stone-500 hover:text-cta hover:bg-cta-muted",
        "disabled:opacity-60",
      ].join(" ")}
      title="Copy to inbox"
    >
      {done ? <Check size={12} /> : <Inbox size={12} />}
    </button>
  );
}

function OutputSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: sources = [] } = useKbSources();
  return (
    <select
      className={fieldCls}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="none">None (panel only)</option>
      <option value="inbox">Inbox</option>
      {sources.map((s) => (
        <option key={s.label} value={s.label}>
          KB: {s.label}
        </option>
      ))}
    </select>
  );
}

function StatusPill({ status }: { status: CronRun["status"] }) {
  const styles: Record<CronRun["status"], string> = {
    running: "bg-amber-500/15 text-amber-600",
    ok: "bg-emerald-500/15 text-emerald-600",
    error: "bg-red-500/15 text-red-600",
  };
  return (
    <span
      className={[
        "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
        styles[status],
      ].join(" ")}
    >
      {status}
    </span>
  );
}

function EnableToggle({ job }: { job: CronJob }) {
  const enable = useEnableCronJob();
  const disable = useDisableCronJob();
  const pending = enable.isPending || disable.isPending;

  return (
    <Toggle
      checked={job.enabled}
      onChange={(on) => (on ? enable.mutate(job.id) : disable.mutate(job.id))}
      disabled={pending}
    />
  );
}

function JobCard({
  job,
  cloudAi,
}: {
  job: CronJob;
  cloudAi: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSchedule, setEditSchedule] = useState(job.schedule);
  const [editModel, setEditModel] = useState(job.model);
  const [editKaishoAi, setEditKaishoAi] = useState(
    !!job.use_kaisho_ai,
  );
  const [editOutput, setEditOutput] = useState(job.output);
  const [editTimeout, setEditTimeout] = useState(String(job.timeout));
  // undefined = not yet edited; string = user has typed something
  const [promptDraft, setPromptDraft] = useState<string | undefined>(
    undefined
  );
  const [promptSaved, setPromptSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useTriggerCronJob();
  const [triggered, setTriggered] = useState(false);
  const updateJob = useUpdateCronJob();
  const deleteJob = useDeleteCronJob();
  const savePrompt = useSaveJobPrompt();

  // Always fetch; staleTime keeps it cheap after first load
  const { data: promptData } = useJobPrompt(job.id);

  // Effective content: user edit takes precedence over fetched value
  const promptContent = promptDraft ?? promptData?.content ?? "";

  function handleExpand() {
    if (expanded) {
      setExpanded(false);
      setEditing(false);
    } else {
      setExpanded(true);
    }
  }

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditSchedule(job.schedule);
    setEditModel(job.model);
    setEditKaishoAi(!!job.use_kaisho_ai);
    setEditOutput(job.output);
    setEditTimeout(String(job.timeout));
    setEditing(true);
    setExpanded(true);
  }

  function handleSaveFields() {
    updateJob.mutate(
      {
        jobId: job.id,
        updates: {
          schedule: editSchedule,
          model: editModel,
          output: editOutput,
          timeout: Number(editTimeout),
          use_kaisho_ai: editKaishoAi,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  function handleSavePrompt() {
    savePrompt.mutate(
      { jobId: job.id, content: promptContent },
      {
        onSuccess: () => {
          setPromptDraft(undefined);
          setPromptSaved(true);
          if (savedTimer.current) clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(
            () => setPromptSaved(false),
            2000
          );
        },
      }
    );
  }

  function handleDelete() {
    deleteJob.mutate(job.id);
  }

  return (
    <div className="bg-surface-card rounded-xl border border-border shadow-card flex flex-col">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={handleExpand}
      >
        <span className="text-stone-500 shrink-0">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-900 truncate">
            {job.name}
          </p>
          <p className="text-[10px] text-stone-500 font-mono">{job.id}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <EnableToggle job={job} />
          <button
            onClick={startEdit}
            className="text-stone-500 hover:text-cta transition-colors"
            title="Edit fields"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTriggered(true);
              trigger.mutate(job.id, {
                onSettled: () => {
                  setTimeout(
                    () => setTriggered(false),
                    3000,
                  );
                },
              });
            }}
            disabled={trigger.isPending || triggered}
            className={[
              "flex items-center gap-1 px-2 py-1 rounded-lg",
              "text-xs bg-surface-raised border border-border",
              "text-stone-800 hover:bg-surface-overlay transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            <Play size={10} />
            {triggered ? "Running…" : "Run"}
          </button>
          <ConfirmPopover
            label={`Delete "${job.name}"?`}
            onConfirm={handleDelete}
          >
            <button
              onClick={(e) => e.stopPropagation()}
              className="text-stone-500 hover:text-red-400 transition-colors"
              title="Delete job"
            >
              <Trash2 size={12} />
            </button>
          </ConfirmPopover>
        </div>
      </div>

      {/* Summary pills */}
      <div
        className="flex gap-3 px-4 pb-3 text-[10px] text-stone-600 font-mono cursor-pointer"
        onClick={handleExpand}
      >
        <span title="Schedule">{job.schedule}</span>
        <span className="text-stone-400">|</span>
        <span title="Model">
          {job.use_kaisho_ai && cloudAi ? (
            <span className="text-cta">Kaisho AI</span>
          ) : (
            job.model
          )}
        </span>
        <span className="text-stone-400">|</span>
        <span title="Output">{job.output}</span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div
          className="border-t border-border-subtle px-4 py-3 flex flex-col gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Field editor */}
          {editing ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-stone-500 uppercase tracking-wide">
                    Schedule
                  </span>
                  <input
                    className={fieldCls}
                    value={editSchedule}
                    onChange={(e) => setEditSchedule(e.target.value)}
                    placeholder="0 9 * * 1-5"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-stone-500 uppercase tracking-wide">
                    Model
                  </span>
                  {cloudAi && (
                    <label className="flex items-center gap-2 mb-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEditKaishoAi((v) => !v)
                        }
                        className={[
                          "relative w-7 h-4 rounded-full",
                          "transition-colors shrink-0",
                          editKaishoAi
                            ? "bg-cta"
                            : "bg-stone-300",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "absolute top-0.5 left-0.5",
                            "w-3 h-3 rounded-full",
                            "bg-white shadow",
                            "transition-transform",
                            editKaishoAi
                              ? "translate-x-3"
                              : "",
                          ].join(" ")}
                        />
                      </button>
                      <span className="text-[10px] text-stone-600">
                        Kaisho AI
                      </span>
                    </label>
                  )}
                  {editKaishoAi && cloudAi ? (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-cta/10 text-cta border border-cta/30">
                      Kaisho AI
                    </span>
                  ) : (
                    <input
                      className={fieldCls}
                      value={editModel}
                      onChange={(e) =>
                        setEditModel(e.target.value)
                      }
                      placeholder="ollama:qwen3:14b"
                      list={MODEL_DATALIST}
                    />
                  )}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-stone-500 uppercase tracking-wide">
                    Output
                  </span>
                  <OutputSelect
                    value={editOutput}
                    onChange={setEditOutput}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-stone-500 uppercase tracking-wide">
                    Timeout (s)
                  </span>
                  <input
                    className={fieldCls}
                    type="number"
                    value={editTimeout}
                    onChange={(e) => setEditTimeout(e.target.value)}
                    placeholder="120"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveFields}
                  disabled={updateJob.isPending}
                  className="px-3 py-1 rounded-lg text-xs bg-cta text-white hover:bg-cta-hover transition-colors disabled:opacity-50"
                >
                  {updateJob.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1 rounded-lg text-xs text-stone-700 hover:text-stone-900 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {/* Prompt editor */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-stone-500 uppercase tracking-wide">
                Prompt
              </span>
              {promptData?.path && (
                <span className="text-[10px] text-stone-400 font-mono">
                  {promptData.path}
                </span>
              )}
            </div>
            {promptData?.error && (
              <p className="text-xs text-red-400">{promptData.error}</p>
            )}
            <textarea
              className={[
                "w-full px-3 py-2 rounded-lg text-xs font-mono",
                "bg-surface-raised border border-border",
                "text-stone-900 placeholder-stone-500",
                "focus:outline-none focus:border-border-strong",
                "resize-y min-h-[120px]",
              ].join(" ")}
              value={promptContent}
              onChange={(e) => setPromptDraft(e.target.value)}
              placeholder="Enter the prompt text that will be sent to the model…"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSavePrompt}
                disabled={savePrompt.isPending}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs bg-cta text-white hover:bg-cta-hover transition-colors disabled:opacity-50"
              >
                {savePrompt.isPending ? (
                  "Saving…"
                ) : promptSaved ? (
                  <>
                    <Check size={11} />
                    Saved
                  </>
                ) : (
                  "Save prompt"
                )}
              </button>
              {savePrompt.isError && (
                <span className="text-xs text-red-400">
                  Save failed
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddJobForm({
  onClose,
  cloudAi,
}: {
  onClose: () => void;
  cloudAi: boolean;
}) {
  const addJob = useAddCronJob();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 9 * * 1-5");
  const [model, setModel] = useState("ollama:qwen3:14b");
  const [useKaishoAi, setUseKaishoAi] = useState(cloudAi);
  const [output, setOutput] = useState("inbox");
  const [jobTimeout, setJobTimeout] = useState("120");
  const [promptContent, setPromptContent] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addJob.mutate(
      {
        id,
        name,
        schedule,
        model,
        prompt_content: promptContent,
        output,
        timeout: Number(jobTimeout),
        enabled: true,
        use_kaisho_ai: useKaishoAi,
      },
      { onSuccess: onClose }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-b border-border-subtle bg-surface-card px-6 py-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-stone-700 uppercase tracking-wide">
          New Cron Job
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-stone-500 hover:text-stone-900 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-stone-500 uppercase tracking-wide">
            ID
          </span>
          <input
            className={fieldCls}
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="daily-briefing"
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-stone-500 uppercase tracking-wide">
            Name
          </span>
          <input
            className={fieldCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Daily Briefing"
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-stone-500 uppercase tracking-wide">
            Schedule
          </span>
          <input
            className={fieldCls}
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="0 9 * * 1-5"
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-stone-500 uppercase tracking-wide">
            Model
          </span>
          {cloudAi && (
            <label className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={() =>
                  setUseKaishoAi((v) => !v)
                }
                className={[
                  "relative w-7 h-4 rounded-full",
                  "transition-colors shrink-0",
                  useKaishoAi
                    ? "bg-cta"
                    : "bg-stone-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "absolute top-0.5 left-0.5",
                    "w-3 h-3 rounded-full",
                    "bg-white shadow",
                    "transition-transform",
                    useKaishoAi
                      ? "translate-x-3"
                      : "",
                  ].join(" ")}
                />
              </button>
              <span className="text-[10px] text-stone-600">
                Kaisho AI
              </span>
            </label>
          )}
          {useKaishoAi && cloudAi ? (
            <span className="px-2 py-1 rounded text-xs font-medium bg-cta/10 text-cta border border-cta/30">
              Kaisho AI
            </span>
          ) : (
            <input
              className={fieldCls}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="ollama:qwen3:14b"
              list={MODEL_DATALIST}
              required
            />
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-stone-500 uppercase tracking-wide">
            Output
          </span>
          <OutputSelect
            value={output}
            onChange={setOutput}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-stone-500 uppercase tracking-wide">
            Timeout (s)
          </span>
          <input
            className={fieldCls}
            type="number"
            value={jobTimeout}
            onChange={(e) => setJobTimeout(e.target.value)}
            placeholder="120"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-stone-500 uppercase tracking-wide">
          Prompt
        </span>
        <textarea
          className={[
            "w-full px-3 py-2 rounded-lg text-xs font-mono",
            "bg-surface-raised border border-border",
            "text-stone-900 placeholder-stone-500",
            "focus:outline-none focus:border-border-strong",
            "resize-y min-h-[100px]",
          ].join(" ")}
          value={promptContent}
          onChange={(e) => setPromptContent(e.target.value)}
          placeholder="Enter the prompt that will be sent to the model on each run…"
        />
      </label>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-sm text-stone-700 hover:text-stone-900 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={addJob.isPending}
          className="px-4 py-1.5 rounded-lg text-sm bg-cta text-white hover:bg-cta-hover transition-colors disabled:opacity-50"
        >
          {addJob.isPending ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}


function HistoryTable({
  runs,
  jobs,
  onDelete,
}: {
  runs: CronRun[];
  jobs: CronJob[];
  onDelete: (id: number) => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(
    null
  );
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const { widths, tableRef, startResize } =
    useResizableColumns("cron-history", CRON_HISTORY_COLUMNS);

  if (runs.length === 0) {
    return (
      <p className="text-sm text-stone-500 py-4">
        No history yet.
      </p>
    );
  }

  const resizable = "relative py-2 pr-4 font-medium text-left";

  return (
    <div className="overflow-x-auto">
      <table
        ref={tableRef}
        className="w-full text-xs table-fixed"
      >
        <colgroup>
          {widths.map((w, i) => (
            <col
              key={CRON_HISTORY_COLUMNS[i].key}
              style={{ width: `${w}%` }}
            />
          ))}
        </colgroup>
        <thead className="group/thead">
          <tr className="text-stone-500 border-b border-border-subtle">
            <th className={resizable}>
              <ResizeHandle
                onMouseDown={(e) => startResize(0, e)}
              />
            </th>
            <th className={resizable}>
              #
              <ResizeHandle
                onMouseDown={(e) => startResize(1, e)}
              />
            </th>
            <th className={resizable}>
              Job
              <ResizeHandle
                onMouseDown={(e) => startResize(2, e)}
              />
            </th>
            <th className={resizable}>
              Model
              <ResizeHandle
                onMouseDown={(e) => startResize(3, e)}
              />
            </th>
            <th className={resizable}>
              Started
              <ResizeHandle
                onMouseDown={(e) => startResize(4, e)}
              />
            </th>
            <th className={resizable}>
              Finished
              <ResizeHandle
                onMouseDown={(e) => startResize(5, e)}
              />
            </th>
            <th className={resizable}>
              Status
              <ResizeHandle
                onMouseDown={(e) => startResize(6, e)}
              />
            </th>
            <th className={resizable}>
              Error
              <ResizeHandle
                onMouseDown={(e) => startResize(7, e)}
              />
            </th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const isOpen = expandedId === run.id;
            const hasOutput = !!run.output;
            const model =
              run.model || jobMap.get(run.job_id)?.model || "";
            return (
              <Fragment key={run.id}>
                <tr
                  onClick={() =>
                    hasOutput
                      ? setExpandedId(
                          isOpen ? null : run.id
                        )
                      : undefined
                  }
                  className={[
                    "border-b border-border-subtle transition-colors",
                    hasOutput
                      ? "cursor-pointer hover:bg-surface-raised"
                      : "",
                    isOpen ? "bg-surface-raised" : "",
                  ].join(" ")}
                >
                  <td className="py-2 pr-2 text-stone-500 overflow-hidden">
                    {hasOutput ? (
                      isOpen ? (
                        <ChevronDown size={10} />
                      ) : (
                        <ChevronRight size={10} />
                      )
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 text-stone-500 overflow-hidden">
                    {run.id}
                  </td>
                  <td className="py-2 pr-4 font-mono text-stone-700 truncate">
                    {run.job_id}
                  </td>
                  <td className="py-2 pr-4 overflow-hidden">
                    {model && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-600 truncate inline-block max-w-full align-middle">
                        {model}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-stone-700 truncate">
                    {run.started_at
                      .slice(0, 19)
                      .replace("T", " ")}
                  </td>
                  <td className="py-2 pr-4 text-stone-700 truncate">
                    {run.finished_at
                      ? run.finished_at
                          .slice(0, 19)
                          .replace("T", " ")
                      : "\u2014"}
                  </td>
                  <td className="py-2 pr-4 overflow-hidden">
                    <StatusPill status={run.status} />
                  </td>
                  <td className="py-2 pr-4 text-red-400 truncate">
                    {run.status === "error"
                      ? run.error
                      : ""}
                  </td>
                  <td className="py-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(run.id);
                      }}
                      className="text-stone-400 hover:text-red-400 transition-colors"
                      title="Delete run"
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr
                    key={`${run.id}-output`}
                    className="border-b border-border-subtle bg-surface-card"
                  >
                    <td colSpan={9} className="px-4 py-4 relative">
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <CopyToInboxBtn runId={run.id} />
                        <ContentPopup
                          content={run.output}
                          title="Run Output"
                          markdown
                        />
                      </div>
                      <Markdown>{run.output}</Markdown>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CronView() {
  const [showForm, setShowForm] = useState(false);
  const { data: jobs = [], isLoading: jobsLoading } = useCronJobs();
  const { data: history = [], isLoading: historyLoading } =
    useCronHistory();
  const { data: models = [] } = useAvailableModels();
  const { data: cloudStatus } = useCloudSyncStatus();
  const cloudAi = !!cloudStatus?.use_cloud_ai;
  const deleteRun = useDeleteCronRun();

  return (
    <div className="flex flex-col h-full">
      {/* Always-present datalist for model autocomplete */}
      <datalist id={MODEL_DATALIST}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-700">
          Cron
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs bg-cta text-white hover:bg-cta-hover transition-colors"
          >
            <Plus size={12} />
            Add Job
          </button>
          <HelpButton title="Cron" doc={DOCS.cron} view="cron" />
        </div>
      </div>

      {showForm && (
        <AddJobForm
          onClose={() => setShowForm(false)}
          cloudAi={cloudAi}
        />
      )}

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
        {/* Jobs section */}
        <section>
          <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
            Jobs
          </h2>
          {jobsLoading && (
            <p className="text-sm text-stone-500">Loading…</p>
          )}
          {!jobsLoading && jobs.length === 0 && (
            <p className="text-sm text-stone-500">No jobs configured.</p>
          )}
          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                cloudAi={cloudAi}
              />
            ))}
          </div>
        </section>

        {/* History section */}
        <section>
          <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
            History
          </h2>
          {historyLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : (
            <HistoryTable
              runs={history}
              jobs={jobs}
              onDelete={(id) => deleteRun.mutate(id)}
            />
          )}
        </section>
      </div>
    </div>
  );
}
