/**
 * GithubIssueInput -- Text input for a GitHub issue URL with
 * an optional dropdown picker that fetches open issues for the
 * selected customer.
 */
import ReactDOM from "react-dom";
import { useRef, useState } from "react";
import { GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGithubSettings } from "../../hooks/useSettings";

interface GithubIssue {
  number: number;
  title: string;
  url: string;
}

interface GithubIssueInputProps {
  /** Customer name used to fetch issues. */
  customer: string;
  /** Current URL value. */
  value: string;
  /** Called when the URL value changes. */
  onChange: (v: string) => void;
  /** CSS class applied to the text input. */
  inputClassName: string;
}

/**
 * Renders a text input for a GitHub issue URL. When a
 * customer is provided, a button fetches open issues from
 * the backend and presents a filterable dropdown to pick one.
 */
export function GithubIssueInput({
  customer,
  value,
  onChange,
  inputClassName,
}: GithubIssueInputProps) {
  const { t } = useTranslation("kanban");
  const { t: tc } = useTranslation("common");
  const { data: gh } = useGithubSettings();
  // Hide the field entirely until a PAT is configured —
  // otherwise users see a "GitHub issue URL" prompt that
  // can't actually fetch anything from the API.
  // Keep the field if a value is already populated, so
  // existing tasks remain editable when the token is
  // later removed.
  if (!gh?.token_set && !value) {
    return null;
  }
  const [issues, setIssues] = useState<GithubIssue[]>(
    [],
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  async function fetchIssues() {
    if (!customer.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/github/issues/${encodeURIComponent(customer.trim())}?limit=50`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          issues?: GithubIssue[];
        };
        setIssues(data.issues ?? []);
        setOpen(true);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const filtered = issues.filter((i) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      i.title.toLowerCase().includes(q) ||
      String(i.number).includes(q.replace("#", ""))
    );
  });

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex gap-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("githubIssueUrl")}
          className={[inputClassName, "flex-1"].join(
            " ",
          )}
        />
        {customer.trim() && (
          <button
            ref={btnRef}
            type="button"
            onClick={fetchIssues}
            disabled={loading}
            title={t("pickGithubIssue")}
            className="px-2 rounded bg-surface-raised border border-border text-stone-600 hover:text-cta hover:border-cta transition-colors disabled:opacity-40"
          >
            <GitBranch size={11} />
          </button>
        )}
      </div>
      {open &&
        issues.length > 0 &&
        ReactDOM.createPortal(
          <div
            className="fixed z-[9999] w-80 max-h-64 rounded-lg bg-surface-overlay border border-border shadow-lg"
            style={{
              top: wrapRef.current
                ? wrapRef.current.getBoundingClientRect()
                    .bottom + 4
                : 100,
              left: wrapRef.current
                ? Math.min(
                    wrapRef.current.getBoundingClientRect()
                      .left,
                    window.innerWidth - 330,
                  )
                : 100,
            }}
          >
            <input
              type="text"
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  setFilter("");
                }
              }}
              placeholder={t("filterIssues")}
              autoFocus
              className="w-full px-3 py-1.5 text-xs border-b border-border bg-transparent text-stone-800 placeholder-stone-400 outline-none"
            />
            <ul className="max-h-48 overflow-y-auto">
              {filtered.map((issue) => (
                <li key={issue.number}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(issue.url);
                      setOpen(false);
                      setFilter("");
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-stone-800 hover:bg-cta-muted transition-colors flex items-start gap-2"
                  >
                    <span className="text-stone-500 font-mono shrink-0 mt-px">
                      #{issue.number}
                    </span>
                    <span className="leading-snug">
                      {issue.title}
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setFilter("");
                  }}
                  className="w-full text-left px-3 py-1 text-[10px] text-stone-500 hover:text-stone-700"
                >
                  {tc("close")}
                </button>
              </li>
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
