import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderKanban, Plus } from "lucide-react";
import { PanelToolbar } from "../common/PanelToolbar";
import { StateMessage } from "../common/StateMessage";
import { CustomerAutocomplete } from "../common/CustomerAutocomplete";
import { HelpButton } from "../common/HelpButton";
import { OpenInEditorButton } from "../common/OpenInEditorButton";
import { DOCS } from "../../docs/panelDocs";
import { ProjectsBoard } from "./ProjectsBoard";
import { ProjectWorkspace } from "./ProjectWorkspace";
import {
  useCreateProject,
  useProjects,
} from "../../hooks/useProjects";
import { usePendingSearch } from "../../context/ViewContext";
import { useToast } from "../../context/ToastContext";
import { inputCls } from "../settings/styles";

/** Projects view: a status board of projects, a create
 * form, and the per-project workspace. */
export function ProjectsView() {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation("common");
  // Include every status so all board columns populate
  // (Archived is a column now, not a hidden filter).
  const { data: projects = [], isLoading } = useProjects(
    true,
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
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const visible = q
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.customer ?? "").toLowerCase().includes(q) ||
          (p.tags ?? []).some((tag) =>
            tag.toLowerCase().includes(q),
          ),
      )
    : projects;

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
        left={
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchProjects")}
            className={`${inputCls} w-64 max-w-full`}
          />
        }
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreating((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-cta text-white hover:bg-cta-hover"
            >
              <Plus size={14} /> {t("newProject")}
            </button>
            <OpenInEditorButton kind="projects" />
            <HelpButton
              title={t("title")}
              doc={DOCS.projects}
            />
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-5 pb-20">
        <div className="space-y-4">
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
            <ProjectsBoard
              projects={visible}
              onOpen={setSelectedId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
