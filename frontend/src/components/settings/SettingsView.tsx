import { useEffect, useRef, useState } from "react";
import {
  X, Check, Copy, Plus, Pencil, RotateCcw,
  ChevronDown, ChevronRight, Trash2,
} from "lucide-react";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import {
  DEFAULT_SHORTCUTS,
  displayShortcut,
  eventToShortcut,
  useShortcutsContext,
} from "../../context/ShortcutsContext";
import {
  useAdvisorFiles,
  useAdvisorSkills,
  useAiSettings,
  useAvailableModels,
  useClaudeCliStatus,
  useCreateSkill,
  useCurrentUser,
  useDeleteSkill,
  useGithubSettings,
  useKbSources,
  useUpdateKbSources,
  usePaths,
  useSettings,
  useSwitchBackend,
  useUpdateAdvisorFiles,
  useUpdateAiSettings,
  useUpdateGithubSettings,
  useTimezone,
  useUpdateTimezone,
  useUpdatePaths,
  useUpdateSkill,
  useUpdateUserProfile,
  useUrlAllowlist,
  useUpdateUrlAllowlist,
  useAddTag,
  useUpdateTag,
  useDeleteTag,
  useAddCustomerType,
  useDeleteCustomerType,
  useCopyProfile,
  useCreateProfile,
  useDeleteProfile,
  useProfiles,
  useRenameProfile,
  useSwitchProfile,
  useUpdateState,
} from "../../hooks/useSettings";
import { PixelAvatar } from "../common/PixelAvatar";
import type { AiSettings, ConfigTag } from "../../types";

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const DATALIST_ID = "ai-model-list";

const fieldCls = [
  "px-2 py-1 rounded-lg text-xs",
  "bg-surface-raised border border-border text-stone-900",
  "placeholder-stone-500 focus:outline-none focus:border-border-strong",
].join(" ");

const inputCls = [
  "flex-1 px-3 py-1.5 rounded-lg text-sm font-mono",
  "bg-surface-raised border border-border text-stone-900",
  "placeholder-stone-500 focus:outline-none",
  "focus:border-border-strong",
].join(" ");

const saveBtnCls = [
  "px-4 py-1.5 rounded-lg text-sm",
  "bg-cta text-white hover:bg-cta-hover",
  "transition-colors disabled:opacity-50",
].join(" ");

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

type TabId =
  | "general"
  | "tags"
  | "ai"
  | "github"
  | "shortcuts"
  | "paths";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "tags", label: "Tags & Types" },
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
              ? "text-cta border-b-2 border-cta -mb-px"
              : "text-stone-600 hover:text-stone-900",
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
        "bg-surface-raised border border-border text-stone-900",
        "placeholder-stone-500 focus:outline-none",
        "focus:border-border-strong",
      ].join(" ")}
    />
  );
}

function AdvisorPersonalitySection() {
  const { data: files } = useAdvisorFiles();
  const update = useUpdateAdvisorFiles();
  const [soul, setSoul] = useState("");
  const [user, setUser] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (files) {
      setSoul(files.soul);
      setUser(files.user);
    }
  }, [files]);

  function handleSave() {
    update.mutate(
      { soul, user },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      }
    );
  }

  return (
    <div className="mt-6">
      <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
        Advisor Personality
      </h2>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
            SOUL.md
          </p>
          <p className="text-[10px] text-stone-400 mb-2">
            Defines the advisor personality, tone, and
            behavioral guidelines.
          </p>
          <textarea
            value={soul}
            onChange={(e) => setSoul(e.target.value)}
            rows={6}
            className={[
              inputCls,
              "w-full resize-y",
            ].join(" ")}
            placeholder="# Advisor Personality&#10;..."
          />
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
            USER.md
          </p>
          <p className="text-[10px] text-stone-400 mb-2">
            Personal context about the user (role, preferences,
            working style) that the advisor uses for tailored
            responses.
          </p>
          <textarea
            value={user}
            onChange={(e) => setUser(e.target.value)}
            rows={6}
            className={[
              inputCls,
              "w-full resize-y",
            ].join(" ")}
            placeholder="# About Me&#10;..."
          />
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
          <span className="text-xs text-green-400">
            Saved.
          </span>
        )}
        {update.isError && (
          <span className="text-xs text-red-400">
            Save failed.
          </span>
        )}
      </div>
    </div>
  );
}

