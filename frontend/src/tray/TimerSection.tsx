import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Play, Square } from "lucide-react";
import type { ActiveTimer, Customer } from "../types";

interface Props {
  timer: ActiveTimer | null;
  isRunning: boolean;
  elapsed: string;
  customers: Customer[];
  onStart: (
    customer: string,
    description: string,
    contract?: string,
  ) => void;
  onStop: () => void;
  onUpdateDescription: (desc: string) => void;
  onUpdateNotes: (notes: string) => void;
}

export function TimerSection({
  timer,
  isRunning,
  elapsed,
  customers,
  onStart,
  onStop,
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
        {/* Elapsed time */}
        <div className="text-center">
          <div className="text-3xl font-light font-mono text-stone-900 tabular-nums tracking-wide">
            {elapsed}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-green-600">
              {tc("active")}
            </span>
          </div>
        </div>

        {/* Customer */}
        <p className="text-xs text-stone-500 text-center mt-1.5">
          {timer.customer}
        </p>

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
              <span className="text-stone-600 line-clamp-2 group-hover:text-stone-800 transition-colors">
                {timer.notes}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-stone-400 italic">
                <Pencil size={9} className="shrink-0" />
                {t("notesPlaceholder")}
              </span>
            )}
          </button>
        )}

        {/* Stop button */}
        <button
          onClick={onStop}
          className="mt-2.5 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
        >
          <Square size={12} fill="currentColor" />
          {t("stopTimer")}
        </button>
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
