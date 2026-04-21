import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

const SHORTCUT_ROW_KEYS: string[] = [
  "dashboard",
  "board",
  "inbox",
  "notes",
  "customers",
  "knowledge",
  "github",
  "clocks",
  "cron",
  "settings",
  "advisor",
];

const ACTION_ROW_KEYS: string[] = [
  "new:board",
  "new:inbox",
  "new:notes",
  "new:clocks",
  "new:knowledge",
  "new:customers",
];

// Nav label keys for SHORTCUT_ROWS and ACTION_ROWS
const NAV_LABEL_MAP: Record<string, string> = {
  "dashboard": "dashboard",
  "board": "board",
  "inbox": "inbox",
  "notes": "notes",
  "customers": "customers",
  "knowledge": "knowledge",
  "github": "github",
  "clocks": "clockEntries",
  "cron": "cronJobs",
  "settings": "settings",
  "advisor": "advisor",
  "new:board": "newTask",
  "new:inbox": "newInboxItem",
  "new:notes": "newNote",
  "new:clocks": "newClockEntry",
  "new:knowledge": "newKbFile",
  "new:customers": "newCustomer",
};

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
  const { t: tc } = useTranslation("common");
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
      {tc("pressKey")}
    </span>
  );
}

// -----------------------------------------------------------------
// Main export
// -----------------------------------------------------------------

export function ShortcutsSection(): JSX.Element {
  const { t } = useTranslation("settings");
  const { t: tn } = useTranslation("nav");
  const {
    config,
    setViewShortcut,
    setActionShortcut,
    setCommandPaletteShortcut,
    setCommandBarShortcut,
    resetToDefaults,
  } = useShortcutsContext();
  const [recording, setRecording] = useState<
    string | null
  >(null);

  const SHORTCUT_ROWS = SHORTCUT_ROW_KEYS.map(
    (key) => ({
      key,
      label: tn(NAV_LABEL_MAP[key] ?? key),
    }),
  );
  const ACTION_ROWS = ACTION_ROW_KEYS.map((key) => ({
    key,
    label: tn(NAV_LABEL_MAP[key] ?? key),
  }));

  function findConflict(
    s: string,
    excludeKey: string,
  ): string | null {
    if (
      excludeKey !== "_palette" &&
      config.commandPalette === s
    )
      return "Command palette";
    if (
      excludeKey !== "_cmdbar" &&
      config.commandBar === s
    )
      return "Command bar";
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
        ...(config.commandBar === s
          ? [{ key: "_cmdbar" }]
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
        } else if (cKey.key === "_cmdbar") {
          setCommandBarShortcut("");
        } else if (cKey.key.startsWith("new:")) {
          setActionShortcut(cKey.key, "");
        } else {
          setViewShortcut(cKey.key, "");
        }
      }
    }
    if (rowKey === "_palette") {
      setCommandPaletteShortcut(s);
    } else if (rowKey === "_cmdbar") {
      setCommandBarShortcut(s);
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
    if (key === "_cmdbar")
      return config.commandBar;
    if (key.startsWith("new:"))
      return config.actions[key] ?? "";
    return config.views[key] ?? "";
  }

  function defaultFor(key: string): string {
    if (key === "_palette")
      return DEFAULT_SHORTCUTS.commandPalette;
    if (key === "_cmdbar")
      return DEFAULT_SHORTCUTS.commandBar;
    if (key.startsWith("new:"))
      return DEFAULT_SHORTCUTS.actions[key] ?? "";
    return DEFAULT_SHORTCUTS.views[key] ?? "";
  }

  function resetOne(key: string) {
    const def = defaultFor(key);
    if (key === "_palette") {
      setCommandPaletteShortcut(def);
    } else if (key === "_cmdbar") {
      setCommandBarShortcut(def);
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
                    title={t("resetThisShortcut")}
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
                    title={t("clickToReassign")}
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
          {t("keyboardShortcuts")}
        </h2>
        <button
          onClick={resetToDefaults}
          className="ml-auto flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 transition-colors"
          title={t("resetToDefaults")}
        >
          <RotateCcw size={11} />
          {t("resetToDefaults")}
        </button>
      </div>
      {renderGroup(tn("commandPalette"), [
        {
          key: "_palette",
          label: tn("commandPalette"),
        },
        {
          key: "_cmdbar",
          label: "Command Bar",
        },
      ])}

      {renderGroup(t("navigate"), SHORTCUT_ROWS)}
      {renderGroup(t("actions"), ACTION_ROWS)}
      <p className="mt-2 text-[10px] text-stone-400">
        {t("shortcutsHint")}
      </p>
    </section>
  );
}
