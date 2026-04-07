import { useEffect, useRef, useState } from "react";
import { StickyNote } from "lucide-react";
import { useStopTimer, useUpdateClockEntry } from "../../hooks/useClocks";
import { useCustomerColors } from "../../hooks/useCustomerColors";
import type { ActiveTimer as ActiveTimerType } from "../../types";

function elapsed(startIso: string): string {
  const diffMs = Date.now() - new Date(startIso).getTime();
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  timer: ActiveTimerType;
}

export function ActiveTimer({ timer }: Props) {
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
      startIso: timer.start!,
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
    <div className="rounded-xl border border-border bg-surface-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-semibold tracking-wider uppercase text-green-600">
              Active
            </span>
          </div>
          <p className="text-sm font-semibold text-stone-900 truncate flex items-center gap-1.5">
            {custColor && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: custColor }}
              />
            )}
            {timer.customer}
          </p>
          {timer.description && (
            <p className="text-xs text-stone-600 truncate mt-0.5">
              {timer.description}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <div
            key={tick}
            className="text-2xl font-mono font-semibold text-stone-900 tabular-nums"
          >
            {elapsed(timer.start)}
          </div>
          <div className="flex items-center justify-end gap-1 mt-2">
            <button
              onClick={() => setNotesOpen((v) => !v)}
              title="Add notes"
              className={[
                "px-2 py-1 rounded-lg text-xs font-semibold transition-colors",
                notesOpen || notes
                  ? "bg-cta/10 text-cta border border-cta/20"
                  : "bg-surface-raised text-stone-600 border border-border-subtle",
                "hover:text-cta hover:border-cta/20",
              ].join(" ")}
            >
              <StickyNote size={12} />
            </button>
            <button
              onClick={() => stop.mutate()}
              disabled={stop.isPending}
              className={[
                "px-3 py-1 rounded-lg text-xs font-semibold",
                "bg-red-500/10 text-red-500 border border-red-500/20",
                "hover:bg-red-500/20 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {stop.isPending ? "Stopping…" : "Stop"}
            </button>
          </div>
        </div>
      </div>

      {notesOpen && (
        <div className="mt-3 pt-3 border-t border-cta/20">
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            onKeyDown={handleNotesKeyDown}
            placeholder="Session notes…"
            rows={3}
            className={[
              "w-full px-2 py-1.5 rounded-lg text-xs resize-none",
              "bg-surface-raised border border-border",
              "text-stone-800 placeholder-stone-500",
              "focus:outline-none focus:border-cta",
            ].join(" ")}
          />
          <p className="text-[9px] text-stone-400 mt-1 text-right">
            ⌘↵ save &amp; close
          </p>
        </div>
      )}
    </div>
  );
}
