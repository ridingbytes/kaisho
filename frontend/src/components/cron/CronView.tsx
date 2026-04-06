import {
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { ContentPopup } from "../common/ContentPopup";
import { Markdown } from "../common/Markdown";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import { useKbSources } from "../../hooks/useSettings";
import {
  useAddCronJob,
  useCronHistory,
  useCronJobs,
  useDeleteCronJob,
  useDeleteCronRun,
  useDisableCronJob,
  useEnableCronJob,
  useJobPrompt,
  useSaveJobPrompt,
  useTriggerCronJob,
  useUpdateCronJob,
} from "../../hooks/useCron";
import { useAvailableModels } from "../../hooks/useSettings";
import { Toggle } from "../common/Toggle";
import type { CronJob, CronRun } from "../../types";

const MODEL_DATALIST = "cron-model-list";

const fieldCls =
  "px-2 py-1 rounded text-xs bg-surface-raised border border-border " +
  "text-slate-200 placeholder-slate-600 focus:outline-none " +
  "focus:border-border-strong font-mono";

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
    running: "bg-yellow-900/40 text-yellow-400",
    ok: "bg-green-900/40 text-green-400",
    error: "bg-red-900/40 text-red-400",
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

function JobCard({ job }: { job: CronJob }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSchedule, setEditSchedule] = useState(job.schedule);
  const [editModel, setEditModel] = useState(job.model);
  const [editOutput, setEditOutput] = useState(job.output);
  const [editTimeout, setEditTimeout] = useState(String(job.timeout));
  // undefined = not yet edited; string = user has typed something
  const [promptDraft, setPromptDraft] = useState<string | undefined>(
    undefined
  );
  const [promptSaved, setPromptSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useTriggerCronJob();
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
    if (!confirm(`Delete job "${job.name}"?`)) return;
    deleteJob.mutate(job.id);
  }

  return (
    <div className="bg-surface-card rounded-xl border border-border shadow-card flex flex-col">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={handleExpand}
      >
        <span className="text-slate-600 shrink-0">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-200 truncate">
            {job.name}
          </p>
          <p className="text-[10px] text-slate-600 font-mono">{job.id}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <EnableToggle job={job} />
          <button
            onClick={startEdit}
            className="text-slate-600 hover:text-accent transition-colors"
            title="Edit fields"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              trigger.mutate(job.id);
            }}
            disabled={trigger.isPending}
            className={[
              "flex items-center gap-1 px-2 py-1 rounded-lg",
              "text-xs bg-surface-raised border border-border",
              "text-slate-300 hover:bg-surface-overlay transition-colors",
              "disabled:opacity-50",
            ].join(" ")}
          >
            <Play size={10} />
            {trigger.isPending ? "…" : "Run"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="text-slate-600 hover:text-red-400 transition-colors"
            title="Delete job"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Summary pills */}
      <div
        className="flex gap-3 px-4 pb-3 text-[10px] text-slate-500 font-mono cursor-pointer"
        onClick={handleExpand}
      >
        <span title="Schedule">{job.schedule}</span>
        <span className="text-slate-700">|</span>
        <span title="Model">{job.model}</span>
        <span className="text-slate-700">|</span>
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
                  <span className="text-[10px] text-slate-600 uppercase tracking-wide">
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
                  <span className="text-[10px] text-slate-600 uppercase tracking-wide">
                    Model
                  </span>
                  <input
                    className={fieldCls}
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    placeholder="ollama:qwen3:14b"
                    list={MODEL_DATALIST}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-600 uppercase tracking-wide">
                    Output
                  </span>
                  <OutputSelect
                    value={editOutput}
                    onChange={setEditOutput}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-600 uppercase tracking-wide">
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
                  className="px-3 py-1 rounded-lg text-xs bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {updateJob.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {/* Prompt editor */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-600 uppercase tracking-wide">
                Prompt
              </span>
              {promptData?.path && (
                <span className="text-[10px] text-slate-700 font-mono">
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
                "text-slate-200 placeholder-slate-600",
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
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
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

function AddJobForm({ onClose }: { onClose: () => void }) {
  const addJob = useAddCronJob();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 9 * * 1-5");
  const [model, setModel] = useState("ollama:qwen3:14b");
  const [output, setOutput] = useState("inbox");
  const [timeout, setTimeout] = useState("120");
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
        timeout: Number(timeout),
        enabled: true,
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
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          New Cron Job
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-600 hover:text-slate-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-600 uppercase tracking-wide">
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
          <span className="text-[10px] text-slate-600 uppercase tracking-wide">
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
          <span className="text-[10px] text-slate-600 uppercase tracking-wide">
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
          <span className="text-[10px] text-slate-600 uppercase tracking-wide">
            Model
          </span>
          <input
            className={fieldCls}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="ollama:qwen3:14b"
            list={MODEL_DATALIST}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-600 uppercase tracking-wide">
            Output
          </span>
          <OutputSelect
            value={output}
            onChange={setOutput}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-600 uppercase tracking-wide">
            Timeout (s)
          </span>
          <input
            className={fieldCls}
            type="number"
            value={timeout}
            onChange={(e) => setTimeout(e.target.value)}
            placeholder="120"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-slate-600 uppercase tracking-wide">
          Prompt
        </span>
        <textarea
          className={[
            "w-full px-3 py-2 rounded-lg text-xs font-mono",
            "bg-surface-raised border border-border",
            "text-slate-200 placeholder-slate-600",
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
          className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={addJob.isPending}
          className="px-4 py-1.5 rounded-lg text-sm bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
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

  if (runs.length === 0) {
    return (
      <p className="text-sm text-slate-600 py-4">
        No history yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-600 border-b border-border-subtle">
            <th className="text-left py-2 pr-4 font-medium w-4" />
            <th className="text-left py-2 pr-4 font-medium">
              #
            </th>
            <th className="text-left py-2 pr-4 font-medium">
              Job
            </th>
            <th className="text-left py-2 pr-4 font-medium">
              Model
            </th>
            <th className="text-left py-2 pr-4 font-medium">
              Started
            </th>
            <th className="text-left py-2 pr-4 font-medium">
              Finished
            </th>
            <th className="text-left py-2 pr-4 font-medium">
              Status
            </th>
            <th className="text-left py-2 pr-4 font-medium">
              Error
            </th>
            <th className="py-2 w-6" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const isOpen = expandedId === run.id;
            const hasOutput = !!run.output;
            const model = jobMap.get(run.job_id)?.model ?? "";
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
                  <td className="py-2 pr-2 text-slate-600 w-4">
                    {hasOutput ? (
                      isOpen ? (
                        <ChevronDown size={10} />
                      ) : (
                        <ChevronRight size={10} />
                      )
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {run.id}
                  </td>
                  <td className="py-2 pr-4 font-mono text-slate-400">
                    {run.job_id}
                  </td>
                  <td className="py-2 pr-4">
                    {model && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-900/30 text-indigo-400">
                        {model}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {run.started_at
                      .slice(0, 19)
                      .replace("T", " ")}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {run.finished_at
                      ? run.finished_at
                          .slice(0, 19)
                          .replace("T", " ")
                      : "\u2014"}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusPill status={run.status} />
                  </td>
                  <td className="py-2 pr-4 text-red-400 max-w-xs truncate">
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
                      className="text-slate-700 hover:text-red-400 transition-colors"
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
                      <div className="absolute top-2 right-2">
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
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Cron
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            <Plus size={12} />
            Add Job
          </button>
          <HelpButton title="Cron" doc={DOCS.cron} view="cron" />
        </div>
      </div>

      {showForm && (
        <AddJobForm onClose={() => setShowForm(false)} />
      )}

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
        {/* Jobs section */}
        <section>
          <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-3">
            Jobs
          </h2>
          {jobsLoading && (
            <p className="text-sm text-slate-600">Loading…</p>
          )}
          {!jobsLoading && jobs.length === 0 && (
            <p className="text-sm text-slate-600">No jobs configured.</p>
          )}
          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>

        {/* History section */}
        <section>
          <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-3">
            History
          </h2>
          {historyLoading ? (
            <p className="text-sm text-slate-600">Loading…</p>
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
