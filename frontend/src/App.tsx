import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Clock,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from "lucide-react";
import ReactDOM from "react-dom";
import {
  useActiveTimer,
  useStopTimer,
} from "./hooks/useClocks";
import { CalendarWidget } from "./components/clock/CalendarWidget";
import { ClockList } from "./components/clock/ClockList";
import { StartForm } from "./components/clock/StartForm";
import {
  useCreateProfile,
  useCurrentUser,
  useSwitchProfile,
} from "./hooks/useSettings";
import { PixelAvatar } from "./components/common/PixelAvatar";
import { useEffect, useRef, useState } from "react";
import type { AdvisorMessage } from "./components/advisor/AdvisorView";
import { AdvisorView } from "./components/advisor/AdvisorView";
import { CommandPalette } from "./components/commandPalette/CommandPalette";
import { ClockWidget } from "./components/clock/ClockWidget";
import { ClockView } from "./components/clock/ClockView";
import { CronView } from "./components/cron/CronView";
import { CustomersView } from "./components/customers/CustomersView";
import { DashboardView } from "./components/dashboard/DashboardView";
import { GithubView } from "./components/github/GithubView";
import { InboxView } from "./components/inbox/InboxView";
import { KanbanBoard } from "./components/kanban/KanbanBoard";
import { KnowledgeView } from "./components/knowledge/KnowledgeView";
import { NotesView } from "./components/notes/NotesView";
import { Sidebar } from "./components/nav/Sidebar";
import { SettingsView } from "./components/settings/SettingsView";
import {
  ShortcutsProvider,
  matchesShortcut,
  useShortcutsContext,
} from "./context/ShortcutsContext";
import { ViewContext } from "./context/ViewContext";
import { useWebSocket } from "./hooks/useWebSocket";
import { schedulePanelAction } from "./utils/panelActions";

export type View =
  | "dashboard"
  | "board"
  | "inbox"
  | "notes"
  | "customers"
  | "knowledge"
  | "github"
  | "clocks"
  | "cron"
  | "settings"
  | "advisor";


const VALID_VIEWS = new Set<View>([
  "dashboard", "board", "inbox", "notes", "customers",
  "knowledge", "github",
  "clocks", "cron", "settings", "advisor",
]);

function MobileTimerModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { data: timer } = useActiveTimer();
  const [selectedDate, setSelectedDate] = useState<
    string | null
  >(null);
  const isRunning = timer?.active === true;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface-card">
      <div
        className={[
          "flex items-center px-4 py-3",
          "border-b border-border-subtle shrink-0",
        ].join(" ")}
      >
        <h2
          className={[
            "text-xs font-semibold tracking-wider",
            "uppercase text-stone-700 flex-1",
          ].join(" ")}
        >
          Time Tracking
        </h2>
        <button
          onClick={onClose}
          className={[
            "p-1 rounded text-stone-500",
            "hover:text-stone-900",
          ].join(" ")}
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {timer?.active && timer.start && timer.customer && (
          <ActiveTimerWidget
            timer={{
              customer: timer.customer!,
              description: timer.description,
              start: timer.start!,
            }}
          />
        )}
        {!isRunning && <StartForm onStarted={() => {}} />}
        <CalendarWidget
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
        <ClockList
          isRunning={isRunning}
          selectedDate={selectedDate}
        />
      </div>
    </div>,
    document.body,
  );
}

function ActiveTimerWidget({
  timer,
}: {
  timer: { customer: string; description?: string; start: string };
}) {
  const [, setTick] = useState(0);
  const stop = useStopTimer();

  useEffect(() => {
    const id = setInterval(
      () => setTick((n) => n + 1), 1000,
    );
    return () => clearInterval(id);
  }, []);

  const diffMs =
    Date.now() - new Date(timer.start).getTime();
  const totalSec = Math.max(
    0, Math.floor(diffMs / 1000),
  );
  const h = String(
    Math.floor(totalSec / 3600),
  ).padStart(2, "0");
  const m = String(
    Math.floor((totalSec % 3600) / 60),
  ).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");

  return (
    <div
      className={[
        "flex flex-col items-center gap-3 p-6",
        "rounded-xl bg-surface-raised",
        "border border-border-subtle",
      ].join(" ")}
    >
      <span className="text-4xl font-mono font-bold tabular-nums text-stone-900">
        {h}:{m}:{s}
      </span>
      <span className="text-xs text-emerald-500 font-semibold uppercase">
        Active
      </span>
      <p className="text-sm text-stone-700 text-center">
        <span className="font-semibold">
          {timer.customer}
        </span>
        {timer.description && (
          <span className="text-stone-500">
            {" "}&middot; {timer.description}
          </span>
        )}
      </p>
      <button
        onClick={() => stop.mutate()}
        disabled={stop.isPending}
        className={[
          "px-6 py-2 rounded-lg text-sm",
          "font-semibold bg-red-500 text-white",
          "hover:bg-red-600 transition-colors",
          "disabled:opacity-40",
        ].join(" ")}
      >
        {stop.isPending ? "Stopping..." : "Stop Timer"}
      </button>
    </div>
  );
}

