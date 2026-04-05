import { useEffect, useRef, useState } from "react";
import { X, Check, Plus, Pencil, RotateCcw } from "lucide-react";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import {
  DEFAULT_SHORTCUTS,
  displayShortcut,
  eventToShortcut,
  useShortcutsContext,
} from "../../context/ShortcutsContext";
import {
  useAiSettings,
  useAvailableModels,
  useGithubSettings,
  usePaths,
  useSettings,
  useUpdateAiSettings,
  useUpdateGithubSettings,
  useAddTag,
  useUpdateTag,
  useDeleteTag,
  useAddCustomerType,
  useDeleteCustomerType,
} from "../../hooks/useSettings";
import type { AiSettings, ConfigTag } from "../../types";

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const DATALIST_ID = "ai-model-list";

const fieldCls = [
  "px-2 py-1 rounded-lg text-xs",
  "bg-surface-raised border border-border text-slate-200",
  "placeholder-slate-600 focus:outline-none focus:border-border-strong",
].join(" ");

const inputCls = [
  "flex-1 px-3 py-1.5 rounded-lg text-sm font-mono",
  "bg-surface-raised border border-border text-slate-200",
  "placeholder-slate-600 focus:outline-none",
  "focus:border-border-strong",
].join(" ");

const saveBtnCls = [
  "px-4 py-1.5 rounded-lg text-sm",
  "bg-accent text-white hover:bg-accent-hover",
  "transition-colors disabled:opacity-50",
].join(" ");

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

type TabId = "general" | "ai" | "github" | "shortcuts" | "paths";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "ai", label: "AI" },
  { id: "github", label: "GitHub" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "paths", label: "Paths" },
];

interface TabBarProps {
  active: TabId;
  onChange: (id: TabId) => void;
}

function TabBar({ active, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 border-b border-border-subtle mb-6">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={[
            "px-4 py-2 text-sm font-medium transition-colors",
            active === tab.id
              ? "text-white border-b-2 border-accent -mb-px"
              : "text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI section
// ---------------------------------------------------------------------------

function ModelInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      list={DATALIST_ID}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[
        "w-full px-3 py-1.5 rounded-lg text-sm font-mono",
        "bg-surface-raised border border-border text-slate-200",
        "placeholder-slate-600 focus:outline-none",
        "focus:border-border-strong",
      ].join(" ")}
    />
  );
}

