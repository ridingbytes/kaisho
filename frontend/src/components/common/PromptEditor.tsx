import { useMemo } from "react";
import Editor from "react-simple-code-editor";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaceholderVocab } from "../../api/client";

// Cron / advisor prompt editor with ${...} placeholder
// highlighting. Known placeholders render bold green;
// unknown ones (typos, removed fields) render bold red so
// authoring mistakes are visible before saving. Plain {
// and } in prose / JSON are untouched.

// Fallback used while the API call is in flight or when
// the editor renders outside Tauri (Storybook, tests).
// The backend's placeholders.USER_FIELDS / SYSTEM_FIELDS
// is the authoritative list — this is just a "good enough
// for first paint" shim. If it drifts, the highlight on
// first paint will be slightly wrong; the post-fetch
// re-render fixes it within a tick.
const FALLBACK_USER_FIELDS = [
  "name", "email", "bio",
  "company", "industry", "research_targets",
];
const FALLBACK_SYSTEM_FIELDS = ["date", "fetch_results"];

function usePlaceholderSets() {
  const { data } = useQuery({
    queryKey: ["advisor", "placeholder-vocab"],
    queryFn: fetchPlaceholderVocab,
    // Vocab is effectively static for the session.
    staleTime: Infinity,
  });
  return useMemo(() => {
    const userList =
      data?.user_fields ?? FALLBACK_USER_FIELDS;
    const systemList =
      data?.system_fields ?? FALLBACK_SYSTEM_FIELDS;
    return {
      userFields: userList,
      systemFields: systemList,
      knownUser: new Set(userList),
      knownSystem: new Set(systemList),
    };
  }, [data]);
}

function isKnown(
  name: string,
  knownUser: Set<string>,
  knownSystem: Set<string>,
): boolean {
  if (knownSystem.has(name)) return true;
  if (name.startsWith("user.")) {
    return knownUser.has(name.slice("user.".length));
  }
  return false;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function makeHighlight(
  knownUser: Set<string>,
  knownSystem: Set<string>,
): (code: string) => string {
  // Match the backend regex: single-line tokens only.
  const re = /(?<!\\)\$\{([^}\n]+)\}/g;
  return function highlight(code: string): string {
    let out = "";
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      out += escapeHtml(code.slice(last, m.index));
      const name = m[1].trim();
      const cls = isKnown(name, knownUser, knownSystem)
        ? "kp-known"
        : "kp-unknown";
      out += "<span class=\"" + cls + "\">"
        + escapeHtml(m[0]) + "</span>";
      last = re.lastIndex;
    }
    out += escapeHtml(code.slice(last));
    return out;
  };
}

interface PromptEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  showPlaceholderHint?: boolean;
}

function PlaceholderHint({
  userFields,
  systemFields,
}: {
  userFields: string[];
  systemFields: string[];
}) {
  const { t } = useTranslation("cron");
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-stone-500">
      <span className="text-stone-400">
        {t("placeholderHint")}
      </span>
      {userFields.map((f) => (
        <code
          key={f}
          className="kp-known px-1.5 py-0.5 rounded bg-cta/5"
        >
          {`\${user.${f}}`}
        </code>
      ))}
      {systemFields.map((f) => (
        <code
          key={f}
          className="kp-known px-1.5 py-0.5 rounded bg-stone-200/50"
        >
          {`\${${f}}`}
        </code>
      ))}
    </div>
  );
}

export function PromptEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = 120,
  showPlaceholderHint = true,
}: PromptEditorProps) {
  const { t } = useTranslation("cron");
  const vocab = usePlaceholderSets();
  const highlight = useMemo(
    () => makeHighlight(vocab.knownUser, vocab.knownSystem),
    [vocab.knownUser, vocab.knownSystem],
  );
  return (
    <div className={className}>
      <div
        className={[
          "rounded-lg border border-border",
          "bg-surface-raised",
          "focus-within:border-border-strong",
        ].join(" ")}
      >
        <Editor
          value={value}
          onValueChange={onChange}
          highlight={highlight}
          padding={12}
          textareaClassName="kp-textarea"
          preClassName="kp-pre"
          placeholder={
            placeholder ?? t("enterPrompt")
          }
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, monospace",
            fontSize: 12,
            minHeight,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        />
      </div>
      {showPlaceholderHint && (
        <PlaceholderHint
          userFields={vocab.userFields}
          systemFields={vocab.systemFields}
        />
      )}
    </div>
  );
}
