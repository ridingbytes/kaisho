import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AdvisorMessage } from "./components/advisor/AdvisorView";
import { AdvisorView } from "./components/advisor/AdvisorView";
import { ClockWidget } from "./components/clock/ClockWidget";
import { CommunicationsView } from "./components/communications/CommunicationsView";
import { CronView } from "./components/cron/CronView";
import { CustomersView } from "./components/customers/CustomersView";
import { DashboardView } from "./components/dashboard/DashboardView";
import { GithubView } from "./components/github/GithubView";
import { InboxView } from "./components/inbox/InboxView";
import { KanbanBoard } from "./components/kanban/KanbanBoard";
import { KnowledgeView } from "./components/knowledge/KnowledgeView";
import { Sidebar } from "./components/nav/Sidebar";
import { SettingsView } from "./components/settings/SettingsView";
import { ViewContext } from "./context/ViewContext";
import { useWebSocket } from "./hooks/useWebSocket";

export type View =
  | "dashboard"
  | "board"
  | "inbox"
  | "customers"
  | "knowledge"
  | "github"
  | "communications"
  | "cron"
  | "settings"
  | "advisor";

const VIEW_TITLES: Record<View, string> = {
  dashboard: "Dashboard",
  board: "Board",
  inbox: "Inbox",
  customers: "Customers",
  knowledge: "Knowledge",
  github: "GitHub",
  communications: "Communications",
  cron: "Cron",
  settings: "Settings",
  advisor: "Advisor",
};

const VALID_VIEWS = new Set<View>([
  "dashboard", "board", "inbox", "customers",
  "knowledge", "github", "communications", "cron", "settings", "advisor",
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

function AppShell() {
  useWebSocket();
  const [view, setView] = useState<View>(viewFromHash);
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
    localStorage.setItem(
      "advisor_messages",
      JSON.stringify(advisorMessages)
    );
  }, [advisorMessages]);

  useEffect(() => {
    window.location.hash = `/${view}`;
  }, [view]);

  useEffect(() => {
    const handler = () => setView(viewFromHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-11 shrink-0 border-b border-border-subtle">
        <span className="text-xs font-semibold text-slate-500 tracking-widest uppercase">
          OmniControl
        </span>
        <span className="text-border mx-1">·</span>
        <span className="text-sm font-semibold text-slate-200">
          {VIEW_TITLES[view]}
        </span>
      </header>

      {/* Body */}
      <ViewContext.Provider value={{ setView }}>
        <div className="flex flex-1 min-h-0">
          <Sidebar active={view} onChange={setView} />

          <main className="flex-1 min-w-0 overflow-hidden relative">
            {view === "dashboard" && <DashboardView />}
            {view === "board" && <KanbanBoard />}
            {view === "inbox" && <InboxView />}
            {view === "customers" && <CustomersView />}
            {view === "knowledge" && <KnowledgeView />}
            {view === "github" && <GithubView />}
            {view === "communications" && <CommunicationsView />}
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

          <ClockWidget />
        </div>
      </ViewContext.Provider>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
