import { ChevronDown, ChevronRight, Play } from "lucide-react";
import { useState } from "react";
import { Markdown } from "../common/Markdown";
import {
  useCronHistory,
  useCronJobs,
  useDisableCronJob,
  useEnableCronJob,
  useTriggerCronJob,
} from "../../hooks/useCron";
import { Toggle } from "../common/Toggle";
import type { CronJob, CronRun } from "../../types";

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
  const trigger = useTriggerCronJob();

  return (
    <div className="bg-surface-card rounded-xl border border-border shadow-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-200">{job.name}</p>
          <p className="text-xs text-slate-500 font-mono">{job.id}</p>
        </div>
        <EnableToggle job={job} />
      </div>
      <div className="flex gap-4 text-xs text-slate-500">
        <span>
          <span className="text-slate-600">Schedule: </span>
          <span className="font-mono">{job.schedule}</span>
        </span>
        <span>
          <span className="text-slate-600">Model: </span>
          {job.model}
        </span>
      </div>
      <button
        onClick={() => trigger.mutate(job.id)}
        disabled={trigger.isPending}
        className={[
          "self-start flex items-center gap-1.5 px-3 py-1 rounded-lg",
          "text-xs bg-surface-raised border border-border",
          "text-slate-300 hover:bg-surface-overlay transition-colors",
          "disabled:opacity-50",
        ].join(" ")}
      >
        <Play size={11} />
        {trigger.isPending ? "Running…" : "Run now"}
      </button>
    </div>
  );
}

function HistoryTable({ runs }: { runs: CronRun[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (runs.length === 0) {
    return (
      <p className="text-sm text-slate-600 py-4">No history yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-600 border-b border-border-subtle">
            <th className="text-left py-2 pr-4 font-medium w-4" />
            <th className="text-left py-2 pr-4 font-medium">#</th>
            <th className="text-left py-2 pr-4 font-medium">Job</th>
            <th className="text-left py-2 pr-4 font-medium">Started</th>
            <th className="text-left py-2 pr-4 font-medium">Finished</th>
            <th className="text-left py-2 pr-4 font-medium">Status</th>
            <th className="text-left py-2 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const isOpen = expandedId === run.id;
            const hasOutput = !!run.output;
            return (
              <>
                <tr
                  key={run.id}
                  onClick={() =>
                    hasOutput
                      ? setExpandedId(isOpen ? null : run.id)
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
                  <td className="py-2 pr-4 text-slate-600">{run.id}</td>
                  <td className="py-2 pr-4 font-mono text-slate-400">
                    {run.job_id}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {run.started_at.slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {run.finished_at
                      ? run.finished_at.slice(0, 19).replace("T", " ")
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusPill status={run.status} />
                  </td>
                  <td className="py-2 text-red-400 max-w-xs truncate">
                    {run.status === "error" ? run.error : ""}
                  </td>
                </tr>
                {isOpen && (
                  <tr
                    key={`${run.id}-output`}
                    className="border-b border-border-subtle bg-surface-card"
                  >
                    <td colSpan={7} className="px-4 py-4">
                      <Markdown>{run.output}</Markdown>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CronView() {
  const { data: jobs = [], isLoading: jobsLoading } = useCronJobs();
  const { data: history = [], isLoading: historyLoading } =
    useCronHistory();

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Cron
        </h1>
      </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <HistoryTable runs={history} />
          )}
        </section>
      </div>
    </div>
  );
}
