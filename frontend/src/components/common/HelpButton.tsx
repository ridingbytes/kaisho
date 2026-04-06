import { CircleHelp, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { View } from "../../App";
import {
  displayShortcut,
  useShortcutsContext,
} from "../../context/ShortcutsContext";
import { Markdown } from "./Markdown";

interface Props {
  title: string;
  doc: string;
  view?: View;
}

export function HelpButton({ title, doc, view }: Props) {
  const [open, setOpen] = useState(false);
  const { config } = useShortcutsContext();
  const shortcut = view ? config.views[view] : undefined;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {shortcut && (
        <kbd className="text-[9px] font-mono text-stone-500 border border-border rounded px-1 py-0.5 leading-none">
          {displayShortcut(shortcut)}
        </kbd>
      )}
      <button
        onClick={() => setOpen(true)}
        className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
        title={shortcut ? `Help (${displayShortcut(shortcut)})` : "Help"}
        aria-label="Help"
      >
        <CircleHelp size={14} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-[440px] max-w-full z-50 flex flex-col bg-surface-card border-l border-border shadow-[var(--shadow-card-drag)]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle shrink-0">
              <h2 className="text-sm font-semibold text-stone-900">
                {title}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-stone-500 hover:text-stone-900 transition-colors"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <Markdown>{doc}</Markdown>
            </div>
          </div>
        </>
      )}
    </>
  );
}