function viewFromHash(): View {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return VALID_VIEWS.has(hash as View) ? (hash as View) : "board";
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true },
  },
});

type Theme = "dark" | "light";

function AppShell() {
  useWebSocket();
  const [view, setView] = useState<View>(viewFromHash);
  const [pendingSearch, setPendingSearch] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { config } = useShortcutsContext();
  const { data: currentUser } = useCurrentUser();
  const switchProf = useSwitchProfile();
  const createProf = useCreateProfile();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [newProfInput, setNewProfInput] = useState("");

  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) ?? "light"
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem("sidebar_open") !== "false"
  );
  const [clockOpen, setClockOpen] = useState(
    () => localStorage.getItem("clock_open") !== "false"
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileTimerOpen, setMobileTimerOpen] = useState(
    false,
  );
  const { data: timerData } = useActiveTimer();
  const timerActive = timerData?.active === true;

  const [appTitle, setAppTitle] = useState(
    () => localStorage.getItem("kaisho_app_title") || "KAISHO",
  );

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "kaisho_app_title") {
        setAppTitle(e.newValue || "KAISHO");
      }
    }
    function onCustom() {
      setAppTitle(
        localStorage.getItem("kaisho_app_title") || "KAISHO",
      );
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("app-title-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "app-title-changed", onCustom,
      );
    };
  }, []);

  const lastKeyRef = useRef<{ key: string; time: number } | null>(null);

  const [advisorMessages, setAdvisorMessages] = useState<AdvisorMessage[]>(
    () => {
      try {
        const raw = localStorage.getItem("advisor_messages");
        return raw ? (JSON.parse(raw) as AdvisorMessage[]) : [];
      } catch {
        return [];
      }
    }
  );
  const [advisorUnread, setAdvisorUnread] = useState(false);
  const prevMsgCountRef = useRef(advisorMessages.length);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      delete document.documentElement.dataset.theme;
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("sidebar_open", String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem("clock_open", String(clockOpen));
  }, [clockOpen]);

  useEffect(() => {
    localStorage.setItem(
      "advisor_messages",
      JSON.stringify(advisorMessages),
    );
    const len = advisorMessages.length;
    if (
      len > prevMsgCountRef.current &&
      advisorMessages[len - 1]?.role === "assistant" &&
      view !== "advisor"
    ) {
      setAdvisorUnread(true);
    }
    prevMsgCountRef.current = len;
  }, [advisorMessages, view]);

  useEffect(() => {
    if (view === "advisor") setAdvisorUnread(false);
  }, [view]);

  useEffect(() => {
    window.location.hash = `/${view}`;
  }, [view]);

  useEffect(() => {
    const handler = () => setView(viewFromHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if another handler already consumed the event
      if (e.defaultPrevented) return;
      // Command palette shortcut (always active)
      if (matchesShortcut(e, config.commandPalette)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // Escape closes palette
      if (e.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      // Shortcuts — ignore when palette is open or input focused
      if (paletteOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

      // Action shortcuts (e.g. Shift+B → new task)
      for (const [action, shortcut] of Object.entries(
        config.actions,
      )) {
        if (matchesShortcut(e, shortcut)) {
          e.preventDefault();
          const panel = action.replace("new:", "");
          setView(panel as View);
          setTimeout(() => schedulePanelAction(
            panel, "open_form",
          ), 0);
          return;
        }
      }

      // View shortcuts (plain keys, no modifiers)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      for (const [v, shortcut] of Object.entries(
        config.views,
      )) {
        if (matchesShortcut(e, shortcut)) {
          const now = Date.now();
          const last = lastKeyRef.current;
          if (
            last &&
            last.key === e.key &&
            now - last.time < 500
          ) {
            schedulePanelAction(v, "open_form");
            lastKeyRef.current = null;
          } else {
            lastKeyRef.current = {
              key: e.key,
              time: now,
            };
          }
          setView(v as View);
          return;
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [config, paletteOpen]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-border-subtle">
        {/* Hamburger (mobile only) */}
        <button
          onClick={() => setMobileNavOpen((v) => !v)}
          className="md:hidden p-1 rounded text-stone-600 hover:text-stone-900"
        >
          {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <button
          onClick={() => setView("dashboard")}
          className="flex items-center opacity-80 hover:opacity-100 transition-opacity"
        >
          <img
            src={
              theme === "dark"
                ? "/kaisho-logo-light.svg"
                : "/kaisho-logo.svg"
            }
            alt="Kaisho"
            className="h-6"
          />
        </button>
        <button
          onClick={() => setView("dashboard")}
          className="text-sm font-bold tracking-[0.06em] uppercase text-stone-700 hover:text-cta transition-colors hidden sm:block"
        >
          {appTitle}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {/* Mobile timer button */}
          <button
            onClick={() => setMobileTimerOpen(true)}
            className={[
              "md:hidden p-1 rounded transition-colors",
              timerActive
                ? "text-cta animate-pulse"
                : "text-stone-500 hover:text-stone-900",
            ].join(" ")}
            title="Time tracking"
          >
            <Clock size={16} />
          </button>
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className={headerBtn}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* User menu */}
          {currentUser && (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-surface-raised transition-colors"
              >
                <span className="text-sm font-semibold text-stone-900 hidden sm:inline">
                  {currentUser.name || "User"}
                </span>
                <PixelAvatar
                  seed={currentUser.avatar_seed || "kaisho"}
                  size={22}
                />
              </button>

              {userMenuOpen && (
                <div className="absolute top-full right-0 mt-1 w-48 rounded-lg bg-surface-overlay border border-border shadow-lg p-2 flex flex-col gap-1 z-50">
                  {/* Profiles */}
                  <p className="text-[9px] text-stone-500 px-1 uppercase tracking-wider">
                    Profile
                  </p>
                  {(currentUser.profiles ?? []).map((p: string) => (
                    <button
                      key={p}
                      onClick={() => {
                        if (p !== currentUser.profile) {
                          switchProf.mutate(p, {
                            onSuccess: () => window.location.reload(),
                          });
                        }
                        setUserMenuOpen(false);
                      }}
                      className={[
                        "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                        p === currentUser.profile
                          ? "text-cta bg-cta-muted"
                          : "text-stone-800 hover:bg-surface-raised",
                      ].join(" ")}
                    >
                      {p}
                    </button>
                  ))}
                  {newProfInput !== null && newProfInput !== "" ? (
                    <input
                      autoFocus
                      type="text"
                      value={newProfInput}
                      onChange={(e) => setNewProfInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newProfInput.trim()) {
                          const n = newProfInput.trim();
                          createProf.mutate(n, {
                            onSuccess: () => {
                              switchProf.mutate(n, {
                                onSuccess: () => window.location.reload(),
                              });
                            },
                            onError: () => {
                              switchProf.mutate(n, {
                                onSuccess: () => window.location.reload(),
                              });
                            },
                          });
                        }
                        if (e.key === "Escape") setNewProfInput("");
                      }}
                      placeholder="Profile name"
                      className="w-full px-2 py-1 rounded text-xs bg-surface-raised border border-border text-stone-900 focus:outline-none focus:border-cta"
                    />
                  ) : (
                    <button
                      onClick={() => setNewProfInput(" ")}
                      className="w-full text-left px-2 py-1 rounded text-xs text-stone-500 hover:text-stone-900 hover:bg-surface-raised"
                    >
                      + New profile
                    </button>
                  )}

                  {/* Settings */}
                  <div className="border-t border-border-subtle my-0.5" />
                  <button
                    onClick={() => {
                      setView("settings");
                      setUserMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded text-xs text-stone-800 hover:bg-surface-raised flex items-center gap-2"
                  >
                    <Settings size={12} />
                    Settings
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <ViewContext.Provider value={{
        setView: (v, search = "") => {
          setView(v);
          setPendingSearch(search);
        },
        pendingSearch,
        clearPendingSearch: () => setPendingSearch(""),
      }}>
        <div className="flex flex-1 min-h-0">
          {/* Mobile nav overlay */}
          {mobileNavOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
          )}
          <div
            className={[
              "md:relative md:translate-x-0",
              "fixed inset-y-0 left-0 z-50",
              "transition-transform duration-200",
              mobileNavOpen
                ? "translate-x-0"
                : "-translate-x-full md:translate-x-0",
            ].join(" ")}
          >
            <Sidebar
              active={view}
              onChange={(v) => {
                setView(v);
                setMobileNavOpen(false);
              }}
              open={sidebarOpen}
              onToggle={() => setSidebarOpen((v) => !v)}
              advisorUnread={advisorUnread}
            />
          </div>

          <main className="flex-1 min-w-0 overflow-hidden relative">
            {view === "dashboard" && <DashboardView />}
            {view === "board" && <KanbanBoard />}
            {view === "inbox" && <InboxView />}
            {view === "notes" && <NotesView />}
            {view === "customers" && <CustomersView />}
            {view === "knowledge" && <KnowledgeView />}
            {view === "github" && <GithubView />}
            {view === "clocks" && <ClockView />}
            {view === "cron" && <CronView />}
            {view === "settings" && <SettingsView />}
            {/* Always mounted so chat state survives navigation */}
            <div className={view === "advisor" ? "h-full" : "hidden"}>
              <AdvisorView
                messages={advisorMessages}
                onMessagesChange={setAdvisorMessages}
              />
            </div>
          </main>

          <div className="hidden md:flex">
            <ClockWidget
              open={clockOpen}
              onToggle={() => setClockOpen((v) => !v)}
            />
          </div>
        </div>
      </ViewContext.Provider>

      {paletteOpen && (
        <CommandPalette
          onNavigate={setView}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {/* Mobile timer full-screen modal */}
      {mobileTimerOpen && (
        <MobileTimerModal
          onClose={() => setMobileTimerOpen(false)}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ShortcutsProvider>
        <AppShell />
      </ShortcutsProvider>
    </QueryClientProvider>
  );
}

const headerBtn = [
  "p-1.5 rounded-md text-stone-600",
  "hover:text-stone-900 hover:bg-surface-raised",
  "transition-colors",
].join(" ");
