import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import {
  usePaths,
  useUpdatePaths,
  useSwitchBackend,
  useKbSources,
  useUpdateKbSources,
} from "../../hooks/useSettings";
import { inputCls } from "./styles";
import { Button } from "../common/Button";

// -----------------------------------------------------------------
// Import data
// -----------------------------------------------------------------

function ImportDataSection() {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
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
      <h2 className="text-xs font-semibold tracking-wider uppercase text-fg-muted mb-3">
        {t("importData")}
      </h2>
      <p className="text-xs text-fg-muted mb-3">
        {t("importDataHint")}
      </p>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-2xs font-medium text-fg-muted">
            {t("format")}
          </label>
          <select
            value={format}
            onChange={(e) =>
              setFormat(e.target.value)
            }
            className={inputCls}
          >
            <option value="org">
              {t("orgMode")}
            </option>
            <option value="markdown">
              {t("markdown")}
            </option>
          </select>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-2xs font-medium text-fg-muted">
            {t("sourceDirectory")}
          </label>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/path/to/data"
            className={inputCls + " w-full"}
          />
        </div>
        <Button
          onClick={handleImport}
          disabled={importing || !path.trim()}
        >
          {importing ? tc("importing") : tc("import")}
        </Button>
      </div>
      {result && (
        <div className="mt-2 text-xs text-green-600">
          {t("imported")}:{" "}
          {Object.entries(result)
            .map(([k, v]) => `${v} ${k}`)
            .join(", ")}
        </div>
      )}
      {error && (
        <div className="mt-2 text-xs text-red-500">
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
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const { data: paths } = usePaths();
  const update = useUpdatePaths();
  const switchBe = useSwitchBackend();
  const { data: kbSources = [] } = useKbSources();
  const updateKb = useUpdateKbSources();
  const [orgDir, setOrgDir] = useState("");
  const [mdDir, setMdDir] = useState("");
  const [sqlDsn, setSqlDsn] = useState("");
  const [backend, setBackend] = useState("org");
  const [sources, setSources] = useState<
    { label: string; path: string }[]
  >([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (paths) {
      setOrgDir(paths.org_dir ?? "");
      setMdDir(paths.markdown_dir ?? "");
      // The backend GET returns a synthesised
      // sqlite:///<profile>/kaisho.db when sql_dsn is
      // unset. Treat that as "default" by leaving the
      // field blank, so saving an unmodified form does not
      // pin the per-profile fallback into settings.yaml.
      const dsn = paths.sql_dsn ?? "";
      setSqlDsn(
        dsn.startsWith("sqlite:///") ? "" : dsn,
      );
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
        sql_dsn: sqlDsn,
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

  function moveSource(idx: number, delta: -1 | 1) {
    setSources((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  return (
    <section className="space-y-8">
      {/* Backend selector */}
      <div>
        <h2 className="text-xs font-semibold tracking-wider uppercase text-fg-muted mb-3">
          {t("storageBackend")}
        </h2>
        <div className="bg-surface-card rounded-lg border border-border overflow-hidden mb-3">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-xs text-fg w-32 shrink-0">
              {t("backend")}
            </span>
            <select
              value={backend}
              onChange={(e) =>
                setBackend(e.target.value)
              }
              className={inputCls + " flex-1"}
            >
              <option value="org">
                {t("orgMode")}
              </option>
              <option value="markdown">
                {t("markdown")}
              </option>
              <option value="json">
                {t("json")}
              </option>
              <option value="sql">
                {t("sql")}
              </option>
            </select>
            <Button
              onClick={handleSwitchBackend}
              disabled={
                switchBe.isPending ||
                backend === paths?.backend
              }
            >
              {switchBe.isPending
                ? "Switching..."
                : tc("switch")}
            </Button>
          </div>
        </div>
        <p className="text-2xs text-fg-subtle mb-6">
          {t("dataNotMigrated")}
        </p>
      </div>

      {/* Data directories */}
      <div>
        <h2 className="text-xs font-semibold tracking-wider uppercase text-fg-muted mb-3">
          {t("dataDirectories")}
        </h2>
        <div className="bg-surface-card rounded-lg border border-border overflow-hidden mb-4">
          <label className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle">
            <span className="text-xs text-fg w-32 shrink-0">
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
            <span className="text-xs text-fg w-32 shrink-0">
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
          {backend === "sql" && (
            <label className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle">
              <span className="text-xs text-fg w-32 shrink-0">
                SQL_DSN
              </span>
              <input
                type="text"
                value={sqlDsn}
                onChange={(e) =>
                  setSqlDsn(e.target.value)
                }
                className={inputCls}
                placeholder="postgresql+psycopg://user:pass@host/db"
                title={t("sqlDsnHint")}
              />
            </label>
          )}
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-xs text-fg w-32 shrink-0">
              DATA_DIR
            </span>
            <span className="text-xs font-mono text-fg-muted truncate flex-1">
              {paths?.data_dir ?? "data"}
            </span>
            <span className="text-2xs text-fg-subtle">
              {t("globalSetViaEnv")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSavePaths}
            disabled={update.isPending}
          >
            {update.isPending
              ? tc("saving")
              : t("savePaths")}
          </Button>
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
        <h2 className="text-xs font-semibold tracking-wider uppercase text-fg-muted mb-3">
          {t("knowledgeBaseSources")}
        </h2>
        <div className="bg-surface-card rounded-lg border border-border overflow-hidden mb-3">
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
                placeholder={t("label")}
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
              <div className="flex items-center shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  icon={<ArrowUp size={14} />}
                  onClick={() => moveSource(idx, -1)}
                  disabled={idx === 0}
                  title={t("moveUp")}
                >
                  {t("moveUp")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  icon={<ArrowDown size={14} />}
                  onClick={() => moveSource(idx, 1)}
                  disabled={idx === sources.length - 1}
                  title={t("moveDown")}
                >
                  {t("moveDown")}
                </Button>
              </div>
              <Button
                variant="danger"
                size="sm"
                iconOnly
                icon={<X size={14} />}
                onClick={() => removeSource(idx)}
                title={tc("remove")}
              >
                {tc("remove")}
              </Button>
            </div>
          ))}
          {sources.length === 0 && (
            <p className="px-4 py-3 text-xs text-fg-muted">
              {t("noKbSources")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={addSource}
            icon={<Plus size={12} />}
          >
            {t("addSource")}
          </Button>
          <Button
            onClick={handleSaveKb}
            disabled={updateKb.isPending}
          >
            {updateKb.isPending
              ? tc("saving")
              : t("saveKbSources")}
          </Button>
        </div>
      </div>

      {/* Read-only info */}
      <div>
        <h2 className="text-xs font-semibold tracking-wider uppercase text-fg-muted mb-3">
          {t("info")}
        </h2>
        <div className="bg-surface-card rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-xs text-fg-muted w-32 shrink-0">
              {t("settingsFile")}
            </span>
            <span className="text-xs font-mono text-fg truncate flex-1">
              {paths?.settings_file}
            </span>
          </div>
        </div>
        <p className="mt-2 text-2xs text-fg-subtle">
          {t("pathsHint")}
        </p>
      </div>
    </section>
  );
}
