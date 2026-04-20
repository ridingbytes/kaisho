import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X, Check, Plus, ChevronDown, ChevronRight,
  Trash2,
} from "lucide-react";
import {
  useAdvisorFiles,
  useAdvisorSkills,
  useAiProbe,
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
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
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
        {t("advisorPersonality")}
      </h2>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1">
            {t("soulMd")}
          </p>
          <p className="text-[10px] text-stone-400 mb-2">
            {t("soulMdHint")}
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
            {t("userMd")}
          </p>
          <p className="text-[10px] text-stone-400 mb-2">
            {t("userMdHint")}
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
          {update.isPending ? tc("saving") : tc("save")}
        </button>
        {saved && (
          <span className="text-xs text-green-400">
            {tc("saved")}
          </span>
        )}
        {update.isError && (
          <span className="text-xs text-red-400">
            {tc("saveFailed")}
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
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
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
        {t("urlAllowlist")}
      </h2>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3">
          <p className="text-[10px] text-stone-400 mb-3">
            {t("urlAllowlistHint")}
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {domains.length === 0 && (
              <span className="text-xs text-stone-500">
                {t("noDomainsAllowed")}
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
              {tc("add")}
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
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
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
                ? tc("saving")
                : tc("save")}
            </button>
            <button
              onClick={() =>
                deleteMut.mutate(skill.name)
              }
              disabled={deleteMut.isPending}
              className="p-1.5 rounded text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title={t("deleteSkill")}
            >
              <Trash2 size={13} />
            </button>
            {saved && (
              <span className="text-xs text-green-400">
                {tc("saved")}
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
  const { t } = useTranslation("settings");
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
          placeholder={t("skillNamePlaceholder")}
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
        placeholder={t("skillInstructions")}
      />
    </form>
  );
}

// -----------------------------------------------------------------
// Skills section
// -----------------------------------------------------------------

function SkillsSection() {
  const { t } = useTranslation("settings");
  const { data: skills = [] } = useAdvisorSkills();
  const [adding, setAdding] = useState(false);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600">
          {t("skills")}
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto p-1 rounded text-stone-500 hover:text-cta hover:bg-cta-muted transition-colors"
          title={t("addSkill")}
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <p className="text-[10px] text-stone-400">
            {t("skillsHint")}
          </p>
        </div>
        {skills.length === 0 && !adding && (
          <p className="px-4 py-3 text-xs text-stone-500">
            {t("noSkillsDefined")}
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
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { data: aiSettings, isLoading } =
    useAiSettings();
  const { data: models = [] } = useAvailableModels();
  const { data: cloudStatus } = useCloudSyncStatus();
  const { data: probe } = useAiProbe();
  const update = useUpdateAiSettings();
  const cloudAi = cloudStatus?.use_cloud_ai;

  const [form, setForm] = useState<AiSettings>({
    ollama_url: "",
    ollama_cloud_url: "",
    ollama_api_key: "",
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
            {t("kaishoAiActive")}
          </p>
          <p className="text-[10px] text-stone-500 mt-1">
            {t("kaishoAiActiveHint")}
          </p>
        </div>
      )}

      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {/* Local / subscription providers */}
        <div className="px-4 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              {t("local")}
            </p>
            {probe && (
              <div className="flex items-center gap-1.5">
                <span
                  className={[
                    "w-1.5 h-1.5 rounded-full",
                    probe.ollama
                      ? "bg-green-400"
                      : "bg-stone-300",
                  ].join(" ")}
                  title={
                    probe.ollama
                      ? t("ollamaReachable")
                      : t("ollamaNotRunning")
                  }
                />
                <span className="text-[9px] text-stone-400">
                  {t("ollamaLabel")}
                </span>
                <span
                  className={[
                    "w-1.5 h-1.5 rounded-full ml-1",
                    probe.lm_studio
                      ? "bg-green-400"
                      : "bg-stone-300",
                  ].join(" ")}
                  title={
                    probe.lm_studio
                      ? t("lmStudioReachable")
                      : t("lmStudioNotRunning")
                  }
                />
                <span className="text-[9px] text-stone-400">
                  LM Studio
                </span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-stone-400 mb-2">
            {t("localHint")} Recommended model:{" "}
            <strong>gemma4</strong> (Google) — use{" "}
            <em>gemma4:e2b</em> for cron jobs and{" "}
            <em>gemma4:latest</em> for the advisor.
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                {t("ollamaLabel")}
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
                {t("lmStudioUrl")}
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
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              {t("cloudApiKeys")}
            </p>
            {probe && (
              <div className="flex items-center gap-1.5">
                {[
                  ["ollama_cloud", "Ollama Cloud"],
                  ["claude", "Claude"],
                  ["openrouter", "OpenRouter"],
                  ["openai", "OpenAI"],
                ].map(([key, label]) => (
                  <span
                    key={key}
                    className="flex items-center gap-0.5 ml-1"
                  >
                    <span
                      className={[
                        "w-1.5 h-1.5 rounded-full",
                        probe[key]
                          ? "bg-green-400"
                          : "bg-stone-300",
                      ].join(" ")}
                      title={
                        probe[key]
                          ? `${label} key set`
                          : `${label} not configured`
                      }
                    />
                    <span className="text-[9px] text-stone-400">
                      {label}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10px] text-stone-400 mb-2">
            {t("cloudApiKeysHint")}
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                {t("ollamaCloudUrl")}
              </span>
              <input
                type="text"
                value={form.ollama_cloud_url}
                onChange={(e) =>
                  set(
                    "ollama_cloud_url",
                    e.target.value,
                  )
                }
                placeholder="https://ollama.com"
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                {t("ollamaCloudKey")}
              </span>
              <input
                type="password"
                value={form.ollama_api_key}
                onChange={(e) =>
                  set(
                    "ollama_api_key",
                    e.target.value,
                  )
                }
                placeholder={t(
                  "ollamaCloudKeyPlaceholder",
                )}
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                {t("claudeApiKey")}
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
                {t("openrouterUrl")}
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
                {t("openrouterKey")}
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
                {t("openaiUrl")}
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
                {t("openaiKey")}
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
            {t("webSearch")}
          </p>
          <p className="text-[10px] text-stone-400 mb-2">
            {t("webSearchHint")}
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                {t("braveApiKey")}
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
                {t("tavilyApiKey")}
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
            {t("defaultModels")}
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3">
              <span className="text-xs text-stone-700 w-32 shrink-0">
                {t("advisorModel")}
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
                {t("cronModel")}
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
              {t("modelsAvailable", {
                count: models.length,
              })}
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
          {update.isPending ? tc("saving") : tc("save")}
        </button>
        {saved && (
          <span className="text-xs text-green-400">
            {tc("saved")}
          </span>
        )}
        {update.isError && (
          <span className="text-xs text-red-400">
            {tc("saveFailed")}
          </span>
        )}
      </div>

      <AdvisorPersonalitySection />
      <SkillsSection />
      <UrlAllowlistSection />
    </section>
  );
}
