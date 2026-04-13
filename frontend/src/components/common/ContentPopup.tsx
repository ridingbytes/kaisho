import {
  X, ExternalLink, MessageSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Markdown } from "./Markdown";

interface ContentPopupProps {
  content: string;
  title?: string;
  markdown?: boolean;
  iconSize?: number;
  icon?: "expand" | "notes";
}

export function ContentPopup({
  content,
  title,
  markdown = false,
  iconSize = 11,
  icon = "expand",
}: ContentPopupProps) {
  const IconComponent =
    icon === "notes" ? MessageSquare : ExternalLink;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () =>
      document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={[
          "p-0.5 rounded",
          "text-stone-500 hover:text-stone-900",
          "transition-colors",
        ].join(" ")}
        title="View full content"
      >
        <IconComponent size={iconSize} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Card */}
          <div
            className={[
              "relative z-10 w-full max-w-2xl",
              "max-h-[80vh] flex flex-col",
              "bg-surface-card border border-border",
              "rounded-xl shadow-xl",
            ].join(" ")}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className={[
                "flex items-center justify-between",
                "px-4 py-3 border-b border-border-subtle",
                "shrink-0",
              ].join(" ")}
            >
              {title ? (
                <h2 className="text-sm font-semibold text-stone-900 truncate">
                  {title}
                </h2>
              ) : (
                <span />
              )}
              <button
                onClick={() => setOpen(false)}
                className={[
                  "p-1 rounded",
                  "text-stone-600 hover:text-stone-900",
                  "transition-colors",
                ].join(" ")}
              >
                <X size={14} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {markdown ? (
                <Markdown className="text-sm text-stone-800">
                  {content}
                </Markdown>
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-stone-800">
                  {content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
