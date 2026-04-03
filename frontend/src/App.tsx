import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KanbanBoard } from "./components/kanban/KanbanBoard";
import { ClockWidget } from "./components/clock/ClockWidget";
import { useWebSocket } from "./hooks/useWebSocket";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true },
  },
});

function AppShell() {
  useWebSocket();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 h-12 shrink-0 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-sm font-semibold text-slate-200 tracking-wide">
            OmniControl
          </span>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 overflow-hidden">
          <KanbanBoard />
        </main>
        <ClockWidget />
      </div>
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
