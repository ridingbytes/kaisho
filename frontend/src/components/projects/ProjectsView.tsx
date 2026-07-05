import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderKanban, Plus } from "lucide-react";
import { PanelToolbar } from "../common/PanelToolbar";
import { StateMessage } from "../common/StateMessage";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { HelpButton } from "../common/HelpButton";
import { DOCS } from "../../docs/panelDocs";
import { ProjectCard } from "./ProjectCard";
import { ProjectWorkspace } from "./ProjectWorkspace";
import {
  useCreateProject,
  useProjects,
} from "../../hooks/useProjects";
import { usePendingSearch } from "../../context/ViewContext";
import { useToast } from "../../context/ToastContext";
import { inputCls } from "../settings/styles";

/** Projects view: a grid of project cards, a create form,
 * and the per-project workspace. */
export function ProjectsView() {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation("common");
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: projects = [], isLoading } = useProjects(
    includeArchived,
  );
  const create = useCreateProject();
  const toast = useToast();
  const { pendingSearch, clearPendingSearch } =
    usePendingSearch();

  const [selectedId, setSelectedId] = useState<string | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");

  // Deep-link: setView("projects", id) focuses a project.
  useEffect(() => {
    if (pendingSearch) {
      setSelectedId(pendingSearch);
      clearPendingSearch();
    }
  }, [pendingSearch, clearPendingSearch]);

  if (selectedId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-5 pb-20">
          <ProjectWorkspace
            projectId={selectedId}
            onBack={() => setSelectedId(null)}
          />
        </div>
      </div>
    );
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        customer: customer.trim() || null,
      },
      {
        onSuccess: (proj) => {
          toast(t("created"), "success");
          setName("");
          setCustomer("");
          setCreating(false);
          setSelectedId(proj.id);
        },
        onError: (err) =>
          toast((err as Error).message, "error"),
      },
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PanelToolbar
        right={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) =>
                  setIncludeArchived(e.target.checked)
                }
                className="rounded border-border text-cta"
              />
              {t("showArchived")}
            </label>
            <button
              onClick={() => setCreating((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-cta text-white hover:bg-cta-hover"
            >
              <Plus size={14} /> {t("newProject")}
            </button>
            <HelpButton
              title={t("title")}
              doc={DOCS.projects}
            />
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-5 pb-20">
        <div className="max-w-5xl mx-auto space-y-4">
          {creating && (
            <form
              onSubmit={handleCreate}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-card p-3"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className={`${inputCls} flex-1 min-w-[200px]`}
              />
              <div className="w-56">
                <CustomerAutocomplete
                  value={customer}
                  onChange={setCustomer}
                  inputClassName={inputCls}
                />
              </div>
              <button
                type="submit"
                disabled={!name.trim() || create.isPending}
                className="px-3 py-1.5 rounded text-sm bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
              >
                {tc("create")}
              </button>
            </form>
          )}

          {isLoading ? (
            <StateMessage kind="loading">
              {t("loading")}
            </StateMessage>
          ) : projects.length === 0 ? (
            <StateMessage
              kind="empty"
              icon={<FolderKanban size={28} />}
              description={t("emptyHint")}
            >
              {t("empty")}
            </StateMessage>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onOpen={setSelectedId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
