import { useSettings } from "../../hooks/useSettings";

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
                <p className="text-sm text-slate-600">No tags defined.</p>
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
  );
}
