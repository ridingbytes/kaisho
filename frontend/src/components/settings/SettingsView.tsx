import { useState } from "react";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import { GeneralTab } from "./GeneralTab";
import { TagsAndTypesTab } from "./TagsTab";
import { AiSection } from "./AiTab";
import { GithubSection } from "./GithubTab";
import { ShortcutsSection } from "./ShortcutsTab";
import { PathsSection } from "./PathsTab";
import { CloudSyncSection } from "./CloudSyncTab";
import { BackupSection } from "./BackupTab";
import { InvoiceExportSection } from "./InvoiceExportTab";
import { UpdateSection } from "./UpdateTab";

type TabId =
  | "general"
  | "tags"
  | "ai"
  | "github"
  | "cloud"
  | "backup"
  | "export"
  | "shortcuts"
  | "paths"
  | "updates";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "tags", label: "Tags & Types" },
  { id: "ai", label: "AI" },
  { id: "github", label: "GitHub" },
  { id: "cloud", label: "Cloud Sync" },
  { id: "backup", label: "Backup" },
  { id: "export", label: "Export" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "paths", label: "Paths" },
  { id: "updates", label: "Updates" },
];

interface TabBarProps {
  active: TabId;
  onChange: (id: TabId) => void;
}

function TabBar({ active, onChange }: TabBarProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border-subtle mb-6">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={[
            "px-4 py-2 text-sm font-medium",
            "transition-colors",
            active === tab.id
              ? "text-cta border-b-2 border-cta -mb-px"
              : "text-stone-600 hover:text-stone-900",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsView(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>(
    () =>
      (localStorage.getItem("settings_tab") as TabId) ||
      "general",
  );

  function changeTab(id: TabId) {
    setActiveTab(id);
    localStorage.setItem("settings_tab", id);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-700">
          Settings
        </h1>
        <HelpButton
          title="Settings"
          doc={DOCS.settings}
          view="settings"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl">
          <TabBar
            active={activeTab}
            onChange={changeTab}
          />
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "tags" && <TagsAndTypesTab />}
          {activeTab === "ai" && <AiSection />}
          {activeTab === "github" && <GithubSection />}
          {activeTab === "cloud" && <CloudSyncSection />}
          {activeTab === "backup" && <BackupSection />}
          {activeTab === "export" && (
            <InvoiceExportSection />
          )}
          {activeTab === "shortcuts" && (
            <ShortcutsSection />
          )}
          {activeTab === "paths" && <PathsSection />}
          {activeTab === "updates" && (
            <UpdateSection />
          )}
        </div>
      </div>
    </div>
  );
}
