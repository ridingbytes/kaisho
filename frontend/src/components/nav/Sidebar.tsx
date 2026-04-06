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
  Settings,
  User,
  Users,
} from "lucide-react";
import type { View } from "../../App";
import {
  displayShortcut,
  useShortcutsContext,
} from "../../context/ShortcutsContext";
import { useInboxItems } from "../../hooks/useInbox";
import { useState } from "react";
import {
  useCreateProfile,
  useProfiles,
  useSwitchProfile,
} from "../../hooks/useSettings";

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
  { id: "settings", label: "Settings", icon: Settings },
  { id: "advisor", label: "Advisor", icon: Bot },
];

interface SidebarProps {
  active: View;
  onChange: (v: View) => void;
  open: boolean;
  advisorUnread?: boolean;
}

export function Sidebar({
  active,
  onChange,
  open,
  advisorUnread,
}: SidebarProps) {
  const { data: inboxItems } = useInboxItems();
  const inboxCount = inboxItems?.length ?? 0;
  const { config } = useShortcutsContext();
  const { data: profileData } = useProfiles();
  const switchProf = useSwitchProfile();
  const createProf = useCreateProfile();
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");

  return (
    <nav
      className={[
        "flex flex-col shrink-0 border-r border-border-subtle bg-surface-card",
        "overflow-hidden transition-[width] duration-200 py-3 gap-1",
        open ? "w-14" : "w-0",
      ].join(" ")}
    >
      {/* Logo dot */}
      <div className="flex justify-center mb-3">
        <div className="w-2 h-2 rounded-full bg-accent" />
      </div>

      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            title={config.views[id]
              ? `${label} (${displayShortcut(config.views[id])})`
              : label
            }
            onClick={() => onChange(id)}
            className={[
              "relative flex flex-col items-center justify-center",
              "mx-2 h-10 rounded-lg transition-colors",
              "text-[9px] font-semibold tracking-wider uppercase gap-1",
              isActive
                ? "bg-accent-muted text-accent"
                : "text-slate-400 hover:text-slate-200 hover:bg-surface-raised",
            ].join(" ")}
          >
            <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
            <span className="leading-none">{label.slice(0, 3)}</span>

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
              <span
                className="absolute top-1 right-1.5 w-2.5 h-2.5 rounded-full bg-accent"
              />
            )}
          </button>
        );
      })}

      {/* Profile switcher */}
      {profileData && (
        <div className="mt-auto pt-2 border-t border-border-subtle mx-2">
          {showNewProfile ? (
            <div className="flex flex-col gap-1 py-1">
              <input
                autoFocus
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newProfileName.trim()) {
                    createProf.mutate(newProfileName.trim(), {
                      onSuccess: () => {
                        switchProf.mutate(newProfileName.trim(), {
                          onSuccess: () => window.location.reload(),
                        });
                      },
                    });
                  }
                  if (e.key === "Escape") setShowNewProfile(false);
                }}
                placeholder="Name"
                className="w-full px-1 py-0.5 text-[9px] rounded bg-surface-raised border border-border text-slate-200 focus:outline-none focus:border-accent"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <select
                value={profileData.active}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setShowNewProfile(true);
                    setNewProfileName("");
                    return;
                  }
                  switchProf.mutate(e.target.value, {
                    onSuccess: () => window.location.reload(),
                  });
                }}
                className="w-full text-[9px] py-1 rounded bg-transparent text-slate-400 text-center cursor-pointer hover:text-slate-200"
                title="Switch profile"
              >
                {profileData.profiles.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                <option value="__new__">+ New profile</option>
              </select>
              <User size={10} className="text-slate-700" />
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
