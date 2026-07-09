import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { assistCronPrompt } from "../../api/client";
import { lineDiff } from "../../utils/lineDiff";
import { fieldCls } from "./cronFields";

/** Unified red/green diff of a proposed prompt rewrite, with
 *  Accept / Reject. Shown in place of the editor while a
 *  proposal is pending so the user sees exactly what the
 *  assistant changed before committing to it. */
export function PromptDiff({
  before,
  after,
  onAccept,
  onReject,
}: {
  before: string;
  after: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { t } = useTranslation("cron");
  const rows = useMemo(() => lineDiff(before, after), [before, after]);
  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-72 overflow-auto rounded-lg border border-border bg-surface-raised font-mono text-xs">
        {rows.map((r, i) => (
          <div
            key={i}
            className={[
              "px-3 py-0.5 whitespace-pre-wrap break-words",
              r.type === "add"
                ? "bg-emerald-500/15 text-emerald-300"
                : r.type === "del"
                  ? "bg-red-500/15 text-red-300"
                  : "text-fg",
            ].join(" ")}
          >
            <span className="select-none text-fg-subtle mr-2">
              {r.type === "add" ? "+" : r.type === "del" ? "−" : " "}
            </span>
            {r.text || " "}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onAccept}
          className="px-3 py-1 rounded text-xs bg-cta text-white hover:bg-cta-hover"
        >
          {t("acceptChanges")}
        </button>
        <button
          onClick={onReject}
          className="px-3 py-1 rounded text-xs bg-surface-raised border border-border text-fg-strong hover:bg-surface-overlay"
        >
          {t("rejectChanges")}
        </button>
      </div>
    </div>
  );
}

/** Instruction box that asks the advisor model to rewrite the
 *  current prompt. On success it hands the rewrite up via
 *  ``onPropose`` -- the parent shows it as a diff. */
export function CronPromptAssistant({
  currentPrompt,
  model,
  disabled,
  onPropose,
}: {
  currentPrompt: string;
  model: string;
  disabled?: boolean;
  onPropose: (content: string) => void;
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

  if (!model) {
    return (
      <p className="text-2xs text-amber-500">
        {t("noAdvisorModel")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles size={12} className="text-cta shrink-0" />
        <span className="text-2xs text-fg-muted uppercase tracking-wide">
          {t("aiAssistant")}
        </span>
        <span className="text-2xs text-fg-subtle font-mono truncate">
          {model}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          className={`${fieldCls} flex-1`}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t("assistPlaceholder")}
          disabled={busy || disabled}
        />
        <button
          onClick={() => void send()}
          disabled={busy || disabled || !instruction.trim()}
          className="px-3 py-1 rounded text-xs bg-cta text-white hover:bg-cta-hover disabled:opacity-40 flex items-center gap-1.5 shrink-0"
        >
          {busy ? (
            <>
              <Loader2 size={11} className="animate-spin" />
              {t("assistThinking")}
            </>
          ) : (
            t("improve")
          )}
        </button>
      </div>
      {error && <p className="text-2xs text-red-400">{error}</p>}
    </div>
  );
}
