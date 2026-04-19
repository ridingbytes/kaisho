import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles } from "lucide-react";
import { useVersionInfo } from "../../hooks/useSettings";
import {
  parseChangelog,
  type ChangelogEntry,
} from "../../utils/changelog";

const SEEN_KEY = "kaisho_seen_version";

/**
 * Shows a "What's New" overlay on first launch after
 * an update. Only shows the latest version's changes.
 * Can also be opened manually via the exported trigger.
 */
export function WhatsNewDialog() {
  const { data } = useVersionInfo();
  const [open, setOpen] = useState(false);
  const [latest, setLatest] = useState<
    ChangelogEntry | null
  >(null);

  useEffect(() => {
    if (!data) return;
    const parsed = parseChangelog(data.changelog);
    if (parsed.length > 0) setLatest(parsed[0]);

    const seen = localStorage.getItem(SEEN_KEY);
    if (seen !== data.version && parsed.length > 0) {
      setOpen(true);
    }
  }, [data]);

  // Listen for manual open from Settings tab
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener(
      "kaisho:open-whats-new",
      onOpen,
    );
    return () =>
      window.removeEventListener(
        "kaisho:open-whats-new",
        onOpen,
      );
  }, []);

  if (!open || !latest) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-surface-card rounded-xl border border-border shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Sparkles
              size={16}
              className="text-cta"
            />
            <h2 className="text-sm font-semibold text-stone-800">
              What's New in {latest.version}
            </h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-surface-raised text-stone-500 hover:text-stone-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ul className="space-y-1.5">
            {latest.items.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-stone-700 leading-relaxed"
              >
                <span className="mt-1.5 w-1 h-1 rounded-full bg-cta shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 py-3 border-t border-border-subtle flex justify-end">
          <button
            onClick={() => {
              if (data?.version) {
                localStorage.setItem(
                  SEEN_KEY, data.version,
                );
              }
              setOpen(false);
            }}
            className="px-4 py-1.5 rounded text-sm bg-cta text-white hover:bg-cta-hover transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Programmatically open the What's New dialog. */
export function openWhatsNew() {
  window.dispatchEvent(
    new CustomEvent("kaisho:open-whats-new"),
  );
}
