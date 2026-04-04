import { useEffect, useState } from "react";
import {
  useAiSettings,
  useAvailableModels,
  useSettings,
  useUpdateAiSettings,
} from "../../hooks/useSettings";
import type { AiSettings } from "../../types";

const DATALIST_ID = "ai-model-list";

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
      <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-3">
        AI
      </h2>

      {/* Shared datalist for all model inputs */}
      <datalist id={DATALIST_ID}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        {/* Endpoints */}
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
                className={[
                  "flex-1 px-3 py-1.5 rounded-lg text-sm font-mono",
                  "bg-surface-raised border border-border text-slate-200",
                  "placeholder-slate-600 focus:outline-none",
                  "focus:border-border-strong",
                ].join(" ")}
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
                placeholder="http://localhost:1234"
                className={[
                  "flex-1 px-3 py-1.5 rounded-lg text-sm font-mono",
                  "bg-surface-raised border border-border text-slate-200",
                  "placeholder-slate-600 focus:outline-none",
                  "focus:border-border-strong",
                ].join(" ")}
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
                className={[
                  "flex-1 px-3 py-1.5 rounded-lg text-sm font-mono",
                  "bg-surface-raised border border-border text-slate-200",
                  "placeholder-slate-600 focus:outline-none",
                  "focus:border-border-strong",
                ].join(" ")}
              />
            </label>
          </div>
        </div>

        {/* Model defaults */}
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
          className={[
            "px-4 py-1.5 rounded-lg text-sm",
            "bg-accent text-white hover:bg-accent-hover",
            "transition-colors disabled:opacity-50",
          ].join(" ")}
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

export function SettingsView() {
  const { data: settings, isLoading } = useSettings();

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Settings
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-10 max-w-3xl">
          <AiSection />

          {isLoading && (
            <p className="text-sm text-slate-600">Loading…</p>
          )}
          {settings && (
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

              {/* Tags */}
              <section className="flex-1">
                <div className="flex items-baseline gap-3 mb-3">
                  <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500">
                    Tags
                  </h2>
                  <span className="text-xs text-slate-700">
                    Edit via oc tag
                  </span>
                </div>
                {settings.tags.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No tags defined.
                  </p>
                ) : (
                  <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
                    {settings.tags.map((tag, i) => (
                      <div
                        key={tag.name}
                        className={[
                          "flex items-center gap-3 px-4 py-2.5",
                          i < settings.tags.length - 1
                            ? "border-b border-border-subtle"
                            : "",
                        ].join(" ")}
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm text-slate-200 w-32">
                          {tag.name}
                        </span>
                        <span className="text-xs text-slate-500 flex-1">
                          {tag.description}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
