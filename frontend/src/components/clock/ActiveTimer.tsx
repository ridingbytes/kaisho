import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Square } from "lucide-react";
import { useStopTimer, useUpdateClockEntry } from "../../hooks/useClocks";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import { elapsed } from "../../utils/formatting";
import type { ActiveTimer as ActiveTimerType } from "../../types";

interface Props {
  timer: ActiveTimerType;
}

export function ActiveTimer({ timer }: Props) {
  const { t } = useTranslation("clocks");
  const { t: tc } = useTranslation("common");
  const [tick, setTick] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(timer.notes ?? "");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useStopTimer();
  const updateEntry = useUpdateClockEntry();
  const customerColors = useCustomerColors();

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Sync notes from timer prop when it changes (e.g. external update)
  useEffect(() => {
    setNotes(timer.notes ?? "");
  }, [timer.notes]);

  function saveNotes(value: string) {
    if (!timer.start) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    updateEntry.mutate({
      entry: {
        sync_id: timer.sync_id ?? null,
        start: timer.start!,
      },
      updates: { notes: value },
    });
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    if (!timer.start) return;
    saveTimeout.current = setTimeout(
      () => saveNotes(value), 800
    );
  }

  function handleNotesKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      saveNotes(notes);
      setNotesOpen(false);
    }
  }

  if (!timer.active || !timer.start) return null;

  const custColor = timer.customer
    ? customerColors[timer.customer]
    : undefined;

  return (
    <div className="rounded-xl border border-border bg-surface-card p-4 shadow-card text-center">
      {/* Timer digits + stop button */}
      <div className="flex items-center justify-center gap-3">
        <div
          key={tick}
          className="text-3xl font-light font-mono text-stone-900 tabular-nums tracking-wide"
        >
          {elapsed(timer.start)}
        </div>
        <button
          onClick={() => stop.mutate()}
          disabled={stop.isPending}
          title={t("stopTimer")}
          className={[
            "p-1.5 rounded-lg transition-colors",
            "text-red-400 hover:text-red-500",
            "hover:bg-red-500/10",
            "disabled:opacity-40",
          ].join(" ")}
        >
          <Square size={14} fill="currentColor" />
        </button>
      </div>

      {/* Active badge */}
      <div className="flex items-center justify-center mt-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-green-500/10">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-semibold tracking-wider uppercase text-green-600">
            {tc("active")}
          </span>
        </div>
      </div>

      {/* Customer · description + edit pen */}
      <div className="flex items-center justify-center gap-1 mt-2">
        <p className="text-xs text-stone-500 truncate flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: custColor || "#a1a1aa",
            }}
          />
          <span className="text-stone-700">
            {timer.customer}
          </span>
          {timer.description && (
            <>
              <span className="font-bold text-stone-400">
                &middot;
              </span>
              <span className="truncate">
                {timer.description}
              </span>
            </>
          )}
        </p>
        <button
          onClick={() => setNotesOpen((v) => !v)}
          title={t("editDescriptionNotes")}
          className={[
            "p-1 rounded transition-colors shrink-0",
            notesOpen
              ? "text-cta"
              : "text-stone-400 hover:text-stone-700",
          ].join(" ")}
        >
          <Pencil size={10} />
        </button>
      </div>

      {notesOpen && (
        <div className="mt-3 pt-3 border-t border-cta/20">
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            onKeyDown={handleNotesKeyDown}
            placeholder={t("sessionNotes")}
            rows={3}
            className={[
              "w-full px-2 py-1.5 rounded-lg text-xs resize-none",
              "bg-surface-raised border border-border",
              "text-stone-800 placeholder-stone-500",
              "focus:outline-none focus:border-cta",
            ].join(" ")}
          />
          <p className="text-[9px] text-stone-400 mt-1 text-right">
            {tc("cmdSaveClose")}
          </p>
        </div>
      )}
    </div>
  );
}
