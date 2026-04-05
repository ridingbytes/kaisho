import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useActiveTimer } from "../../hooks/useClocks";
import { ActiveTimer } from "./ActiveTimer";
import { CalendarWidget } from "./CalendarWidget";
import { ClockList } from "./ClockList";
import { QuickBookForm } from "./QuickBookForm";
import { StartForm } from "./StartForm";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";

type ActionTab = "start" | "book";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateHeading(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface ClockWidgetProps {
  open: boolean;
}

export function ClockWidget({ open }: ClockWidgetProps) {
  const { data: timer } = useActiveTimer();
  const [tab, setTab] = useState<ActionTab>("start");
  const [calendarOpen, setCalendarOpen] = useState(
    () => localStorage.getItem("clock_calendar_open") !== "false"
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(
    null
  );

  const isRunning = timer?.active === true;

  function toggleCalendar() {
    setCalendarOpen((v) => {
      const next = !v;
      localStorage.setItem("clock_calendar_open", String(next));
      return next;
    });
  }

  return (
    <aside
      className={[
        "flex flex-col shrink-0 border-l border-border-subtle bg-surface-card",
        "overflow-hidden transition-[width] duration-200",
        open ? "w-80" : "w-0",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-border-subtle shrink-0">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-400 flex-1">
          Time Tracking
        </h2>
        <HelpButton title="Time Tracking" doc={DOCS.clock} />
      </div>

      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        {/* Active timer */}
        {timer && <ActiveTimer timer={timer} />}

        {/* Start/Book forms — always visible when no timer running */}
        {!isRunning && (
          <div>
            <div className="flex rounded-lg bg-surface-raised border border-border p-0.5 mb-3">
              {(["start", "book"] as ActionTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={[
                    "flex-1 py-1.5 rounded-md text-xs font-semibold capitalize",
                    "transition-colors",
                    tab === t
                      ? "bg-surface-overlay text-slate-200"
                      : "text-slate-600 hover:text-slate-400",
                  ].join(" ")}
                >
                  {t === "start" ? "Start" : "Quick Book"}
                </button>
              ))}
            </div>

            {tab === "start" ? <StartForm /> : <QuickBookForm />}
          </div>
        )}

        <div className="border-t border-border-subtle" />

        {/* Calendar — collapsible, persistent */}
        <div>
          <button
            onClick={toggleCalendar}
            className="w-full flex items-center gap-1 group mb-1"
          >
            {calendarOpen
              ? <ChevronDown size={10} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
              : <ChevronRight size={10} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
            }
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 group-hover:text-slate-400 transition-colors">
              Calendar
            </h3>
          </button>
          {calendarOpen && (
            <CalendarWidget
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
            />
          )}
        </div>

        <div className="border-t border-border-subtle" />

        {/* Entries for selected date */}
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
            {!selectedDate || selectedDate === todayIso()
              ? "Today"
              : formatDateHeading(selectedDate)}
          </h3>
          <ClockList
            isRunning={isRunning}
            selectedDate={selectedDate}
          />
        </div>
      </div>
    </aside>
  );
}
