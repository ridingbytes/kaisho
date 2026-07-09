import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../common/Dialog";
import { PromptEditor } from "../common/PromptEditor";
import {
  fieldCls,
  MODEL_DATALIST,
  OutputSelect,
  ScheduleField,
} from "./cronFields";
import {
  CronPromptAssistant,
  PromptDiff,
} from "./CronPromptAssistant";
import {
  useAiSettings,
  useCloudSyncStatus,
} from "../../hooks/useSettings";
import {
  useJobPrompt,
  useSaveJobPrompt,
  useUpdateCronJob,
} from "../../hooks/useCron";
import type { CronJob } from "../../types";

interface Props {
  job: CronJob;
  onClose: () => void;
}

/** Rich edit modal for a single cron job: schedule / model
 *  / output / timeout / cloud plus the prompt body, saved
 *  together. Mirrors the task/clock TimeEntryDialog so the
 *  pencil opens a dialog instead of an inline form. */
export function CronJobDialog({ job, onClose }: Props) {
  const { t } = useTranslation("cron");
  const { t: tc } = useTranslation("common");

  const [schedule, setSchedule] = useState(job.schedule);
  const [model, setModel] = useState(job.model);
  const [output, setOutput] = useState(job.output);
  const [timeout, setTimeoutVal] = useState(String(job.timeout));
  const [cloud, setCloud] = useState(!!job.cloud);
  const [prompt, setPrompt] = useState("");
  const [scheduleValid, setScheduleValid] = useState(true);
  // Pending assistant rewrite shown as a diff; null = none.
  const [proposal, setProposal] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const { data: aiSettings } = useAiSettings();
  const advisorModel = aiSettings?.advisor_model || "";
  const { data: cloudStatus } = useCloudSyncStatus();
  const canCloud = ["companion", "pro", "team"].includes(
    cloudStatus?.plan ?? "",
  );

  const { data: promptData } = useJobPrompt(job.id);
  // Seed the editor once the fetched prompt arrives, without
  // clobbering edits the user has already started.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    if (promptData?.content === undefined) return;
    setPrompt(promptData.content);
    seeded.current = true;
  }, [promptData?.content]);

  const updateJob = useUpdateCronJob();
  const savePrompt = useSaveJobPrompt();
  const pending = updateJob.isPending || savePrompt.isPending;

  async function save() {
    await updateJob.mutateAsync({
      jobId: job.id,
      updates: {
        schedule,
        model,
        output,
        timeout: Number(timeout),
        cloud: canCloud ? cloud : false,
      },
    });
    // Only rewrite the prompt file when it actually changed —
    // an untouched save shouldn't trigger a cloud re-push.
    if (seeded.current && prompt !== promptData?.content) {
      await savePrompt.mutateAsync({ jobId: job.id, content: prompt });
    }
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("editJob")}
      subtitle={job.id}
      size={assistantOpen ? "xl" : "lg"}
      resizable
      noBackdropClose
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button onClick={onClose} className={fieldCls}>
            {tc("cancel")}
          </button>
          <button
            onClick={save}
            disabled={pending || !scheduleValid}
            className="px-3 py-1.5 rounded text-sm bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
          >
            {pending ? t("saving") : tc("save")}
          </button>
        </div>
      }
    >
      <div className="flex gap-4 items-stretch">
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs text-fg-muted uppercase tracking-wide">
              {t("schedule")}
            </span>
            <ScheduleField
              value={schedule}
              onChange={setSchedule}
              onValidChange={setScheduleValid}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs text-fg-muted uppercase tracking-wide">
              {t("model")}
            </span>
            <input
              className={`${fieldCls} w-full`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="ollama:qwen3:14b"
              list={MODEL_DATALIST}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs text-fg-muted uppercase tracking-wide">
              {t("output")}
            </span>
            <OutputSelect value={output} onChange={setOutput} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs text-fg-muted uppercase tracking-wide">
              {t("timeoutS")}
            </span>
            <input
              className={`${fieldCls} w-full`}
              type="number"
              value={timeout}
              onChange={(e) => setTimeoutVal(e.target.value)}
              placeholder="120"
            />
          </label>
        </div>

        {canCloud && (
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={cloud}
              onChange={(e) => setCloud(e.target.checked)}
            />
            <span>{t("runInCloud")}</span>
          </label>
        )}

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs text-fg-muted uppercase tracking-wide">
              {t("prompt")}
            </span>
            <div className="flex items-center gap-2 min-w-0">
              {promptData?.path && (
                <span className="text-2xs text-fg-subtle font-mono truncate">
                  {promptData.path}
                </span>
              )}
              {!assistantOpen && (
                <button
                  type="button"
                  onClick={() => setAssistantOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-2xs bg-cta/10 text-cta hover:bg-cta/20 transition-colors shrink-0"
                  title={t("aiAssistant")}
                >
                  <Sparkles size={12} />
                  {t("aiAssistant")}
                </button>
              )}
            </div>
          </div>
          {promptData?.error && (
            <p className="text-xs text-red-400">{promptData.error}</p>
          )}
          {proposal !== null ? (
            <PromptDiff before={prompt} after={proposal} />
          ) : (
            <PromptEditor
              value={prompt}
              onChange={setPrompt}
              placeholder={t("enterPrompt")}
              minHeight={240}
            />
          )}
        </div>
      </div>

      {assistantOpen && (
        <aside className="w-72 shrink-0 border-l border-border-subtle pl-4">
          <CronPromptAssistant
            currentPrompt={prompt}
            model={advisorModel}
            proposal={proposal}
            onPropose={setProposal}
            onAccept={() => {
              if (proposal !== null) setPrompt(proposal);
              setProposal(null);
            }}
            onReject={() => setProposal(null)}
            onClose={() => setAssistantOpen(false)}
          />
        </aside>
      )}
      </div>
    </Dialog>
  );
}
