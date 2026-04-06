import {
  Bot,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  Clock4,
  Columns2,
  GitPullRequest,
  History,
  Inbox,
  LayoutDashboard,
  NotebookPen,
  Users,
} from "lucide-react";
import type { View } from "../../App";
import {
  displayShortcut,
  useShortcutsContext,
} from "../../context/ShortcutsContext";
import { useInboxItems } from "../../hooks/useInbox";

interface NavItem {
  id: View;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "board", label: "Board", icon: Columns2 },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "customers", label: "Customers", icon: Users },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "github", label: "GitHub", icon: GitPullRequest },
  { id: "clocks", label: "Clocks", icon: History },
  { id: "cron", label: "Cron", icon: Clock4 },
  { id: "advisor", label: "Advisor", icon: Bot },
];

interface SidebarProps {
  active: View;
  onChange: (v: View) => void;
  open: boolean;
  onToggle: () => void;
  advisorUnread?: boolean;
}

export function Sidebar({
  active,
  onChange,
  open,
  onToggle,
  advisorUnread,
}: SidebarProps) {
  const { data: inboxItems } = useInboxItems();
  const inboxCount = inboxItems?.length ?? 0;
  const { config } = useShortcutsContext();

  return (
    <nav
      className={[
        "flex flex-col shrink-0 border-r border-border-subtle bg-surface-card",
        "transition-[width] duration-200 py-2 gap-0.5",
        open ? "w-40" : "w-14",
      ].join(" ")}
    >
      {/* Toggle */}
      <button
        onClick={onToggle}
        title={open ? "Collapse" : "Expand"}
        className={[
          "flex items-center rounded-lg transition-colors",
          "text-slate-600 hover:text-slate-300 hover:bg-surface-raised",
          open ? "px-3 h-7 justify-end" : "mx-2 h-7 justify-center",
        ].join(" ")}
      >
        {open
          ? <ChevronsLeft size={14} />
          : <ChevronsRight size={14} />}
      </button>

      {/* Nav items */}
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            title={
              config.views[id]
                ? `${label} (${displayShortcut(config.views[id])})`
                : label
            }
            onClick={() => onChange(id)}
            className={[
              "relative flex items-center",
              open
                ? "px-3 gap-2.5 h-8"
                : "flex-col justify-center mx-2 h-10 gap-1",
              "rounded-lg transition-colors",
              "text-[9px] font-semibold tracking-wider uppercase",
              isActive
                ? "bg-accent-muted text-accent"
                : "text-slate-400 hover:text-slate-200 hover:bg-surface-raised",
            ].join(" ")}
          >
            <Icon
              size={open ? 14 : 16}
              strokeWidth={isActive ? 2 : 1.5}
              className="shrink-0"
            />
            <span className="leading-none truncate">
              {open ? label : label.slice(0, 3)}
            </span>

            {/* Inbox badge */}
            {id === "inbox" && inboxCount > 0 && (
              <span
                className={[
                  "absolute top-1 right-1.5 min-w-[14px] h-3.5 px-0.5",
                  "flex items-center justify-center rounded-full",
                  "text-[9px] font-bold bg-accent text-white",
                ].join(" ")}
              >
                {inboxCount > 99 ? "99+" : inboxCount}
              </span>
            )}

            {/* Advisor unread dot */}
            {id === "advisor" && advisorUnread && (
              <span className="absolute top-1 right-1.5 w-2.5 h-2.5 rounded-full bg-accent" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