function AiSection() {
  const { data: aiSettings, isLoading } = useAiSettings();
  const { data: models = [] } = useAvailableModels();
  const update = useUpdateAiSettings();

  const [form, setForm] = useState<AiSettings>({
    ollama_url: "",
    lm_studio_url: "",
    claude_api_key: "",
    advisor_model: "",
    cron_model: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (aiSettings) setForm(aiSettings);
  }, [aiSettings]);

  function set(key: keyof AiSettings, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    update.mutate(form, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }

  return (
    <section>
      <datalist id={DATALIST_ID}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
            Endpoints
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-32 shrink-0">
                Ollama URL
              </span>
              <input
                type="text"
                value={form.ollama_url}
                onChange={(e) => set("ollama_url", e.target.value)}
                placeholder="http://localhost:11434"
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-32 shrink-0">
                LM Studio URL
              </span>
              <input
                type="text"
                value={form.lm_studio_url}
                onChange={(e) => set("lm_studio_url", e.target.value)}
                placeholder="http://localhost:1234 (default)"
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-32 shrink-0">
                Claude API Key
              </span>
              <input
                type="password"
                value={form.claude_api_key}
                onChange={(e) => set("claude_api_key", e.target.value)}
                placeholder="sk-ant-… (or set ANTHROPIC_API_KEY)"
                className={inputCls}
              />
            </label>
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
            Default models
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-32 shrink-0">
                Advisor
              </span>
              <div className="flex-1">
                <ModelInput
                  value={form.advisor_model}
                  onChange={(v) => set("advisor_model", v)}
                  placeholder="ollama:qwen3:14b"
                />
              </div>
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-32 shrink-0">
                Cron default
              </span>
              <div className="flex-1">
                <ModelInput
                  value={form.cron_model}
                  onChange={(v) => set("cron_model", v)}
                  placeholder="ollama:qwen3:14b"
                />
              </div>
            </label>
          </div>
          {models.length > 0 && (
            <p className="text-[10px] text-slate-700 mt-2">
              {models.length} model
              {models.length !== 1 ? "s" : ""} available — type to
              filter or enter any model string.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className={saveBtnCls}
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="text-xs text-green-400">Saved.</span>
        )}
        {update.isError && (
          <span className="text-xs text-red-400">Save failed.</span>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GitHub section
// ---------------------------------------------------------------------------

function GithubSection() {
  const { data: githubSettings, isLoading } = useGithubSettings();
  const update = useUpdateGithubSettings();

  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.github.com");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (githubSettings) {
      setToken(githubSettings.token ?? "");
      setBaseUrl(
        githubSettings.base_url || "https://api.github.com"
      );
    }
  }, [githubSettings]);

  function handleSave() {
    const updates: { token?: string; base_url?: string } = {
      base_url: baseUrl,
    };
    if (token) updates.token = token;
    update.mutate(updates, {
      onSuccess: () => {
        setSaved(true);
        setToken("");
        setTimeout(() => setSaved(false), 2000);
      },
    });
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }

  return (
    <section>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
            Authentication
          </p>
          <div className="flex flex-col gap-2">
            {githubSettings?.token_set && (
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                <span className="text-xs text-green-400">
                  Token configured
                </span>
              </div>
            )}
            <label className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-32 shrink-0">
                Personal Access Token
              </span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_..."
                className={inputCls}
              />
            </label>
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
            API
          </p>
          <label className="flex items-center gap-3">
            <span className="text-xs text-slate-400 w-32 shrink-0">
              Base URL
            </span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.github.com"
              className={inputCls}
            />
          </label>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className={saveBtnCls}
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="text-xs text-green-400">Saved.</span>
        )}
        {update.isError && (
          <span className="text-xs text-red-400">Save failed.</span>
        )}
      </div>
      <p className="mt-2 text-[10px] text-slate-700">
        Token is stored in settings.yaml. It is never sent to the
        browser in full.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

interface TagRowProps {
  tag: ConfigTag;
}

function TagRow({ tag }: TagRowProps) {
  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState(tag.color);
  const [description, setDescription] = useState(tag.description);
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  function handleSave() {
    updateTag.mutate(
      { name: tag.name, updates: { color, description } },
      { onSuccess: () => setEditing(false) }
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle last:border-0">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent shrink-0"
        />
        <span className="text-xs text-slate-400 w-24 shrink-0">
          {tag.name}
        </span>
        <input
          autoFocus
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
          className={`${fieldCls} flex-1`}
          placeholder="Description"
        />
        <button
          onClick={() => setEditing(false)}
          className="p-1 text-slate-600 hover:text-slate-300 rounded"
        >
          <X size={12} />
        </button>
        <button
          onClick={handleSave}
          disabled={updateTag.isPending}
          className="p-1 text-accent hover:bg-accent-muted rounded disabled:opacity-40"
        >
          <Check size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0">
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: tag.color }}
      />
      <span className="text-sm text-slate-200 w-32 shrink-0">
        {tag.name}
      </span>
      <span className="text-xs text-slate-500 flex-1">
        {tag.description}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded text-slate-600 hover:text-accent hover:bg-accent-muted transition-colors"
          title="Edit"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={() => deleteTag.mutate(tag.name)}
          disabled={deleteTag.isPending}
          className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

function AddTagForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [description, setDescription] = useState("");
  const addTag = useAddTag();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addTag.mutate(
      { name: name.trim(), color, description },
      { onSuccess: onDone }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 px-4 py-2.5 border-t border-border-subtle"
    >
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent shrink-0"
      />
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`${fieldCls} w-28`}
        placeholder="Name"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={`${fieldCls} flex-1`}
        placeholder="Description"
      />
      <button
        type="button"
        onClick={onDone}
        className="p-1 text-slate-600 hover:text-slate-300 rounded"
      >
        <X size={12} />
      </button>
      <button
        type="submit"
        disabled={addTag.isPending || !name.trim()}
        className="p-1 text-accent hover:bg-accent-muted rounded disabled:opacity-40"
      >
        <Check size={12} />
      </button>
    </form>
  );
}

function TagsSection({ tags }: { tags: ConfigTag[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="flex-1">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500">
          Tags
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto p-1 rounded text-slate-600 hover:text-accent hover:bg-accent-muted transition-colors"
          title="Add tag"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {tags.length === 0 && !adding && (
          <p className="px-4 py-3 text-xs text-slate-600">
            No tags defined.
          </p>
        )}
        {tags.map((tag) => (
          <TagRow key={tag.name} tag={tag} />
        ))}
        {adding && (
          <AddTagForm onDone={() => setAdding(false)} />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Customer Types
// ---------------------------------------------------------------------------

function CustomerTypesSection({ types }: { types: string[] }) {
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("");
  const addType = useAddCustomerType();
  const deleteType = useDeleteCustomerType();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newType.trim()) return;
    addType.mutate(newType.trim(), {
      onSuccess: () => {
        setNewType("");
        setAdding(false);
      },
    });
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500">
          Customer Types
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto p-1 rounded text-slate-600 hover:text-accent hover:bg-accent-muted transition-colors"
          title="Add type"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {types.length === 0 && !adding && (
          <p className="px-4 py-3 text-xs text-slate-600">
            No types defined.
          </p>
        )}
        {types.map((t, i) => (
          <div
            key={t}
            className={[
              "group flex items-center gap-3 px-4 py-2.5",
              i < types.length - 1
                ? "border-b border-border-subtle"
                : "",
            ].join(" ")}
          >
            <span className="text-xs font-mono text-slate-200 flex-1">
              {t}
            </span>
            <button
              onClick={() => deleteType.mutate(t)}
              disabled={deleteType.isPending}
              className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
              title="Delete"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        {adding && (
          <form
            onSubmit={handleAdd}
            className="flex items-center gap-2 px-4 py-2.5 border-t border-border-subtle"
          >
            <input
              autoFocus
              type="text"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className={`${fieldCls} flex-1`}
              placeholder="TYPE NAME"
            />
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="p-1 text-slate-600 hover:text-slate-300 rounded"
            >
              <X size={12} />
            </button>
            <button
              type="submit"
              disabled={addType.isPending || !newType.trim()}
              className="p-1 text-accent hover:bg-accent-muted rounded disabled:opacity-40"
            >
              <Check size={12} />
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// General tab
// ---------------------------------------------------------------------------

function GeneralTab() {
  const { data: settings, isLoading } = useSettings();

  if (isLoading) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }

  if (!settings) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        {/* Task States */}
        <section className="flex-1">
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500">
              Task States
            </h2>
            <span className="text-xs text-slate-700">
              Edit via oc config
            </span>
          </div>
          <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
            {settings.task_states.map((state, i) => (
              <div
                key={state.name}
                className={[
                  "flex items-center gap-3 px-4 py-2.5",
                  i < settings.task_states.length - 1
                    ? "border-b border-border-subtle"
                    : "",
                ].join(" ")}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: state.color }}
                />
                <span className="text-xs font-mono text-slate-400 w-28">
                  {state.name}
                </span>
                <span className="text-sm text-slate-200 flex-1">
                  {state.label}
                </span>
                {state.done && (
                  <span className="text-[10px] font-semibold uppercase text-slate-600 bg-surface-raised px-1.5 py-0.5 rounded">
                    done
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <TagsSection tags={settings.tags} />
      </div>

      <CustomerTypesSection
        types={settings.customer_types ?? []}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

const SHORTCUT_ROWS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "board", label: "Board" },
  { key: "inbox", label: "Inbox" },
  { key: "notes", label: "Notes" },
  { key: "customers", label: "Customers" },
  { key: "knowledge", label: "Knowledge" },
  { key: "github", label: "GitHub Issues" },
  { key: "communications", label: "Communications" },
  { key: "calendar", label: "Calendar" },
  { key: "clocks", label: "Clock Entries" },
  { key: "cron", label: "Cron Jobs" },
  { key: "settings", label: "Settings" },
  { key: "advisor", label: "Advisor" },
];

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
    return () => document.removeEventListener("keydown", handler);
  }, [onCapture, onCancel]);

  return (
    <span
      ref={ref}
      tabIndex={-1}
      className="text-xs text-slate-500 italic focus:outline-none"
    >
      Press a key…
    </span>
  );
}

function ShortcutsSection() {
  const {
    config,
    setViewShortcut,
    setCommandPaletteShortcut,
    resetToDefaults,
  } = useShortcutsContext();
  const [recording, setRecording] = useState<string | null>(null);

  function handleCapture(rowKey: string, s: string) {
    if (rowKey === "_palette") {
      setCommandPaletteShortcut(s);
    } else {
      setViewShortcut(rowKey, s);
    }
    setRecording(null);
  }

  const allRows = [
    { key: "_palette", label: "Command palette" },
    ...SHORTCUT_ROWS,
  ];

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500">
          Keyboard Shortcuts
        </h2>
        <button
          onClick={resetToDefaults}
          className="ml-auto flex items-center gap-1 text-xs text-slate-600 hover:text-slate-300 transition-colors"
          title="Reset to defaults"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {allRows.map((row, i) => {
          const current =
            row.key === "_palette"
              ? config.commandPalette
              : config.views[row.key] ?? "";
          const isDefault =
            row.key === "_palette"
              ? current === DEFAULT_SHORTCUTS.commandPalette
              : current === (DEFAULT_SHORTCUTS.views[row.key] ?? "");
          const isRecording = recording === row.key;

          return (
            <div
              key={row.key}
              className={[
                "group flex items-center gap-3 px-4 py-2.5",
                i < allRows.length - 1
                  ? "border-b border-border-subtle"
                  : "",
              ].join(" ")}
            >
              <span className="text-sm text-slate-300 flex-1">
                {row.label}
              </span>
              {!isDefault && (
                <button
                  onClick={() =>
                    row.key === "_palette"
                      ? setCommandPaletteShortcut(
                          DEFAULT_SHORTCUTS.commandPalette
                        )
                      : setViewShortcut(
                          row.key,
                          DEFAULT_SHORTCUTS.views[row.key] ?? ""
                        )
                  }
                  className="text-[10px] text-slate-700 hover:text-slate-400 transition-colors shrink-0"
                  title="Reset this shortcut"
                >
                  reset
                </button>
              )}
              {isRecording ? (
                <KeyCapture
                  onCapture={(s) => handleCapture(row.key, s)}
                  onCancel={() => setRecording(null)}
                />
              ) : (
                <button
                  onClick={() => setRecording(row.key)}
                  className="flex items-center gap-2 group/edit"
                  title="Click to reassign"
                >
                  <kbd className="text-[10px] font-mono text-slate-400 border border-border rounded px-1.5 py-0.5 group-hover/edit:border-accent group-hover/edit:text-accent transition-colors">
                    {current ? displayShortcut(current) : "—"}
                  </kbd>
                  <Pencil
                    size={10}
                    className="text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-slate-700">
        Shortcuts fire when no text field is focused. Click a shortcut
        to reassign it by pressing any key.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function PathsSection() {
  const { data: paths } = usePaths();
  if (!paths) return null;
  const rows = [
    { label: "Backend", value: paths.backend },
    { label: "ORG_DIR", value: paths.org_dir },
    { label: "DATA_DIR", value: paths.data_dir },
    { label: "WISSEN_DIR", value: paths.wissen_dir },
    { label: "RESEARCH_DIR", value: paths.research_dir },
    { label: "Settings file", value: paths.settings_file },
  ];
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-3">
        Paths
      </h2>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={[
              "flex items-center gap-3 px-4 py-2.5",
              i < rows.length - 1 ? "border-b border-border-subtle" : "",
            ].join(" ")}
          >
            <span className="text-xs text-slate-500 w-32 shrink-0">
              {row.label}
            </span>
            <span className="text-xs font-mono text-slate-400 truncate flex-1">
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-700">
        Read-only. Configure via environment variables or .env file.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main SettingsView
// ---------------------------------------------------------------------------

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Settings
        </h1>
        <HelpButton title="Settings" doc={DOCS.settings} view="settings" />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl">
          <TabBar active={activeTab} onChange={setActiveTab} />

          {activeTab === "general" && <GeneralTab />}
          {activeTab === "ai" && <AiSection />}
          {activeTab === "github" && <GithubSection />}
          {activeTab === "shortcuts" && <ShortcutsSection />}
          {activeTab === "paths" && <PathsSection />}
        </div>
      </div>
    </div>
  );
}
