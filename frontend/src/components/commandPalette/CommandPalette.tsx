import { useEffect, useRef, useState } from "react";
import {
  Bot,
  BookOpen,
  Clock4,
  Columns2,
  GitPullRequest,
  History,
  Inbox,
  LayoutDashboard,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import type { View } from "../../App";
import {
  displayShortcut,
  useShortcutsContext,
} from "../../context/ShortcutsContext";
import { schedulePanelAction } from "../../utils/panelActions";

interface Command {
  id: string;
  label: string;
  hint: string;
  view: View;
  icon: React.ElementType;
  /** If set, schedules this action in the target panel after navigating. */
  panelAction?: string;
}

const COMMANDS: Command[] = [
  // Navigation
  { id: "goto-dashboard", label: "Dashboard", hint: "Go to", view: "dashboard", icon: LayoutDashboard },
  { id: "goto-board", label: "Board", hint: "Go to", view: "board", icon: Columns2 },
  { id: "goto-inbox", label: "Inbox", hint: "Go to", view: "inbox", icon: Inbox },
  { id: "goto-notes", label: "Notes", hint: "Go to", view: "notes", icon: NotebookPen },
  { id: "goto-customers", label: "Customers", hint: "Go to", view: "customers", icon: Users },
  { id: "goto-knowledge", label: "Knowledge", hint: "Go to", view: "knowledge", icon: BookOpen },
  { id: "goto-github", label: "GitHub Issues", hint: "Go to", view: "github", icon: GitPullRequest },
  { id: "goto-clocks", label: "Clock Entries", hint: "Go to", view: "clocks", icon: History },
  { id: "goto-cron", label: "Cron Jobs", hint: "Go to", view: "cron", icon: Clock4 },
  { id: "goto-settings", label: "Settings", hint: "Go to", view: "settings", icon: Settings },
  { id: "goto-advisor", label: "Advisor", hint: "Go to", view: "advisor", icon: Bot },
  // Create
  { id: "new-note", label: "New Note", hint: "Create", view: "notes", icon: Plus, panelAction: "open_form" },
  { id: "new-task", label: "New Task", hint: "Create", view: "board", icon: Plus },
  { id: "new-inbox", label: "New Inbox Item", hint: "Create", view: "inbox", icon: Plus },
  { id: "new-customer", label: "New Customer", hint: "Create", view: "customers", icon: Plus, panelAction: "open_form" },
  { id: "new-clock", label: "New Clock Entry", hint: "Create", view: "clocks", icon: Plus, panelAction: "open_form" },
];

interface Props {
  onNavigate: (view: View) => void;
  onClose: () => void;
}

export function CommandPalette({ onNavigate, onClose }: Props) {
  const { config } = useShortcutsContext();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  function execute(cmd: Command) {
    if (cmd.panelAction) schedulePanelAction(cmd.view, cmd.panelAction);
    onNavigate(cmd.view);
    onClose();
  }

  const filtered = query.trim()
    ? COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(query.trim().toLowerCase())
      )
    : COMMANDS;

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Scroll active item into view
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) execute(cmd);
      return;
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] pointer-events-none">
        <div
          className={[
            "pointer-events-auto w-full max-w-md mx-4",
            "bg-surface-card border border-border rounded-xl shadow-[var(--shadow-card-drag)]",
            "flex flex-col overflow-hidden",
          ].join(" ")}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
            <Search size={14} className="text-stone-600 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Go to or create…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className={[
                "flex-1 bg-transparent text-sm text-stone-900",
                "placeholder-stone-500 focus:outline-none",
              ].join(" ")}
            />
            <kbd className="text-[10px] text-stone-500 border border-border rounded px-1 py-0.5 shrink-0">
              ESC
            </kbd>
          </div>

          {/* Commands list */}
          <div ref={listRef} className="overflow-y-auto max-h-80 py-1">
            {filtered.length === 0 && (
              <p className="text-sm text-stone-500 text-center py-6">
                No results.
              </p>
            )}
            {filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              // Show nav shortcut only for goto commands (no panelAction)
              const shortcut =
                !cmd.panelAction ? config.views[cmd.view] : undefined;
              const isActive = idx === activeIdx;
              return (
                <button
                  key={cmd.id}
                  className={[
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left",
                    "transition-colors",
                    isActive
                      ? "bg-cta-muted text-cta"
                      : "text-stone-800 hover:bg-surface-raised",
                  ].join(" ")}
                  onClick={() => execute(cmd)}
                  onMouseEnter={() => setActiveIdx(idx)}
                >
                  <Icon
                    size={14}
                    className="shrink-0"
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                  <span className="text-[10px] text-stone-600 w-10 shrink-0 text-right">
                    {cmd.hint}
                  </span>
                  <span className="flex-1 text-sm">{cmd.label}</span>
                  {shortcut && (
                    <kbd className="text-[10px] text-stone-500 border border-border rounded px-1 py-0.5 shrink-0 font-mono">
                      {displayShortcut(shortcut)}
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
