import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Moon, PanelLeft, PanelRight, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdvisorMessage } from "./components/advisor/AdvisorView";
import { AdvisorView } from "./components/advisor/AdvisorView";
import { CommandPalette } from "./components/commandPalette/CommandPalette";
import { ClockWidget } from "./components/clock/ClockWidget";
import { ClockView } from "./components/clock/ClockView";
import { CommunicationsView } from "./components/communications/CommunicationsView";
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

export type View =
  | "dashboard"
  | "board"
  | "inbox"
  | "notes"
  | "customers"
  | "knowledge"
  | "github"
  | "communications"
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
  communications: "Communications",
  clocks: "Clock Entries",
  cron: "Cron",
  settings: "Settings",
  advisor: "Advisor",
};

const VALID_VIEWS = new Set<View>([
  "dashboard", "board", "inbox", "notes", "customers",
  "knowledge", "github", "communications", "clocks", "cron",
  "settings", "advisor",
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { config } = useShortcutsContext();

  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) ?? "dark"
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem("sidebar_open") !== "false"
  );
  const [clockOpen, setClockOpen] = useState(
    () => localStorage.getItem("clock_open") !== "false"
  );

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

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.dataset.theme = "light";
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
    localStorage.setItem("advisor_messages", JSON.stringify(advisorMessages));
  }, [advisorMessages]);

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
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className={headerBtn}
        >
          <PanelLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-slate-500 tracking-widest uppercase">
          OmniControl
        </span>
        <span className="text-border mx-0.5">·</span>
        <span className="text-sm font-semibold text-slate-200">
          {VIEW_TITLES[view]}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className={headerBtn}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            onClick={() => setClockOpen((v) => !v)}
            title={clockOpen ? "Collapse time tracking" : "Expand time tracking"}
            className={headerBtn}
          >
            <PanelRight size={14} />
          </button>
        </div>
      </header>

      {/* Body */}
      <ViewContext.Provider value={{ setView }}>
        <div className="flex flex-1 min-h-0">
          <Sidebar active={view} onChange={setView} open={sidebarOpen} />

          <main className="flex-1 min-w-0 overflow-hidden relative">
            {view === "dashboard" && <DashboardView />}
            {view === "board" && <KanbanBoard />}
            {view === "inbox" && <InboxView />}
            {view === "notes" && <NotesView />}
            {view === "customers" && <CustomersView />}
            {view === "knowledge" && <KnowledgeView />}
            {view === "github" && <GithubView />}
            {view === "communications" && <CommunicationsView />}
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

          <ClockWidget open={clockOpen} />
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
  "p-1.5 rounded-md text-slate-500",
  "hover:text-slate-300 hover:bg-surface-raised",
  "transition-colors",
].join(" ");
