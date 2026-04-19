import { useTranslation } from "react-i18next";
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
  Settings,
  Users,
} from "lucide-react";
import type { View } from "../../App";
import {
  displayShortcut,
  useShortcutsContext,
} from "../../context/ShortcutsContext";
import { useUnreadBadges } from "../../hooks/useUnreadBadges";

interface NavItem {
  id: View;
  /** i18n key inside the "nav" namespace. */
  labelKey: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { id: "board", labelKey: "board", icon: Columns2 },
  { id: "inbox", labelKey: "inbox", icon: Inbox },
  { id: "notes", labelKey: "notes", icon: NotebookPen },
  { id: "customers", labelKey: "customers", icon: Users },
  { id: "knowledge", labelKey: "knowledge", icon: BookOpen },
  { id: "github", labelKey: "github", icon: GitPullRequest },
  { id: "clocks", labelKey: "clocks", icon: History },
  { id: "cron", labelKey: "cron", icon: Clock4 },
  { id: "advisor", labelKey: "advisor", icon: Bot },
];

const BOTTOM_NAV: NavItem[] = [
  { id: "settings", labelKey: "settings", icon: Settings },
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
  const { t } = useTranslation("nav");
  const unread = useUnreadBadges(active);
  const { config } = useShortcutsContext();

  // On mobile the sidebar is in an overlay, always expanded.
  // On desktop, the open prop controls collapsed/expanded.
  const expanded = open;

  return (
    <nav
      className={[
        "flex flex-col shrink-0 border-r",
        "border-border-subtle bg-surface-card",
        "transition-[width] duration-200 py-2 gap-0.5",
        "h-full w-40",
        !expanded && "md:w-14",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Toggle (hidden on mobile -- sidebar is overlay) */}
      <button
        onClick={onToggle}
        title={open ? "Collapse" : "Expand"}
        className={[
          "hidden md:flex items-center rounded-lg",
          "transition-colors",
          "text-stone-500 hover:text-stone-900",
          "hover:bg-surface-raised",
          open
            ? "px-3 h-7 justify-end"
            : "mx-2 h-7 justify-center",
        ].join(" ")}
      >
        {open
          ? <ChevronsLeft size={14} />
          : <ChevronsRight size={14} />}
      </button>

      {/* Nav items */}
      {NAV_ITEMS.map(({ id, labelKey, icon: Icon }) => {
        const isActive = active === id;
        const badge = unread[id] ?? 0;
        const label = t(labelKey);
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
              // Mobile: always horizontal. Desktop: depends on open
              "px-3 gap-2.5 h-8",
              !expanded && "md:flex-col md:justify-center md:mx-2 md:h-10 md:gap-1 md:px-0",
              "rounded-lg transition-colors",
              "text-[11px] font-semibold tracking-wider",
              "uppercase",
              isActive
                ? "bg-cta-muted text-cta"
                : "text-stone-700 hover:text-stone-900 hover:bg-surface-raised",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="relative shrink-0">
              <Icon
                size={expanded ? 14 : 16}
                strokeWidth={isActive ? 2 : 1.5}
              />
              {/* Unread badge */}
              {badge > 0 && (
                <span
                  className={[
                    "absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-0.5",
                    "flex items-center justify-center rounded-full",
                    "text-[9px] font-bold bg-cta text-white",
                  ].join(" ")}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              {/* Advisor unread dot */}
              {id === "advisor" && advisorUnread && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cta" />
              )}
            </span>
            <span className="leading-none truncate">
              {expanded ? label : label.slice(0, 3)}
            </span>
          </button>
        );
      })}

      {/* Spacer pushes settings to the bottom */}
      <div className="flex-1" />

      {/* Bottom nav (settings) */}
      {BOTTOM_NAV.map(({ id, labelKey, icon: Icon }) => {
        const isActive = active === id;
        const label = t(labelKey);
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
              "px-3 gap-2.5 h-8",
              !expanded && "md:flex-col md:justify-center md:mx-2 md:h-10 md:gap-1 md:px-0",
              "rounded-lg transition-colors",
              "text-[11px] font-semibold tracking-wider",
              "uppercase",
              isActive
                ? "bg-cta-muted text-cta"
                : "text-stone-700 hover:text-stone-900 hover:bg-surface-raised",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Icon
              size={expanded ? 14 : 16}
              strokeWidth={isActive ? 2 : 1.5}
            />
            <span className="leading-none truncate">
              {expanded ? label : label.slice(0, 3)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
