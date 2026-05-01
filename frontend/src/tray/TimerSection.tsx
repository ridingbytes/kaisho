import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Play, Square, X } from "lucide-react";
import { Markdown } from "../components/common/Markdown";
import type { ActiveTimer, Customer } from "../types";

/** A pinned snapshot of the timer that just stopped.
 * The elapsed text is frozen at the moment of stop so
 * the displayed duration matches what was recorded in
 * the entry. */
export interface StoppedSnapshot {
  timer: ActiveTimer;
  finalElapsed: string;
}

interface Props {
  timer: ActiveTimer | null;
  isRunning: boolean;
  elapsed: string;
  customers: Customer[];
  /** Snapshot of the just-stopped timer, present only
   * when the user has Stop'd but not yet Resumed or
   * Cleared. */
  stopped: StoppedSnapshot | null;
  onStart: (
    customer: string,
    description: string,
    contract?: string,
  ) => void;
  onStop: () => void;
  onResume: () => void;
  onClear: () => void;
  onUpdateDescription: (desc: string) => void;
  onUpdateNotes: (notes: string) => void;
}

export function TimerSection({
  timer,
  isRunning,
  elapsed,
  customers,
  stopped,
  onStart,
  onStop,
  onResume,
  onClear,
  onUpdateDescription,
  onUpdateNotes,
}: Props) {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const [customer, setCustomer] = useState("");
  const [description, setDescription] = useState("");

  // Inline description edit
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const descInputRef = useRef<HTMLInputElement>(null);

  // Inline notes edit
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const notesRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onStart(customer.trim(), description.trim());
    setCustomer("");
    setDescription("");
  }

  function startEditingDesc() {
    setDescDraft(timer?.description ?? "");
    setEditingDesc(true);
    setTimeout(
      () => descInputRef.current?.select(),
      0,
    );
  }

  function commitDesc() {
    setEditingDesc(false);
    const next = descDraft.trim();
    if (next !== (timer?.description ?? "")) {
      onUpdateDescription(next);
    }
  }

  function onDescKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitDesc();
    } else if (e.key === "Escape") {
      setEditingDesc(false);
    }
  }

  function startEditingNotes() {
    setNotesDraft(timer?.notes ?? "");
    setEditingNotes(true);
    setTimeout(() => {
      const el = notesRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(
        el.value.length,
        el.value.length,
      );
    }, 0);
  }

  function commitNotes() {
    setEditingNotes(false);
    const next = notesDraft.trim();
    if (next !== (timer?.notes ?? "").trim()) {
      onUpdateNotes(next);
    }
  }

  function onNotesKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitNotes();
    } else if (e.key === "Escape") {
      setEditingNotes(false);
    }
  }

  if (isRunning && timer?.start) {
    return (
      <div className="px-4 py-3">
        {/* Elapsed time + inline Stop. The round Stop
            icon mirrors the PWA so both surfaces share
            the same affordance. */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2.5">
            <div className="text-3xl font-light font-mono text-stone-900 tabular-nums tracking-wide">
              {elapsed}
            </div>
            <button
              type="button"
              onClick={onStop}
              title={t("stopTimer")}
              aria-label={t("stopTimer")}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 border border-red-500 text-white hover:brightness-110 transition-all"
            >
              <Square size={10} fill="currentColor" />
            </button>
          </div>
          <div className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 rounded-full bg-green-500/15 border border-green-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-green-700">
              {tc("active")}
            </span>
          </div>
        </div>

        {/* Customer */}
        {timer.customer && (
          <p className="text-xs text-stone-500 text-center mt-1.5">
            {timer.customer}
          </p>
        )}

        {/* Inline-editable description */}
        {editingDesc ? (
          <input
            ref={descInputRef}
            type="text"
            value={descDraft}
            onChange={(e) =>
              setDescDraft(e.target.value)
            }
            onBlur={commitDesc}
            onKeyDown={onDescKeyDown}
            placeholder={tc("descriptionOptional")}
            className={[
              "mt-1.5 w-full px-2 py-1 rounded text-xs text-center",
              "bg-surface-raised border border-cta",
              "text-stone-900 placeholder-stone-400",
              "focus:outline-none",
            ].join(" ")}
          />
        ) : (
          <button
            type="button"
            onClick={startEditingDesc}
            title={t("editDescriptionNotes")}
            className="group mt-1.5 w-full flex items-center justify-center gap-1 text-xs text-stone-500 hover:text-stone-800 transition-colors"
          >
            <span className="truncate max-w-[200px]">
              {timer.description || (
                <span className="italic text-stone-400">
                  {tc("descriptionOptional")}
                </span>
              )}
            </span>
            <Pencil
              size={10}
              className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
            />
          </button>
        )}

        {/* Inline-editable notes */}
        {editingNotes ? (
          <div className="mt-2">
            <textarea
              ref={notesRef}
              value={notesDraft}
              onChange={(e) =>
                setNotesDraft(e.target.value)
              }
              onBlur={commitNotes}
              onKeyDown={onNotesKeyDown}
              placeholder={t("notesPlaceholder")}
              rows={3}
              className={[
                "w-full px-2 py-1.5 rounded text-xs resize-none",
                "bg-surface-raised border border-cta",
                "text-stone-900 placeholder-stone-400",
                "focus:outline-none",
              ].join(" ")}
            />
            <p className="text-[10px] text-stone-400 mt-0.5 text-right">
              {tc("cmdEnterToSave")}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditingNotes}
            className="group mt-2 w-full text-left px-2 py-1.5 rounded text-xs bg-surface-raised border border-border hover:border-stone-300 transition-colors"
          >
            {timer.notes ? (
              <Markdown
                compact
                className={
                  "tray-notes group-hover:opacity-100 " +
                  "transition-colors"
                }
              >
                {timer.notes}
              </Markdown>
            ) : (
              <span className="flex items-center gap-1 text-stone-400 italic">
                <Pencil size={9} className="shrink-0" />
                {t("notesPlaceholder")}
              </span>
            )}
          </button>
        )}

      </div>
    );
  }

  if (stopped) {
    return (
      <div className="px-4 py-3">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="text-3xl font-light font-mono text-stone-900 tabular-nums tracking-wide">
              {stopped.finalElapsed}
            </div>
            <button
              type="button"
              onClick={onResume}
              title={tc("resume")}
              aria-label={tc("resume")}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500 border border-green-500 text-white hover:brightness-110 transition-all"
            >
              <Play size={10} fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={onClear}
              title={tc("clear")}
              aria-label={tc("clear")}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-border text-stone-500 hover:border-stone-400 hover:text-stone-800 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
          <div className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full bg-stone-500/15 border border-stone-500/40">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">
              {tc("stopped")}
            </span>
          </div>
        </div>
        {stopped.timer.customer && (
          <p className="text-xs text-stone-500 text-center mt-1.5">
            {stopped.timer.customer}
          </p>
        )}
        {stopped.timer.description && (
          <p className="text-xs text-stone-500 text-center mt-1 italic">
            {stopped.timer.description}
          </p>
        )}
      </div>
    );
  }

  // Start form
  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-4"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
        {t("quickStart")}
      </p>
      <div className="flex flex-col gap-2">
        <input
          list="tray-customers"
          value={customer}
          onChange={(e) =>
            setCustomer(e.target.value)
          }
          placeholder={tc("customer")}
          className={inputCls}
          autoFocus
        />
        <datalist id="tray-customers">
          {customers.map((c) => (
            <option key={c.name} value={c.name} />
          ))}
        </datalist>

        <input
          type="text"
          value={description}
          onChange={(e) =>
            setDescription(e.target.value)
          }
          placeholder={tc("descriptionOptional")}
          className={inputCls}
        />

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-cta text-white hover:bg-cta-hover transition-colors"
        >
          <Play size={12} fill="currentColor" />
          {t("startTimer")}
        </button>
      </div>
    </form>
  );
}

const inputCls = [
  "w-full px-3 py-1.5 rounded-lg text-xs",
  "bg-surface-raised border border-border",
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
  "transition-colors",
].join(" ");
