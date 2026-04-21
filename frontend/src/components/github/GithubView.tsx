import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGithubIssues, useGithubProjects } from "../../hooks/useGithub";
import { useQueryClient } from "@tanstack/react-query";
import type {
  GithubIssue,
  GithubProject,
  GithubProjectItem,
} from "../../types";
import { HelpButton } from "../common/HelpButton";
import { PanelToolbar } from "../common/PanelToolbar";
import { DOCS } from "../../docs/panelDocs";
import { useGithubSettings } from "../../hooks/useSettings";
import { smallInputCls } from "../../styles/formStyles";

// ------------------------------------------------------------------
// Shared
// ------------------------------------------------------------------

function LabelPill({
  label,
}: {
  label: { name: string; color: string };
}) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{
        backgroundColor: `#${label.color}33`,
        color: `#${label.color}`,
      }}
    >
      {label.name}
    </span>
  );
}

// ------------------------------------------------------------------
// Issues
// ------------------------------------------------------------------

function IssueRow({ issue }: { issue: GithubIssue }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle hover:bg-surface-raised transition-colors">
      <span className="text-xs text-stone-500 w-10 shrink-0">
        #{issue.number}
      </span>
      <a
        href={issue.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-stone-900 hover:text-cta transition-colors flex-1 min-w-0 truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {issue.title}
      </a>
      <div className="flex gap-1 shrink-0">
        {issue.labels.map((l) => (
          <LabelPill key={l.name} label={l} />
        ))}
      </div>
      <span className="text-xs text-stone-500 shrink-0 w-24 text-right">
        {issue.createdAt.slice(0, 10)}
      </span>
    </div>
  );
}

