import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import { useGithubIssues } from "../../hooks/useGithub";
import { useQueryClient } from "@tanstack/react-query";
import type { GithubIssue } from "../../types";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";

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

export function GithubView() {
  const { data: groups = [], isLoading, error } = useGithubIssues();
  const qc = useQueryClient();
  const [customerFilter, setCustomerFilter] = useState("");

  const customers = groups.map((g) => g.customer);

  const filtered = customerFilter
    ? groups.filter((g) => g.customer === customerFilter)
    : groups;

  const totalIssues = filtered.reduce(
    (sum, g) => sum + g.issues.length,
    0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-700">
          GitHub
        </h1>
        {customers.length > 1 && (
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="text-xs bg-surface-raised border border-border rounded px-2 py-1 text-stone-800 focus:outline-none focus:border-cta"
          >
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() =>
            void qc.invalidateQueries({ queryKey: ["github"] })
          }
          title="Refresh"
          className="ml-auto p-1 rounded text-stone-500 hover:text-stone-900 hover:bg-surface-overlay transition-colors"
        >
          <RefreshCcw size={13} />
        </button>
        <HelpButton title="GitHub Issues" doc={DOCS.github} view="github" />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <p className="text-sm text-stone-500">Loading…</p>
        )}

        {error && (
          <p className="text-sm text-red-400">
            GitHub CLI not available or not authenticated.
          </p>
        )}

        {!isLoading && !error && totalIssues === 0 && (
          <p className="text-sm text-stone-500">
            {customerFilter ? "No open issues for this customer." : "No open issues."}
          </p>
        )}

        {!isLoading &&
          !error &&
          filtered.map((group) => (
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
      </div>
    </div>
  );
}
