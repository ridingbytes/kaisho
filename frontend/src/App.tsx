import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Moon, Settings, Sun } from "lucide-react";
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

const VIEW_TITLES: Record<View, string> = {
  dashboard: "Dashboard",
  board: "Board",
  inbox: "Inbox",
  notes: "Notes",
  customers: "Customers",
  knowledge: "Knowledge",
  github: "GitHub",
  clocks: "Clock Entries",
  cron: "Cron",
  settings: "Settings",
  advisor: "Advisor",
};

const VALID_VIEWS = new Set<View>([
  "dashboard", "board", "inbox", "notes", "customers",
  "knowledge", "github",
  "clocks", "cron", "settings", "advisor",
]);

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
      // View shortcuts — ignore when palette is open or input is focused
      if (paletteOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      for (const [v, shortcut] of Object.entries(config.views)) {
        if (matchesShortcut(e, shortcut)) {
          // Double-tap same shortcut → open "new item" form in that panel
          const now = Date.now();
          const last = lastKeyRef.current;
          if (last && last.key === e.key && now - last.time < 500) {
            schedulePanelAction(v, "open_form");
            lastKeyRef.current = null;
          } else {
            lastKeyRef.current = { key: e.key, time: now };
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
        <span className="text-border mx-0.5">·</span>
        <span className="text-sm font-semibold text-stone-900">
          {VIEW_TITLES[view]}
        </span>
        <div className="ml-auto flex items-center gap-2">
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
                <span className="text-sm font-semibold text-stone-900">
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
          <Sidebar
            active={view}
            onChange={setView}
            open={sidebarOpen}
            onToggle={() => setSidebarOpen((v) => !v)}
            advisorUnread={advisorUnread}
          />

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

          <ClockWidget
            open={clockOpen}
            onToggle={() => setClockOpen((v) => !v)}
          />
        </div>
      </ViewContext.Provider>

      {paletteOpen && (
        <CommandPalette
          onNavigate={setView}
          onClose={() => setPaletteOpen(false)}
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