function IssuesPane({ customerFilter }: { customerFilter: string }) {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { data: groups = [], isLoading, error } = useGithubIssues();
  const filtered = customerFilter
    ? groups.filter((g) => g.customer === customerFilter)
    : groups;
  const totalIssues = filtered.reduce((s, g) => s + g.issues.length, 0);

  if (isLoading) {
    return <p className="text-sm text-stone-500">{tc("loading")}</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-red-400">
        {t("githubApiError")}
      </p>
    );
  }
  if (totalIssues === 0) {
    return (
      <p className="text-sm text-stone-500">
        {t("noOpenIssues")}
      </p>
    );
  }
  return (
    <>
      {filtered.map((group) => (
        <section key={`${group.customer}/${group.repo}`} className="mb-6">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-2">
            {group.customer}{" "}
            <span className="text-stone-400 normal-case font-normal">
              — {group.repo}
            </span>
          </h2>
          <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
            {group.issues.map((issue) => (
              <IssueRow key={issue.number} issue={issue} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

// ------------------------------------------------------------------
// Projects
// ------------------------------------------------------------------

function ProjectItemRow({ item }: { item: GithubProjectItem }) {
  const typeLabel =
    item.type === "PULL_REQUEST"
      ? "PR"
      : item.type === "DRAFT_ISSUE"
        ? "Draft"
        : "Issue";

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle hover:bg-surface-raised transition-colors">
      <span className="text-[10px] text-stone-400 w-14 shrink-0">
        {typeLabel}
        {item.number != null && (
          <span className="ml-0.5">#{item.number}</span>
        )}
      </span>
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-stone-900 hover:text-cta transition-colors flex-1 min-w-0 truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {item.title}
        </a>
      ) : (
        <span className="text-sm text-stone-700 flex-1 min-w-0 truncate">
          {item.title}
        </span>
      )}
      <div className="flex gap-1 shrink-0">
        {item.labels.map((l) => (
          <LabelPill key={l.name} label={l} />
        ))}
      </div>
    </div>
  );
}

/** Group items by status, preserving the kanban column order. */
function groupByStatus(
  items: GithubProjectItem[],
  statusOrder: string[],
): [string, GithubProjectItem[]][] {
  const map = new Map<string, GithubProjectItem[]>();
  for (const item of items) {
    const key = item.status ?? "(no status)";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  // Sort groups by the kanban field option order.
  // Any status not in statusOrder goes to the end.
  const orderedKeys = [
    ...statusOrder.filter((s) => map.has(s)),
    ...[...map.keys()].filter((k) => !statusOrder.includes(k)),
  ];
  return orderedKeys.map((k) => [k, map.get(k)!]);
}

function StatusGroup({
  status,
  items,
}: {
  status: string;
  items: GithubProjectItem[];
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        className="w-full flex items-center gap-2 px-4 py-1.5 bg-surface-raised border-b border-border-subtle text-left hover:bg-surface-overlay transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 flex-1">
          {status}
          <span className="ml-1.5 font-normal text-stone-400">
            ({items.length})
          </span>
        </span>
        <span className="text-stone-400 text-[10px]">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open &&
        items.map((item) => (
          <ProjectItemRow key={item.id} item={item} />
        ))}
    </div>
  );
}

function ProjectCard({ project }: { project: GithubProject }) {
  const [open, setOpen] = useState(!project.closed);
  const groups = groupByStatus(project.items, project.status_order);

  return (
    <div className="mb-3 bg-surface-card rounded-xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-raised transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-xs font-semibold text-stone-800 flex-1">
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cta transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {project.title}
          </a>
        </span>
        {project.closed && (
          <span className="text-[10px] text-stone-400 border border-border rounded px-1.5 py-0.5">
            closed
          </span>
        )}
        <span className="text-[10px] text-stone-400">
          {project.items.length} items
        </span>
        <span className="text-stone-400 text-xs ml-1">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && project.items.length > 0 && (
        <div>
          {groups.map(([status, groupItems]) => (
            <StatusGroup key={status} status={status} items={groupItems} />
          ))}
        </div>
      )}
      {open && project.items.length === 0 && (
        <p className="px-4 py-2 text-xs text-stone-400">No items.</p>
      )}
    </div>
  );
}

function ProjectsPane({
  showClosed,
  customerFilter,
}: {
  showClosed: boolean;
  customerFilter: string;
}) {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { data: groups = [], isLoading, error } = useGithubProjects();
  const filtered = customerFilter
    ? groups.filter((g) => g.customer === customerFilter)
    : groups;

  if (isLoading) {
    return <p className="text-sm text-stone-500">{tc("loading")}</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-red-400">
        {t("githubApiError")}
      </p>
    );
  }

  const hasAny = filtered.some((g) =>
    showClosed ? g.projects.length > 0 : g.projects.some((p) => !p.closed)
  );
  if (!hasAny) {
    return (
      <p className="text-sm text-stone-500">
        {t("noProjects")}
      </p>
    );
  }

  return (
    <>
      {filtered.map((group) => {
        const visible = showClosed
          ? group.projects
          : group.projects.filter((p) => !p.closed);
        if (visible.length === 0) return null;
        return (
          <section
            key={`${group.customer}/${group.repo}`}
            className="mb-6"
          >
            <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-2">
              {group.customer}{" "}
              <span className="text-stone-400 normal-case font-normal">
                — {group.repo}
              </span>
            </h2>
            {visible.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </section>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------
// Main view
// ------------------------------------------------------------------

type Tab = "issues" | "projects";

export function GithubView() {
  const { t } = useTranslation("settings");
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("issues");
  const [customerFilter, setCustomerFilter] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const { data: ghSettings } = useGithubSettings();
  const hasToken = !!(ghSettings && ghSettings.token_set);

  const { data: issueGroups = [] } = useGithubIssues();
  const { data: projectGroups = [] } = useGithubProjects();

  const customers =
    tab === "issues"
      ? issueGroups.map((g) => g.customer)
      : projectGroups.map((g) => g.customer);

  function switchTab(t: Tab) {
    setTab(t);
    setCustomerFilter("");
  }

  function tabCls(t: Tab) {
    return [
      "text-xs px-3 py-1 rounded-full transition-colors",
      tab === t
        ? "bg-cta text-white font-semibold"
        : "text-stone-500 hover:text-stone-900 hover:bg-surface-overlay",
    ].join(" ");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <PanelToolbar
        left={<>
          <div className="flex items-center gap-1">
            <button
              className={tabCls("issues")}
              onClick={() => switchTab("issues")}
            >
              {t("issues")}
            </button>
            <button
              className={tabCls("projects")}
              onClick={() => switchTab("projects")}
            >
              {t("projects")}
            </button>
          </div>
          {customers.length > 0 && (
            <select
              value={customerFilter}
              onChange={(e) =>
                setCustomerFilter(e.target.value)
              }
              className={`${smallInputCls} !w-40`}
            >
              <option value="">{t("allCustomers")}</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {tab === "projects" && (
            <label className={[
              "flex items-center gap-2 text-xs",
              "text-stone-600 cursor-pointer select-none",
            ].join(" ")}>
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(e) =>
                  setShowClosed(e.target.checked)
                }
                className="accent-cta"
              />
              {t("showClosed")}
            </label>
          )}
        </>}
        right={<>
          <button
            onClick={() =>
              void qc.invalidateQueries({
                queryKey: ["github"],
              })
            }
            title="Refresh"
            className={[
              "p-1 rounded text-stone-500",
              "hover:text-stone-900",
              "hover:bg-surface-overlay transition-colors",
            ].join(" ")}
          >
            <RefreshCcw size={13} />
          </button>
          <HelpButton
            title="GitHub"
            doc={DOCS.github}
            view="github"
          />
        </>}
      />

      <div className="flex-1 overflow-y-auto p-5">
        {!hasToken && (
          <div className="max-w-md mx-auto mt-12 text-center space-y-3">
            <p className="text-sm font-medium text-stone-700">
              {t("noGithubToken")}
            </p>
            <p className="text-xs text-stone-500 leading-relaxed">
              {t("noGithubTokenHint")}
            </p>
          </div>
        )}
        {hasToken && tab === "issues" && (
          <IssuesPane customerFilter={customerFilter} />
        )}
        {hasToken && tab === "projects" && (
          <ProjectsPane
            showClosed={showClosed}
            customerFilter={customerFilter}
          />
        )}
      </div>
    </div>
  );
}
