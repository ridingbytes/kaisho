import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "./Markdown";
import { useFileDropOnTextarea } from "../../hooks/useFileDropOnTextarea";
import { inputCls } from "../settings/styles";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Bucket id for drag-dropped / pasted attachments. */
  bucketId: string;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** Which tab to show first (default: "write"). */
  defaultTab?: "write" | "preview";
}

/** A markdown field with Write / Preview tabs (like a
 * GitHub comment box). Reused wherever markdown is edited
 * so authors can check rendering without leaving the
 * editor. Supports drag-and-drop / paste of attachments. */
export function MarkdownEditor({
  value,
  onChange,
  bucketId,
  placeholder,
  rows = 10,
  autoFocus,
  className,
  onKeyDown,
  defaultTab = "preview",
}: Props) {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<"write" | "preview">(
    defaultTab,
  );
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const drop = useFileDropOnTextarea({
    value,
    onChange,
    bucketId,
    textareaRef: ref,
  });

  function tabBtn(id: "write" | "preview", label: string) {
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className={[
          "px-3 py-1.5 text-xs font-medium transition-colors",
          tab === id
            ? "text-cta border-b-2 border-cta -mb-px"
            : "text-fg-muted hover:text-fg-strong",
        ].join(" ")}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={className}>
      <div className="flex gap-1 mb-1.5 border-b border-border-subtle">
        {tabBtn("preview", t("preview"))}
        {tabBtn("write", t("write"))}
      </div>
      {tab === "write" ? (
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onDrop={drop.onDrop}
          onDragOver={drop.onDragOver}
          onPaste={drop.onPaste}
          onKeyDown={onKeyDown}
          rows={rows}
          placeholder={placeholder}
          className={`${inputCls} w-full resize-y font-mono`}
        />
      ) : (
        <div
          className="rounded border border-border-subtle p-3 bg-surface-overlay/30 overflow-auto"
          style={{ minHeight: `${rows * 1.4}rem` }}
        >
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-xs text-fg-muted">
              {t("nothingToPreview")}
            </p>
          )}
        </div>
      )}
      {drop.uploading > 0 && (
        <div className="text-2xs text-fg-muted mt-1">
          {t("uploadingAttachment", { count: drop.uploading })}
        </div>
      )}
    </div>
  );
}
