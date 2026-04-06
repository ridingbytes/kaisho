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
  useCurrentUser,
  useSwitchProfile,
  useSwitchUser,
  useUsers,
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
  const { data: userData } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const switchProf = useSwitchProfile();
  const switchUsr = useSwitchUser();
  const createProf = useCreateProfile();
  const [menuOpen, setMenuOpen] = useState(false);
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

      {/* User menu */}
      {userData && (
        <div className="mt-auto pt-2 border-t border-border-subtle mx-2 relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-surface-raised transition-colors"
            title={`${userData.name || userData.username} / ${userData.profile}`}
          >
            <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold uppercase">
              {(userData.name || userData.username).charAt(0)}
            </div>
            <span className="text-[7px] font-semibold uppercase tracking-wider leading-none text-slate-600 truncate w-full text-center">
              {userData.profile}
            </span>
          </button>

          {menuOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-44 rounded-lg bg-surface-overlay border border-border shadow-lg p-2 flex flex-col gap-1 z-50">
              <p className="text-[10px] text-slate-500 px-1 font-semibold">
                {userData.name || userData.username}
              </p>

              {/* Profile selector */}
              <div className="border-t border-border-subtle pt-1 mt-0.5">
                <p className="text-[9px] text-slate-600 px-1 mb-1 uppercase tracking-wider">
                  Profile
                </p>
                {(userData.profiles ?? []).map((p: string) => (
                  <button
                    key={p}
                    onClick={() => {
                      if (p !== userData.profile) {
                        switchProf.mutate(p, {
                          onSuccess: () => window.location.reload(),
                        });
                      }
                      setMenuOpen(false);
                    }}
                    className={[
                      "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                      p === userData.profile
                        ? "text-accent bg-accent-muted"
                        : "text-slate-300 hover:bg-surface-raised",
                    ].join(" ")}
                  >
                    {p}
                  </button>
                ))}
                {showNewProfile ? (
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
                    placeholder="New profile name"
                    className="w-full mt-1 px-2 py-1 rounded text-xs bg-surface-raised border border-border text-slate-200 focus:outline-none focus:border-accent"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setShowNewProfile(true);
                      setNewProfileName("");
                    }}
                    className="w-full text-left px-2 py-1 rounded text-xs text-slate-600 hover:text-slate-300 hover:bg-surface-raised transition-colors"
                  >
                    + New profile
                  </button>
                )}
              </div>

              {/* User switcher (only if >1 user) */}
              {users.length > 1 && (
                <div className="border-t border-border-subtle pt-1 mt-0.5">
                  <p className="text-[9px] text-slate-600 px-1 mb-1 uppercase tracking-wider">
                    Switch user
                  </p>
                  {users.map((u) => (
                    <button
                      key={u.username}
                      onClick={() => {
                        switchUsr.mutate(
                          { username: u.username },
                          { onSuccess: () => window.location.reload() }
                        );
                      }}
                      className={[
                        "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                        u.username === userData.username
                          ? "text-accent bg-accent-muted"
                          : "text-slate-300 hover:bg-surface-raised",
                      ].join(" ")}
                    >
                      {u.name || u.username}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
