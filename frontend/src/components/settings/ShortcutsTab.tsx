import { useEffect, useRef, useState } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import {
  DEFAULT_SHORTCUTS,
  displayShortcut,
  eventToShortcut,
  useShortcutsContext,
} from "../../context/ShortcutsContext";

// -----------------------------------------------------------------
// Constants
// -----------------------------------------------------------------

const SHORTCUT_ROWS: {
  key: string;
  label: string;
}[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "board", label: "Board" },
  { key: "inbox", label: "Inbox" },
  { key: "notes", label: "Notes" },
  { key: "customers", label: "Customers" },
  { key: "knowledge", label: "Knowledge" },
  { key: "github", label: "GitHub Issues" },
  { key: "clocks", label: "Clock Entries" },
  { key: "cron", label: "Cron Jobs" },
  { key: "settings", label: "Settings" },
  { key: "advisor", label: "Advisor" },
];

const ACTION_ROWS: {
  key: string;
  label: string;
}[] = [
  { key: "new:board", label: "New Task" },
  { key: "new:inbox", label: "New Inbox Item" },
  { key: "new:notes", label: "New Note" },
  { key: "new:clocks", label: "New Clock Entry" },
  { key: "new:knowledge", label: "New KB File" },
  { key: "new:customers", label: "New Customer" },
];

// -----------------------------------------------------------------
// Key capture
// -----------------------------------------------------------------

function KeyCapture({
  onCapture,
  onCancel,
}: {
  onCapture: (s: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    ref.current?.focus();
    function handler(e: KeyboardEvent) {
      e.preventDefault();
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      const s = eventToShortcut(e);
      if (s) onCapture(s);
    }
    document.addEventListener("keydown", handler);
    return () =>
      document.removeEventListener(
        "keydown",
        handler,
      );
  }, [onCapture, onCancel]);

  return (
    <span
      ref={ref}
      tabIndex={-1}
      className="text-xs text-stone-600 italic focus:outline-none"
    >
      Press a key...
    </span>
  );
}

// -----------------------------------------------------------------
// Main export
// -----------------------------------------------------------------

export function ShortcutsSection(): JSX.Element {
  const {
    config,
    setViewShortcut,
    setActionShortcut,
    setCommandPaletteShortcut,
    resetToDefaults,
  } = useShortcutsContext();
  const [recording, setRecording] = useState<
    string | null
  >(null);

  function findConflict(
    s: string,
    excludeKey: string,
  ): string | null {
    if (
      excludeKey !== "_palette" &&
      config.commandPalette === s
    )
      return "Command palette";
    for (const r of SHORTCUT_ROWS) {
      if (r.key !== excludeKey && config.views[r.key] === s)
        return r.label;
    }
    for (const r of ACTION_ROWS) {
      if (
        r.key !== excludeKey &&
        config.actions[r.key] === s
      )
        return r.label;
    }
    return null;
  }

  function handleCapture(rowKey: string, s: string) {
    const conflict = findConflict(s, rowKey);
    if (conflict) {
      const cKey = [
        ...(config.commandPalette === s
          ? [{ key: "_palette" }]
          : []),
        ...SHORTCUT_ROWS.filter(
          (r) => config.views[r.key] === s,
        ),
        ...ACTION_ROWS.filter(
          (r) => config.actions[r.key] === s,
        ),
      ].find((r) => r.key !== rowKey);
      if (cKey) {
        if (cKey.key === "_palette") {
          setCommandPaletteShortcut("");
        } else if (cKey.key.startsWith("new:")) {
          setActionShortcut(cKey.key, "");
        } else {
          setViewShortcut(cKey.key, "");
        }
      }
    }
    if (rowKey === "_palette") {
      setCommandPaletteShortcut(s);
    } else if (rowKey.startsWith("new:")) {
      setActionShortcut(rowKey, s);
    } else {
      setViewShortcut(rowKey, s);
    }
    setRecording(null);
  }

  function currentFor(key: string): string {
    if (key === "_palette")
      return config.commandPalette;
    if (key.startsWith("new:"))
      return config.actions[key] ?? "";
    return config.views[key] ?? "";
  }

  function defaultFor(key: string): string {
    if (key === "_palette")
      return DEFAULT_SHORTCUTS.commandPalette;
    if (key.startsWith("new:"))
      return DEFAULT_SHORTCUTS.actions[key] ?? "";
    return DEFAULT_SHORTCUTS.views[key] ?? "";
  }

  function resetOne(key: string) {
    const def = defaultFor(key);
    if (key === "_palette") {
      setCommandPaletteShortcut(def);
    } else if (key.startsWith("new:")) {
      setActionShortcut(key, def);
    } else {
      setViewShortcut(key, def);
    }
  }

  function renderGroup(
    title: string,
    rows: { key: string; label: string }[],
  ) {
    return (
      <>
        <h3 className="text-[10px] font-semibold tracking-wider uppercase text-stone-500 mt-4 mb-1.5">
          {title}
        </h3>
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
          {rows.map((row, i) => {
            const current = currentFor(row.key);
            const isDefault =
              current === defaultFor(row.key);
            const isRecording =
              recording === row.key;

            return (
              <div
                key={row.key}
                className={[
                  "group flex items-center gap-3",
                  "px-4 py-2.5",
                  i < rows.length - 1
                    ? "border-b border-border-subtle"
                    : "",
                ].join(" ")}
              >
                <span className="text-sm text-stone-800 flex-1">
                  {row.label}
                </span>
                {!isDefault && (
                  <button
                    onClick={() =>
                      resetOne(row.key)
                    }
                    className="text-[10px] text-stone-400 hover:text-stone-700 transition-colors shrink-0"
                    title="Reset this shortcut"
                  >
                    reset
                  </button>
                )}
                {isRecording ? (
                  <KeyCapture
                    onCapture={(s) =>
                      handleCapture(row.key, s)
                    }
                    onCancel={() =>
                      setRecording(null)
                    }
                  />
                ) : (
                  <button
                    onClick={() =>
                      setRecording(row.key)
                    }
                    className="flex items-center gap-2 group/edit"
                    title="Click to reassign"
                  >
                    <kbd className="text-[10px] font-mono text-stone-700 border border-border rounded px-1.5 py-0.5 group-hover/edit:border-cta group-hover/edit:text-cta transition-colors">
                      {current
                        ? displayShortcut(current)
                        : "\u2014"}
                    </kbd>
                    <Pencil
                      size={10}
                      className="text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
          Keyboard Shortcuts
        </h2>
        <button
          onClick={resetToDefaults}
          className="ml-auto flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 transition-colors"
          title="Reset to defaults"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>
      {renderGroup("General", [
        {
          key: "_palette",
          label: "Command palette",
        },
      ])}
      {renderGroup("Navigate", SHORTCUT_ROWS)}
      {renderGroup("Actions", ACTION_ROWS)}
      <p className="mt-2 text-[10px] text-stone-400">
        Shortcuts fire when no text field is focused.
        Click a shortcut to reassign it by pressing any
        key.
      </p>
    </section>
  );
}
