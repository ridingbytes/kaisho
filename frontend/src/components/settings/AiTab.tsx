import { useEffect, useRef, useState } from "react";
import {
  X, Check, Plus, ChevronDown, ChevronRight,
  Trash2,
} from "lucide-react";
import {
  useAdvisorFiles,
  useAdvisorSkills,
  useAiSettings,
  useAvailableModels,
  useCloudSyncStatus,
  useCreateSkill,
  useDeleteSkill,
  useUpdateAdvisorFiles,
  useUpdateAiSettings,
  useUpdateSkill,
  useUrlAllowlist,
  useUpdateUrlAllowlist,
} from "../../hooks/useSettings";
import type { AiSettings } from "../../types";
import {
  DATALIST_ID,
  fieldCls,
  inputCls,
  saveBtnCls,
} from "./styles";

// -----------------------------------------------------------------
// Model input with datalist
// -----------------------------------------------------------------

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
        "bg-surface-raised border border-border",
        "text-stone-900 placeholder-stone-500",
        "focus:outline-none focus:border-cta",
      ].join(" ")}
    />
  );
}

// -----------------------------------------------------------------
// Advisor personality
// -----------------------------------------------------------------

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
            Personal context about the user (role,
            preferences, working style) that the advisor
            uses for tailored responses.
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
          {update.isPending ? "Saving..." : "Save"}
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

// -----------------------------------------------------------------
// URL allowlist
// -----------------------------------------------------------------

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
            Requests to unlisted domains require user
            approval.
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
              onChange={(e) =>
                setNewDomain(e.target.value)
              }
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

// -----------------------------------------------------------------
// Skill card
// -----------------------------------------------------------------

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
        {open ? (
          <ChevronDown
            size={12}
            className="text-stone-600"
          />
        ) : (
          <ChevronRight
            size={12}
            className="text-stone-600"
          />
        )}
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
              inputCls,
              "w-full resize-y mb-2",
            ].join(" ")}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={updateMut.isPending}
              className={saveBtnCls}
            >
              {updateMut.isPending
                ? "Saving..."
                : "Save"}
            </button>
            <button
              onClick={() =>
                deleteMut.mutate(skill.name)
              }
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

// -----------------------------------------------------------------
// Add skill form
// -----------------------------------------------------------------

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
          disabled={
            createMut.isPending || !name.trim()
          }
          className="p-1 text-cta hover:bg-cta-muted rounded disabled:opacity-40"
        >
          <Check size={12} />
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className={[
          inputCls,
          "w-full resize-y",
        ].join(" ")}
        placeholder="Skill instructions..."
      />
    </form>
  );
}

// -----------------------------------------------------------------
// Skills section
// -----------------------------------------------------------------

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
            Reusable prompt templates applied
            automatically when the user&apos;s request
            matches. The advisor can also create skills
            via tool call.
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

// -----------------------------------------------------------------
// Main export
// -----------------------------------------------------------------

export function AiSection(): JSX.Element {
  const { data: aiSettings, isLoading } =
    useAiSettings();
  const { data: models = [] } = useAvailableModels();
  const { data: cloudStatus } = useCloudSyncStatus();
  const update = useUpdateAiSettings();
  const cloudAi = cloudStatus?.use_cloud_ai;

  const [form, setForm] = useState<AiSettings>({
    ollama_url: "",
    lm_studio_url: "",
    claude_api_key: "",
    openrouter_url: "",
    openrouter_api_key: "",
    openai_url: "",
    openai_api_key: "",
    brave_api_key: "",
    tavily_api_key: "",
    advisor_model: "",
    cron_model: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (aiSettings) setForm(aiSettings);
  }, [aiSettings]);

  function set(
    key: keyof AiSettings,
    value: string,
  ) {
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
    return (
      <p className="text-sm text-stone-500">
        Loading...
      </p>
    );
  }

  return (
    <section>
      <datalist id={DATALIST_ID}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {cloudAi && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-cta/10 border border-cta/30">
          <p className="text-xs text-cta font-medium">
            Kaisho AI is active
          </p>
          <p className="text-[10px] text-stone-500 mt-1">
            The advisor and cron jobs use OpenRouter
            via your Cloud Sync subscription. Local
            model settings below are not used while
            Kaisho AI is enabled.
          </p>
        </div>
      )}

      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {/* Local / subscription providers */}
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
            Local / Subscription
          </p>
          <p className="text-[10px] text-stone-400 mb-2">
            No API key needed. Ollama and LM Studio run
            locally. Recommended model:{" "}
            <strong>gemma4</strong> (Google) — use{" "}
            <em>gemma4:e2b</em> for cron jobs and{" "}
            <em>gemma4:latest</em> for the advisor.
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                Ollama URL
              </span>
              <input
                type="text"
                value={form.ollama_url}
                onChange={(e) =>
                  set("ollama_url", e.target.value)
                }
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
                onChange={(e) =>
                  set(
                    "lm_studio_url",
                    e.target.value,
                  )
                }
                placeholder="http://localhost:1234"
                className={inputCls}
              />
            </label>
          </div>
        </div>

        {/* Cloud API keys */}
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
            Cloud API Keys
          </p>
          <p className="text-[10px] text-stone-400 mb-2">
            Billed per token. Set keys only for the
            providers you want to use.
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                Claude API Key
              </span>
              <input
                type="password"
                value={form.claude_api_key}
                onChange={(e) =>
                  set(
                    "claude_api_key",
                    e.target.value,
                  )
                }
                placeholder="sk-ant-..."
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
                onChange={(e) =>
                  set(
                    "openrouter_url",
                    e.target.value,
                  )
                }
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
                onChange={(e) =>
                  set(
                    "openrouter_api_key",
                    e.target.value,
                  )
                }
                placeholder="sk-or-..."
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
                onChange={(e) =>
                  set("openai_url", e.target.value)
                }
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
                onChange={(e) =>
                  set(
                    "openai_api_key",
                    e.target.value,
                  )
                }
                placeholder="sk-..."
                className={inputCls}
              />
            </label>
          </div>
        </div>

        {/* Web search API keys */}
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
            Web Search
          </p>
          <p className="text-[10px] text-stone-400 mb-2">
            Used by the advisor&apos;s web_search tool.
            Priority: Brave &gt; Tavily &gt; DuckDuckGo
            (free fallback).
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                Brave API Key
              </span>
              <input
                type="password"
                value={form.brave_api_key}
                onChange={(e) =>
                  set(
                    "brave_api_key",
                    e.target.value,
                  )
                }
                placeholder="BSA..."
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                Tavily API Key
              </span>
              <input
                type="password"
                value={form.tavily_api_key}
                onChange={(e) =>
                  set(
                    "tavily_api_key",
                    e.target.value,
                  )
                }
                placeholder="tvly-..."
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
                  onChange={(v) =>
                    set("advisor_model", v)
                  }
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
                  onChange={(v) =>
                    set("cron_model", v)
                  }
                  placeholder="ollama:qwen3:14b"
                />
              </div>
            </label>
          </div>
          {models.length > 0 && (
            <p className="text-[10px] text-stone-400 mt-2">
              {models.length} model
              {models.length !== 1 ? "s" : ""}{" "}
              available — type to filter or enter any
              model string.
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
          {update.isPending ? "Saving..." : "Save"}
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

      <AdvisorPersonalitySection />
      <SkillsSection />
      <UrlAllowlistSection />
    </section>
  );
}
