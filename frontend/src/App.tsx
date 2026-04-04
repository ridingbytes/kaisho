import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ClockWidget } from "./components/clock/ClockWidget";
import { CustomersView } from "./components/customers/CustomersView";
import { DashboardView } from "./components/dashboard/DashboardView";
import { InboxView } from "./components/inbox/InboxView";
import { KanbanBoard } from "./components/kanban/KanbanBoard";
import { Sidebar } from "./components/nav/Sidebar";
import { ViewContext } from "./context/ViewContext";
import { useWebSocket } from "./hooks/useWebSocket";

export type View = "dashboard" | "board" | "inbox" | "customers";

const VIEW_TITLES: Record<View, string> = {
  dashboard: "Dashboard",
  board: "Board",
  inbox: "Inbox",
  customers: "Customers",
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true },
  },
});

function AppShell() {
  useWebSocket();
  const [view, setView] = useState<View>("board");

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

          <main className="flex-1 min-w-0 overflow-hidden">
            {view === "dashboard" && <DashboardView />}
            {view === "board" && <KanbanBoard />}
            {view === "inbox" && <InboxView />}
            {view === "customers" && <CustomersView />}
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
