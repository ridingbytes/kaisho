import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Plus } from "lucide-react";
import {
  usePaths,
  useUpdatePaths,
  useSwitchBackend,
  useKbSources,
  useUpdateKbSources,
} from "../../hooks/useSettings";
import {
  fieldCls,
  inputCls,
  saveBtnCls,
} from "./styles";

// -----------------------------------------------------------------
// Import data
// -----------------------------------------------------------------

function ImportDataSection() {
  const [format, setFormat] = useState("org");
  const [path, setPath] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<
    Record<string, number> | null
  >(null);
  const [error, setError] = useState("");
  const qc = useQueryClient();

  async function handleImport() {
    if (!path.trim()) return;
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const { importData } = await import(
        "../../api/client"
      );
      const res = await importData(format, path);
      setResult(res.summary);
      void qc.invalidateQueries();
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-600 mb-3">
        Import Data
      </h2>
      <p className="text-[11px] text-stone-500 mb-3">
        Import data from another backend into the current
        profile. Import is additive -- clear existing
        data files first to avoid duplicates.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-stone-500">
            Format
          </label>
          <select
            value={format}
            onChange={(e) =>
              setFormat(e.target.value)
            }
            className="px-2 h-[30px] rounded-lg text-xs bg-surface-card border border-border text-stone-800"
          >
            <option value="org">Org-mode</option>
            <option value="markdown">Markdown</option>
          </select>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[10px] font-medium text-stone-500">
            Source directory
          </label>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/path/to/data"
            className="px-2 h-[30px] rounded-lg text-xs bg-surface-card border border-border text-stone-800 placeholder-stone-400"
          />
        </div>
        <button
          onClick={handleImport}
          disabled={importing || !path.trim()}
          className={saveBtnCls}
        >
          {importing ? "Importing..." : "Import"}
        </button>
      </div>
      {result && (
        <div className="mt-2 text-[11px] text-green-600">
          Imported:{" "}
          {Object.entries(result)
            .map(([k, v]) => `${v} ${k}`)
            .join(", ")}
        </div>
      )}
      {error && (
        <div className="mt-2 text-[11px] text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------
// Main export
// -----------------------------------------------------------------

export function PathsSection(): JSX.Element {
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

  if (!paths) return <></>;

  function handleSavePaths() {
    update.mutate(
      {
        org_dir: orgDir,
        markdown_dir: mdDir,
      },
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
    setSources((prev) => [
      ...prev,
      { label: "", path: "" },
    ]);
  }

  function removeSource(idx: number) {
    setSources((prev) =>
      prev.filter((_, i) => i !== idx),
    );
  }

  function updateSource(
    idx: number,
    field: "label" | "path",
    value: string,
  ) {
    setSources((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, [field]: value } : s,
      ),
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
              onChange={(e) =>
                setBackend(e.target.value)
              }
              className={[
                fieldCls,
                "flex-1 h-[34px]",
              ].join(" ")}
            >
              <option value="org">
                Org-mode (*.org files)
              </option>
              <option value="markdown">
                Markdown (*.md files)
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
              {switchBe.isPending
                ? "Switching..."
                : "Switch"}
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
              onChange={(e) =>
                setOrgDir(e.target.value)
              }
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
              onChange={(e) =>
                setMdDir(e.target.value)
              }
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
            {update.isPending
              ? "Saving..."
              : "Save Paths"}
          </button>
          {saved && (
            <span className="text-xs text-green-400">
              Saved.
            </span>
          )}
        </div>
      </div>

      {/* Import data */}
      <ImportDataSection />

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
                  updateSource(
                    idx,
                    "label",
                    e.target.value,
                  )
                }
                placeholder="Label"
                className={[
                  inputCls,
                  "w-28 shrink-0 !flex-none",
                ].join(" ")}
              />
              <input
                type="text"
                value={src.path}
                onChange={(e) =>
                  updateSource(
                    idx,
                    "path",
                    e.target.value,
                  )
                }
                placeholder="~/path/to/folder"
                className={inputCls}
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
            {updateKb.isPending
              ? "Saving..."
              : "Save KB Sources"}
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
          Backend and data directories are stored per
          profile. DATA_DIR, HOST, PORT are global
          (.env).
        </p>
      </div>
    </section>
  );
}
