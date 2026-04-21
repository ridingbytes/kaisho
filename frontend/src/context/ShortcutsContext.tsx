import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export interface ShortcutsConfig {
  commandPalette: string;
  commandBar: string;
  views: Record<string, string>;
  actions: Record<string, string>;
}

export const DEFAULT_SHORTCUTS: ShortcutsConfig = {
  commandPalette: "mod+k",
  commandBar: "mod+j",
  views: {
    dashboard: "d",
    board: "b",
    inbox: "i",
    notes: "n",
    customers: "c",
    knowledge: "k",
    github: "g",
    clocks: "t",
    cron: "r",
    settings: "s",
    advisor: "a",
  },
  actions: {
    "new:board": "shift+b",
    "new:inbox": "shift+i",
    "new:notes": "shift+n",
    "new:clocks": "shift+t",
    "new:knowledge": "shift+k",
    "new:customers": "shift+c",
  },
};

const STORAGE_KEY = "kaisho_shortcuts";

function loadConfig(): ShortcutsConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<ShortcutsConfig>;
      return {
        commandPalette:
          saved.commandPalette ?? DEFAULT_SHORTCUTS.commandPalette,
        commandBar:
          saved.commandBar ?? DEFAULT_SHORTCUTS.commandBar,
        views: { ...DEFAULT_SHORTCUTS.views, ...(saved.views ?? {}) },
        actions: { ...DEFAULT_SHORTCUTS.actions, ...(saved.actions ?? {}) },
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SHORTCUTS;
}

// ── Utilities ────────────────────────────────────────────────────────────────

const IS_MAC = navigator.platform.toUpperCase().includes("MAC");

export function eventToShortcut(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  const key = (e.key ?? "").toLowerCase();
  if (!["meta", "control", "shift", "alt"].includes(key)) {
    parts.push(key);
  }
  return parts.join("+");
}

export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  return eventToShortcut(e) === shortcut;
}

export function displayShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => {
      if (part === "mod") return IS_MAC ? "⌘" : "Ctrl";
      if (part === "shift") return IS_MAC ? "⇧" : "Shift";
      if (part === "alt") return IS_MAC ? "⌥" : "Alt";
      return part.toUpperCase();
    })
    .join(IS_MAC ? "" : "+");
}

// ── Context ──────────────────────────────────────────────────────────────────

interface ShortcutsContextValue {
  config: ShortcutsConfig;
  setViewShortcut: (view: string, key: string) => void;
  setActionShortcut: (action: string, key: string) => void;
  setCommandPaletteShortcut: (key: string) => void;
  setCommandBarShortcut: (key: string) => void;
  resetToDefaults: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export function ShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [config, setConfig] = useState<ShortcutsConfig>(loadConfig);

  const persist = useCallback((next: ShortcutsConfig) => {
    setConfig(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setViewShortcut = useCallback(
    (view: string, key: string) => {
      setConfig((prev) => {
        const next = { ...prev, views: { ...prev.views, [view]: key } };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const setActionShortcut = useCallback(
    (action: string, key: string) => {
      setConfig((prev) => {
        const next = {
          ...prev,
          actions: { ...prev.actions, [action]: key },
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const setCommandPaletteShortcut = useCallback(
    (key: string) => {
      setConfig((prev) => {
        const next = { ...prev, commandPalette: key };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const setCommandBarShortcut = useCallback(
    (key: string) => {
      setConfig((prev) => {
        const next = { ...prev, commandBar: key };
        localStorage.setItem(
          STORAGE_KEY, JSON.stringify(next),
        );
        return next;
      });
    },
    []
  );

  const resetToDefaults = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConfig(DEFAULT_SHORTCUTS);
  }, []);

  // suppress unused-variable warning on persist
  void persist;

  const value = useMemo(
    () => ({
      config,
      setViewShortcut,
      setActionShortcut,
      setCommandPaletteShortcut,
      setCommandBarShortcut,
      resetToDefaults,
    }),
    [
      config, setViewShortcut,
      setActionShortcut,
      setCommandPaletteShortcut,
      setCommandBarShortcut,
      resetToDefaults,
    ],
  );

  return (
    <ShortcutsContext.Provider value={value}>
      {children}
    </ShortcutsContext.Provider>
  );
}

export function useShortcutsContext(): ShortcutsContextValue {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error("useShortcutsContext: missing ShortcutsProvider");
  return ctx;
}