function UrlAllowlistSection() {
  const { data: allowlist } = useUrlAllowlist();
  const update = useUpdateUrlAllowlist();
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (allowlist && !initialized.current) {
      setDomains(allowlist);
      initialized.current = true;
    }
  }, [allowlist]);

  function handleRemove(domain: string) {
    const next = domains.filter((d) => d !== domain);
    setDomains(next);
    update.mutate(next);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const d = newDomain.trim().toLowerCase();
    if (!d || domains.includes(d)) return;
    const next = [...domains, d];
    setDomains(next);
    setNewDomain("");
    update.mutate(next);
  }

  return (
    <div className="mt-6">
      <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
        URL Allowlist
      </h2>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3">
          <p className="text-[10px] text-stone-400 mb-3">
            Domains the advisor and cron jobs may fetch.
            Requests to unlisted domains require user approval.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {domains.length === 0 && (
              <span className="text-xs text-stone-500">
                No domains allowed yet.
              </span>
            )}
            {domains.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-surface-raised border border-border text-stone-800"
              >
                {d}
                <button
                  onClick={() => handleRemove(d)}
                  className="text-stone-500 hover:text-red-400 transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <form
            onSubmit={handleAdd}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              className={[inputCls, "flex-1"].join(" ")}
            />
            <button
              type="submit"
              disabled={!newDomain.trim()}
              className={saveBtnCls}
            >
              Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function SkillCard({
  skill,
}: {
  skill: { name: string; content: string };
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(skill.content);
  const [saved, setSaved] = useState(false);
  const updateMut = useUpdateSkill();
  const deleteMut = useDeleteSkill();

  useEffect(() => {
    setContent(skill.content);
  }, [skill.content]);

  function handleSave() {
    updateMut.mutate(
      { name: skill.name, content },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      }
    );
  }

  return (
    <div className="border-b border-border-subtle last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-surface-raised transition-colors"
      >
        {open
          ? <ChevronDown size={12} className="text-stone-600" />
          : <ChevronRight size={12} className="text-stone-600" />}
        <span className="text-sm text-stone-900 font-mono">
          {skill.name}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className={[
              inputCls, "w-full resize-y mb-2",
            ].join(" ")}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={updateMut.isPending}
              className={saveBtnCls}
            >
              {updateMut.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => deleteMut.mutate(skill.name)}
              disabled={deleteMut.isPending}
              className="p-1.5 rounded text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete skill"
            >
              <Trash2 size={13} />
            </button>
            {saved && (
              <span className="text-xs text-green-400">
                Saved.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddSkillForm({
  onDone,
}: {
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const createMut = useCreateSkill();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMut.mutate(
      { name: name.trim(), content },
      { onSuccess: onDone }
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-3 border-t border-border-subtle"
    >
      <div className="flex items-center gap-2 mb-2">
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={[fieldCls, "flex-1"].join(" ")}
          placeholder="skill-name (kebab-case)"
        />
        <button
          type="button"
          onClick={onDone}
          className="p-1 text-stone-500 hover:text-stone-900 rounded"
        >
          <X size={12} />
        </button>
        <button
          type="submit"
          disabled={createMut.isPending || !name.trim()}
          className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
        >
          <Check size={12} />
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className={[inputCls, "w-full resize-y"].join(" ")}
        placeholder="Skill instructions..."
      />
    </form>
  );
}

function SkillsSection() {
  const { data: skills = [] } = useAdvisorSkills();
  const [adding, setAdding] = useState(false);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
          Skills
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          title="Add skill"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] text-stone-400">
            Reusable prompt templates applied automatically
            when the user&apos;s request matches. The
            advisor can also create skills via tool call.
          </p>
        </div>
        {skills.length === 0 && !adding && (
          <p className="px-4 py-3 text-xs text-stone-500">
            No skills defined yet.
          </p>
        )}
        {skills.map((s) => (
          <SkillCard key={s.name} skill={s} />
        ))}
        {adding && (
          <AddSkillForm
            onDone={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}

function AiSection() {
  const { data: aiSettings, isLoading } = useAiSettings();
  const { data: models = [] } = useAvailableModels();
  const { data: cliStatus } = useClaudeCliStatus();
  const update = useUpdateAiSettings();

  const [form, setForm] = useState<AiSettings>({
    ollama_url: "",
    lm_studio_url: "",
    claude_api_key: "",
    openrouter_url: "",
    openrouter_api_key: "",
    openai_url: "",
    openai_api_key: "",
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
    return <p className="text-sm text-stone-500">Loading…</p>;
  }

  return (
    <section>
      <datalist id={DATALIST_ID}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {/* Local / subscription providers */}
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
            Local / Subscription
          </p>
          <p className="text-[10px] text-stone-400 mb-2">
            No API key needed. Ollama and LM Studio run locally.
            Claude CLI uses your login token (run
            &quot;claude login&quot; once).
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
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
              <span className="text-xs text-stone-700 w-32 shrink-0">
                LM Studio URL
              </span>
              <input
                type="text"
                value={form.lm_studio_url}
                onChange={(e) => set("lm_studio_url", e.target.value)}
                placeholder="http://localhost:1234"
                className={inputCls}
              />
            </label>
          </div>
        </div>

        {/* Claude CLI status */}
        {cliStatus && (
          <div className="px-4 py-3 border-b border-border-subtle">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
              Claude CLI (Subscription)
            </p>
            <div className="flex items-center gap-3 text-xs">
              <span className={
                cliStatus.installed
                  ? "text-emerald-400"
                  : "text-red-400"
              }>
                {cliStatus.installed
                  ? `Installed (${cliStatus.version})`
                  : "Not installed"}
              </span>
              {cliStatus.installed && (
                <span className={
                  cliStatus.authenticated
                    ? "text-emerald-400"
                    : "text-amber-400"
                }>
                  {cliStatus.authenticated
                    ? "Logged in"
                    : "Not logged in"}
                </span>
              )}
            </div>
            <p className="text-[10px] text-stone-400 mt-1">
              {cliStatus.installed
                ? cliStatus.authenticated
                  ? "Use prefix claude_cli: for subscription-based models."
                  : "Run 'claude login' in the terminal to authenticate."
                : "Install Claude Code CLI and run 'claude login'."}
            </p>
          </div>
        )}

        {/* Cloud API keys */}
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
            Cloud API Keys
          </p>
          <p className="text-[10px] text-stone-400 mb-2">
            Billed per token. Set keys only for the providers
            you want to use.
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                Claude API Key
              </span>
              <input
                type="password"
                value={form.claude_api_key}
                onChange={(e) => set("claude_api_key", e.target.value)}
                placeholder="sk-ant-…"
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                OpenRouter URL
              </span>
              <input
                type="text"
                value={form.openrouter_url}
                onChange={(e) => set("openrouter_url", e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                OpenRouter Key
              </span>
              <input
                type="password"
                value={form.openrouter_api_key}
                onChange={(e) => set("openrouter_api_key", e.target.value)}
                placeholder="sk-or-…"
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                OpenAI URL
              </span>
              <input
                type="text"
                value={form.openai_url}
                onChange={(e) => set("openai_url", e.target.value)}
                placeholder="https://api.openai.com/v1"
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                OpenAI Key
              </span>
              <input
                type="password"
                value={form.openai_api_key}
                onChange={(e) => set("openai_api_key", e.target.value)}
                placeholder="sk-…"
                className={inputCls}
              />
            </label>
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
            Default models
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
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
              <span className="text-xs text-stone-700 w-32 shrink-0">
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
            <p className="text-[10px] text-stone-400 mt-2">
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

      <AdvisorPersonalitySection />
      <SkillsSection />
      <UrlAllowlistSection />
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
    return <p className="text-sm text-stone-500">Loading…</p>;
  }

  return (
    <section>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
            Authentication
          </p>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-stone-500 leading-relaxed mb-1">
              A Personal Access Token (PAT) is a GitHub credential that
              grants API access without a password. Create a classic PAT at{" "}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cta hover:underline"
              >
                github.com/settings/tokens
              </a>
              {" "}with the following scopes:{" "}
              <span className="font-mono text-[11px] text-stone-600">
                repo, read:org, read:project, read:user, read:discussion,
                read:packages
              </span>
            </p>
            {githubSettings?.token_set && (
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                <span className="text-xs text-green-400">
                  Token configured
                </span>
              </div>
            )}
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
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
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
            API
          </p>
          <label className="flex items-center gap-3">
            <span className="text-xs text-stone-700 w-32 shrink-0">
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
      <p className="mt-2 text-[10px] text-stone-400">
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
        <span className="text-xs text-stone-700 w-24 shrink-0">
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
          className="p-1 text-stone-500 hover:text-stone-900 rounded"
        >
          <X size={12} />
        </button>
        <button
          onClick={handleSave}
          disabled={updateTag.isPending}
          className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
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
      <span className="text-sm text-stone-900 w-32 shrink-0">
        {tag.name}
      </span>
      <span className="text-xs text-stone-600 flex-1">
        {tag.description}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          title="Edit"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={() => deleteTag.mutate(tag.name)}
          disabled={deleteTag.isPending}
          className="p-1 rounded text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
        className="p-1 text-stone-500 hover:text-stone-900 rounded"
      >
        <X size={12} />
      </button>
      <button
        type="submit"
        disabled={addTag.isPending || !name.trim()}
        className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
      >
        <Check size={12} />
      </button>
    </form>
  );
}

function TaskStateRow({
  state,
  isLast,
}: {
  state: { name: string; label: string; color: string; done: boolean };
  isLast: boolean;
}) {
  const update = useUpdateState();
  const [label, setLabel] = useState(state.label);
  const [color, setColor] = useState(state.color);

  function save() {
    const updates: { label?: string; color?: string } = {};
    if (label !== state.label) updates.label = label;
    if (color !== state.color) updates.color = color;
    if (Object.keys(updates).length > 0) {
      update.mutate({ name: state.name, updates });
    }
  }

  return (
    <div
      className={[
        "flex items-center gap-3 px-4 py-2",
        !isLast ? "border-b border-border-subtle" : "",
      ].join(" ")}
    >
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        onBlur={save}
        className="w-5 h-5 rounded-full border-0 p-0 cursor-pointer bg-transparent shrink-0"
        title="Color"
      />
      <span className="text-xs font-mono text-stone-600 w-28 shrink-0">
        {state.name}
      </span>
      <input
        className={inputCls + " flex-1 text-sm"}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
      {state.done && (
        <span className="text-[10px] font-semibold uppercase text-stone-500 bg-surface-raised px-1.5 py-0.5 rounded shrink-0">
          done
        </span>
      )}
    </div>
  );
}

function TaskStatesSection({
  states,
}: {
  states: { name: string; label: string; color: string; done: boolean }[];
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
        Task States
      </h2>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {states.map((state, i) => (
          <TaskStateRow
            key={state.name}
            state={state}
            isLast={i === states.length - 1}
          />
        ))}
      </div>
    </section>
  );
}

function TagsSection({ tags }: { tags: ConfigTag[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
          Tags
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          title="Add tag"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {tags.length === 0 && !adding && (
          <p className="px-4 py-3 text-xs text-stone-500">
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
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
          Customer Types
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          title="Add type"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {types.length === 0 && !adding && (
          <p className="px-4 py-3 text-xs text-stone-500">
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
            <span className="text-xs font-mono text-stone-900 flex-1">
              {t}
            </span>
            <button
              onClick={() => deleteType.mutate(t)}
              disabled={deleteType.isPending}
              className="p-1 rounded text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
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
              className="p-1 text-stone-500 hover:text-stone-900 rounded"
            >
              <X size={12} />
            </button>
            <button
              type="submit"
              disabled={addType.isPending || !newType.trim()}
              className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
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

function UserProfileSection() {
  const { data: userData } = useCurrentUser();
  const update = useUpdateUserProfile();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [avatarSeed, setAvatarSeed] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (userData) {
      setName(userData.name ?? "");
      setEmail(userData.email ?? "");
      setBio(userData.bio ?? "");
      setAvatarSeed(
        userData.avatar_seed || userData.name || "kaisho"
      );
    }
  }, [userData]);

  if (!userData) return null;

  function randomizeAvatar() {
    const seed = Math.random().toString(36).slice(2, 10);
    setAvatarSeed(seed);
    update.mutate({ avatar_seed: seed });
  }

  function handleSave() {
    update.mutate(
      { name, email, bio, avatar_seed: avatarSeed },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      }
    );
  }

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
        User Profile
      </h2>
      <div className="bg-surface-card rounded-xl border border-border p-4 flex flex-col gap-4">
        {/* Avatar + username */}
        <div className="flex items-center gap-3">
          <PixelAvatar
            seed={avatarSeed}
            size={64}
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm text-stone-600 font-mono">
              {userData.name || "kaisho"}
            </span>
            <button
              type="button"
              onClick={randomizeAvatar}
              className="text-[10px] text-stone-500 hover:text-cta transition-colors text-left"
            >
              Randomize avatar
            </button>
          </div>
        </div>

        {/* Full name */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Full name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className={inputCls}
          />
        </label>

        {/* Email */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={inputCls}
          />
        </label>

        {/* Bio */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Bio
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            placeholder="Short bio"
            className={[inputCls, "resize-y"].join(" ")}
          />
        </label>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className={saveBtnCls}
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
          {saved && (
            <span className="text-xs text-green-400">
              Saved
            </span>
          )}
        </div>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------------
// Profiles tab
// ---------------------------------------------------------------------------

function ProfilesTab() {
  const { data: userData } = useCurrentUser();
  const { data: profileData } = useProfiles();
  const switchProfile = useSwitchProfile();
  const createProfile = useCreateProfile();
  const copyProfile = useCopyProfile();
  const renameProfile = useRenameProfile();
  const deleteProfile = useDeleteProfile();
  const [newProfile, setNewProfile] = useState("");
  const [renamingProfile, setRenamingProfile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copyingProfile, setCopyingProfile] = useState<string | null>(null);
  const [copyValue, setCopyValue] = useState("");

  if (!userData || !profileData) return null;

  function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!newProfile.trim()) return;
    createProfile.mutate(newProfile.trim(), {
      onSuccess: () => {
        setNewProfile("");
        switchProfile.mutate(newProfile.trim(), {
          onSuccess: () => window.location.reload(),
        });
      },
      onError: () => {
        switchProfile.mutate(newProfile.trim(), {
          onSuccess: () => window.location.reload(),
        });
      },
    });
  }

  function startRename(p: string) {
    setRenamingProfile(p);
    setRenameValue(p);
  }

  function commitRename(p: string) {
    const newName = renameValue.trim();
    if (!newName || newName === p) {
      setRenamingProfile(null);
      return;
    }
    renameProfile.mutate(
      { oldName: p, newName },
      { onSettled: () => setRenamingProfile(null) },
    );
  }

  function handleDelete(p: string) {
    deleteProfile.mutate(p, {
      onSettled: () => setConfirmDelete(null),
    });
  }

  function startCopy(p: string) {
    setCopyingProfile(p);
    setCopyValue(`${p}-copy`);
  }

  function commitCopy(p: string) {
    const target = copyValue.trim();
    if (!target) {
      setCopyingProfile(null);
      return;
    }
    copyProfile.mutate(
      { name: p, target },
      { onSettled: () => setCopyingProfile(null) },
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
          Profiles
        </h2>
        <p className="text-[10px] text-stone-500 mb-3">
          User: {userData.name || userData.name || "kaisho"}
          {" "}&middot; Active: {userData.profile}
        </p>
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden mb-3">
          {(profileData.profiles ?? []).map((p, i, arr) => {
            const isActive = p === profileData.active;
            const isRenaming = renamingProfile === p;
            const isCopying = copyingProfile === p;
            const isConfirmingDelete = confirmDelete === p;
            return (
              <div
                key={p}
                className={[
                  "flex items-center gap-2 px-4 py-2.5",
                  i < arr.length - 1
                    ? "border-b border-border-subtle"
                    : "",
                ].join(" ")}
              >
                {isRenaming ? (
                  <>
                    <input
                      autoFocus
                      className={inputCls + " flex-1 text-sm"}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(p);
                        if (e.key === "Escape") setRenamingProfile(null);
                      }}
                    />
                    <button
                      onClick={() => commitRename(p)}
                      disabled={renameProfile.isPending}
                      className="p-1 rounded text-green-500 hover:text-green-400 transition-colors"
                      title="Save rename"
                    >
                      <Check size={13} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => setRenamingProfile(null)}
                      className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                      title="Cancel"
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  </>
                ) : isCopying ? (
                  <>
                    <span className="text-xs text-stone-500 shrink-0">
                      Copy <strong className="text-stone-700">{p}</strong> to:
                    </span>
                    <input
                      autoFocus
                      className={inputCls + " flex-1 text-sm"}
                      value={copyValue}
                      onChange={(e) => setCopyValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitCopy(p);
                        if (e.key === "Escape") setCopyingProfile(null);
                      }}
                    />
                    <button
                      onClick={() => commitCopy(p)}
                      disabled={copyProfile.isPending}
                      className="p-1 rounded text-green-500 hover:text-green-400 transition-colors"
                      title="Create copy"
                    >
                      <Check size={13} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => setCopyingProfile(null)}
                      className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                      title="Cancel"
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  </>
                ) : isConfirmingDelete ? (
                  <>
                    <span className="text-xs text-stone-600 flex-1">
                      Delete <strong className="text-stone-800">{p}</strong>?
                      {" "}All data will be lost.
                    </span>
                    <button
                      onClick={() => handleDelete(p)}
                      disabled={deleteProfile.isPending}
                      className="px-2 py-1 rounded text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className={[
                      "text-sm flex-1",
                      isActive
                        ? "text-cta font-semibold"
                        : "text-stone-800",
                    ].join(" ")}>
                      {p}
                    </span>
                    {isActive ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-cta uppercase tracking-wider font-semibold">
                          active
                        </span>
                        <button
                          onClick={() => startCopy(p)}
                          className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                          title="Copy profile"
                        >
                          <Copy size={12} strokeWidth={2} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            switchProfile.mutate(p, {
                              onSuccess: () => window.location.reload(),
                            })
                          }
                          disabled={switchProfile.isPending}
                          className="px-2 py-1 rounded text-xs text-stone-600 hover:text-cta hover:bg-cta-muted transition-colors"
                        >
                          Switch
                        </button>
                        <button
                          onClick={() => startCopy(p)}
                          className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                          title="Copy profile"
                        >
                          <Copy size={12} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => startRename(p)}
                          className="p-1 rounded text-stone-500 hover:text-stone-700 transition-colors"
                          title="Rename profile"
                        >
                          <Pencil size={12} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p)}
                          className="p-1 rounded text-stone-500 hover:text-red-500 transition-colors"
                          title="Delete profile"
                        >
                          <Trash2 size={12} strokeWidth={2} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <form
          onSubmit={handleCreateProfile}
          className="flex gap-2"
        >
          <input
            type="text"
            value={newProfile}
            onChange={(e) => setNewProfile(e.target.value)}
            placeholder="New profile name"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={!newProfile.trim()}
            className={saveBtnCls}
          >
            Create
          </button>
        </form>
      </section>
    </div>
  );
}

function TimezoneSection() {
  const { data } = useTimezone();
  const update = useUpdateTimezone();
  const [tz, setTz] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.timezone) setTz(data.timezone);
  }, [data]);

  function handleSave() {
    update.mutate(tz.trim(), {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  }

  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
        Timezone
      </p>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3">
          <label className="flex items-center gap-3">
            <span className="text-xs text-stone-700 w-32 shrink-0">
              Timezone
            </span>
            <input
              type="text"
              list="tz-list"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="Europe/Berlin"
              className={inputCls}
            />
            <datalist id="tz-list">
              {(Intl as unknown as { supportedValuesOf(k: string): string[] })
                .supportedValuesOf("timeZone")
                .map((z) => (
                  <option key={z} value={z} />
                ))}
            </datalist>
          </label>
          <p className="text-[11px] text-stone-400 mt-1.5 ml-[140px]">
            IANA timezone name, e.g. Europe/Berlin, America/New_York,
            UTC. Used for cron history and clock timestamps.
          </p>
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

function GeneralTab() {
  return (
    <div className="flex flex-col gap-8">
      <UserProfileSection />
      <TimezoneSection />
      <ProfilesTab />
    </div>
  );
}

function TagsAndTypesTab() {
  const { data: settings, isLoading } = useSettings();

  if (isLoading) {
    return <p className="text-sm text-stone-500">Loading…</p>;
  }
  if (!settings) return null;

  return (
    <div className="flex flex-col gap-8">
      <CustomerTypesSection
        types={settings.customer_types ?? []}
      />
      <TaskStatesSection
        states={settings.task_states}
      />
      <TagsSection tags={settings.tags} />
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
      className="text-xs text-stone-600 italic focus:outline-none"
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
              <span className="text-sm text-stone-800 flex-1">
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
                  className="text-[10px] text-stone-400 hover:text-stone-700 transition-colors shrink-0"
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
                  <kbd className="text-[10px] font-mono text-stone-700 border border-border rounded px-1.5 py-0.5 group-hover/edit:border-cta group-hover/edit:text-cta transition-colors">
                    {current ? displayShortcut(current) : "—"}
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
      <p className="mt-2 text-[10px] text-stone-400">
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
  const update = useUpdatePaths();
  const switchBe = useSwitchBackend();
  const { data: kbSources = [] } = useKbSources();
  const updateKb = useUpdateKbSources();
  const [orgDir, setOrgDir] = useState("");
  const [mdDir, setMdDir] = useState("");
  const [backend, setBackend] = useState("org");
  const [sources, setSources] = useState<
    { label: string; path: string }[]
  >([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (paths) {
      setOrgDir(paths.org_dir ?? "");
      setMdDir(paths.markdown_dir ?? "");
      setBackend(paths.backend ?? "org");
    }
  }, [paths]);

  useEffect(() => {
    if (kbSources.length > 0) {
      setSources(kbSources.map((s) => ({ ...s })));
    }
  }, [kbSources]);

  if (!paths) return null;

  function handleSavePaths() {
    update.mutate(
      { org_dir: orgDir, markdown_dir: mdDir },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        },
      }
    );
  }

  function handleSwitchBackend() {
    switchBe.mutate(backend, {
      onSuccess: () => window.location.reload(),
    });
  }

  function handleSaveKb() {
    const valid = sources.filter(
      (s) => s.label.trim() && s.path.trim()
    );
    updateKb.mutate(valid);
  }

  function addSource() {
    setSources((prev) => [...prev, { label: "", path: "" }]);
  }

  function removeSource(idx: number) {
    setSources((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSource(
    idx: number,
    field: "label" | "path",
    value: string
  ) {
    setSources((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, [field]: value } : s
      )
    );
  }

  return (
    <section className="space-y-8">
      {/* Backend selector */}
      <div>
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
          Storage Backend
        </h2>
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden mb-3">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-xs text-stone-700 w-32 shrink-0">
              Backend
            </span>
            <select
              value={backend}
              onChange={(e) => setBackend(e.target.value)}
              className={[
                fieldCls, "flex-1",
              ].join(" ")}
            >
              <option value="org">
                Org-mode (*.org files)
              </option>
              <option value="markdown">
                Markdown (*.md files)
              </option>
              <option value="json">
                JSON (*.json files)
              </option>
            </select>
            <button
              onClick={handleSwitchBackend}
              disabled={
                switchBe.isPending ||
                backend === paths?.backend
              }
              className={saveBtnCls}
            >
              {switchBe.isPending ? "Switching…" : "Switch"}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-stone-400 mb-6">
          Data is not migrated between backends.
        </p>
      </div>

      {/* Data directories */}
      <div>
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
          Data Directories
        </h2>
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden mb-4">
          <label className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle">
            <span className="text-xs text-stone-700 w-32 shrink-0">
              ORG_DIR
            </span>
            <input
              type="text"
              value={orgDir}
              onChange={(e) => setOrgDir(e.target.value)}
              className={inputCls}
              placeholder="~/ownCloud/cowork/org"
            />
          </label>
          <label className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle">
            <span className="text-xs text-stone-700 w-32 shrink-0">
              MARKDOWN_DIR
            </span>
            <input
              type="text"
              value={mdDir}
              onChange={(e) => setMdDir(e.target.value)}
              className={inputCls}
              placeholder="data/markdown"
            />
          </label>
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-xs text-stone-700 w-32 shrink-0">
              DATA_DIR
            </span>
            <span className="text-xs font-mono text-stone-600 truncate flex-1">
              {paths?.data_dir ?? "data"}
            </span>
            <span className="text-[10px] text-stone-400">
              (global, set via .env)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSavePaths}
            disabled={update.isPending}
            className={saveBtnCls}
          >
            {update.isPending ? "Saving…" : "Save Paths"}
          </button>
          {saved && (
            <span className="text-xs text-green-400">
              Saved.
            </span>
          )}
        </div>
      </div>

      {/* KB sources */}
      <div>
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
          Knowledge Base Sources
        </h2>
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden mb-3">
          {sources.map((src, idx) => (
            <div
              key={idx}
              className={[
                "flex items-center gap-2 px-4 py-2.5",
                idx < sources.length - 1
                  ? "border-b border-border-subtle"
                  : "",
              ].join(" ")}
            >
              <input
                type="text"
                value={src.label}
                onChange={(e) =>
                  updateSource(idx, "label", e.target.value)
                }
                placeholder="Label"
                className={[
                  fieldCls, "w-28 shrink-0",
                ].join(" ")}
              />
              <input
                type="text"
                value={src.path}
                onChange={(e) =>
                  updateSource(idx, "path", e.target.value)
                }
                placeholder="~/path/to/folder"
                className={[inputCls].join(" ")}
              />
              <button
                onClick={() => removeSource(idx)}
                className="p-1 rounded text-stone-500 hover:text-red-400 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {sources.length === 0 && (
            <p className="px-4 py-3 text-xs text-stone-500">
              No KB sources defined. Add one below.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={addSource}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-stone-700 bg-surface-raised border border-border hover:text-cta hover:border-cta/40 transition-colors"
          >
            <Plus size={12} />
            Add source
          </button>
          <button
            onClick={handleSaveKb}
            disabled={updateKb.isPending}
            className={saveBtnCls}
          >
            {updateKb.isPending ? "Saving…" : "Save KB Sources"}
          </button>
        </div>
      </div>

      {/* Read-only info */}
      <div>
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
          Info
        </h2>
        <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-xs text-stone-600 w-32 shrink-0">
              Settings file
            </span>
            <span className="text-xs font-mono text-stone-700 truncate flex-1">
              {paths?.settings_file}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-stone-400">
          Backend, ORG_DIR, and MARKDOWN_DIR are stored per profile.
          DATA_DIR, HOST, PORT are global (.env).
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main SettingsView
// ---------------------------------------------------------------------------

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<TabId>(
    () => (localStorage.getItem("settings_tab") as TabId) || "general"
  );
  function changeTab(id: TabId) {
    setActiveTab(id);
    localStorage.setItem("settings_tab", id);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-700">
          Settings
        </h1>
        <HelpButton title="Settings" doc={DOCS.settings} view="settings" />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl">
          <TabBar active={activeTab} onChange={changeTab} />

          {activeTab === "general" && <GeneralTab />}
          {activeTab === "tags" && <TagsAndTypesTab />}
          {activeTab === "ai" && <AiSection />}
          {activeTab === "github" && <GithubSection />}
          {activeTab === "shortcuts" && <ShortcutsSection />}
          {activeTab === "paths" && <PathsSection />}
        </div>
      </div>
    </div>
  );
}
