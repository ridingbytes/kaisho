import Editor from "react-simple-code-editor";
import { useTranslation } from "react-i18next";

// Cron / advisor prompt editor with ${...} placeholder
// highlighting. Known placeholders render bold green;
// unknown ones (typos, removed fields) render bold red so
// authoring mistakes are visible before saving. Plain {
// and } in prose / JSON are untouched.

const KNOWN_USER_FIELDS = new Set([
  "name",
  "email",
  "bio",
  "company",
  "industry",
  "research_targets",
]);
const KNOWN_SYSTEM_FIELDS = new Set([
  "date",
  "fetch_results",
]);

function isKnown(name: string): boolean {
  if (KNOWN_SYSTEM_FIELDS.has(name)) return true;
  if (name.startsWith("user.")) {
    return KNOWN_USER_FIELDS.has(
      name.slice("user.".length),
    );
  }
  return false;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlight(code: string): string {
  const re = /(?<!\\)\$\{([^}]+)\}/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, m.index));
    const name = m[1].trim();
    const cls = isKnown(name)
      ? "kp-known"
      : "kp-unknown";
    out += "<span class=\"" + cls + "\">"
      + escapeHtml(m[0]) + "</span>";
    last = re.lastIndex;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

interface PromptEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  showPlaceholderHint?: boolean;
}

function PlaceholderHint() {
  const { t } = useTranslation("cron");
  const userChips = [
    "${user.name}",
    "${user.email}",
    "${user.bio}",
    "${user.company}",
    "${user.industry}",
    "${user.research_targets}",
  ];
  const systemChips = ["${date}", "${fetch_results}"];
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-stone-500">
      <span className="text-stone-400">
        {t("placeholderHint")}
      </span>
      {userChips.map((c) => (
        <code
          key={c}
          className="kp-known px-1.5 py-0.5 rounded bg-cta/5"
        >
          {c}
        </code>
      ))}
      {systemChips.map((c) => (
        <code
          key={c}
          className="kp-known px-1.5 py-0.5 rounded bg-stone-200/50"
        >
          {c}
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
      {showPlaceholderHint && <PlaceholderHint />}
    </div>
  );
}
