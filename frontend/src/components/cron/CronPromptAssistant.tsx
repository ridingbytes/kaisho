import { useMemo, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { assistCronPrompt } from "../../api/client";
import { lineDiff } from "../../utils/lineDiff";
import { fieldCls } from "./cronFields";

/** Unified red/green diff of a proposed prompt rewrite,
 *  shown in place of the editor so the change is visible in
 *  context. Accept / Reject live in the assistant sidebar. */
export function PromptDiff({
  before,
  after,
}: {
  before: string;
  after: string;
}) {
  const rows = useMemo(() => lineDiff(before, after), [before, after]);
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-cta/40 bg-surface-raised font-mono text-xs">
      {rows.map((r, i) => (
        <div
          key={i}
          className={[
            "px-3 py-0.5 whitespace-pre-wrap break-words",
            r.type === "add"
              ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200"
              : r.type === "del"
                ? "bg-red-500/20 text-red-800 dark:text-red-200"
                : "text-fg",
          ].join(" ")}
        >
          <span className="select-none mr-2 opacity-70">
            {r.type === "add" ? "+" : r.type === "del" ? "−" : " "}
          </span>
          {r.text || " "}
        </div>
      ))}
    </div>
  );
}

/** Assistant sidebar: an instruction box that asks the
 *  advisor model to rewrite the prompt. While a proposal is
 *  pending it shows Accept / Reject right here, next to the
 *  input, so the review step is never hidden below the fold.
 */
export function CronPromptAssistant({
  currentPrompt,
  model,
  proposal,
  onPropose,
  onAccept,
  onReject,
  onClose,
}: {
  currentPrompt: string;
  model: string;
  proposal: string | null;
  onPropose: (content: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("cron");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { content } = await assistCronPrompt({
        currentPrompt,
        instruction,
        model,
      });
      onPropose(content);
      setInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles size={13} className="text-cta shrink-0" />
        <span className="text-xs font-semibold text-fg-strong">
          {t("aiAssistant")}
        </span>
        <button
          onClick={onClose}
          className="ml-auto text-fg-muted hover:text-fg-strong transition-colors"
          title={t("close", { ns: "common" })}
        >
          <X size={14} />
        </button>
      </div>

      {!model ? (
        <p className="text-2xs text-amber-500">
          {t("noAdvisorModel")}
        </p>
      ) : (
        <>
          <p className="text-2xs text-fg-subtle font-mono truncate">
            {model}
          </p>

          {proposal !== null ? (
            <div className="flex flex-col gap-2 rounded-lg border border-cta/40 bg-cta/5 p-3">
              <p className="text-xs text-fg">{t("proposalReady")}</p>
              <div className="flex gap-2">
                <button
                  onClick={onAccept}
                  className="flex-1 px-3 py-1.5 rounded text-xs bg-cta text-white hover:bg-cta-hover"
                >
                  {t("acceptChanges")}
                </button>
                <button
                  onClick={onReject}
                  className="flex-1 px-3 py-1.5 rounded text-xs bg-surface-raised border border-border text-fg-strong hover:bg-surface-overlay"
                >
                  {t("rejectChanges")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                className={`${fieldCls} w-full resize-none`}
                rows={4}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={t("assistPlaceholder")}
                disabled={busy}
              />
              <button
                onClick={() => void send()}
                disabled={busy || !instruction.trim()}
                className="px-3 py-1.5 rounded text-xs bg-cta text-white hover:bg-cta-hover disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {busy ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {t("assistThinking")}
                  </>
                ) : (
                  t("improve")
                )}
              </button>
            </>
          )}

          {error && <p className="text-2xs text-red-400">{error}</p>}
          <p className="text-2xs text-fg-subtle mt-auto">
            {t("assistHint")}
          </p>
        </>
      )}
    </div>
  );
}
