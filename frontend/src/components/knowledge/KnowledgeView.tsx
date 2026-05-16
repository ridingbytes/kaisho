/**
 * @module KnowledgeView
 *
 * Top-level entry point for the Knowledge panel. Composes
 * the sidebar file tree, the editor panel, the new-file
 * form, and the read-only Markdown viewer. Owns all shared
 * state (selection, search, sidebar geometry) and delegates
 * rendering to focused sub-components.
 */

import {
  Clock, Eye, EyeOff, FilePlus, Filter,
  Pencil, Sparkles, Star, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  profileGet,
  profileRemove,
  profileSet,
} from "../../utils/profileStorage";
import { useTranslation } from "react-i18next";
import {
  useCreateKnowledgeFolder,
  useDeleteKnowledgeFile,
  useKnowledgeDistinctValues,
  useKnowledgeFile,
  useKnowledgeSearch,
  useKnowledgeTags,
  useKnowledgeTree,
  useMoveKnowledgeFile,
  useRenameKnowledgeFile,
} from "../../hooks/useKnowledge";
import { useCustomers } from "../../hooks/useCustomers";
import { useTasks } from "../../hooks/useTasks";
import { HelpButton } from "../common/HelpButton";
import { PanelToolbar } from "../common/PanelToolbar";
import { Markdown } from "../common/Markdown";
import { DOCS } from "../../docs/panelDocs";
import { CodeViewer } from "./CodeViewer";
import { EditorPanel } from "./EditorPanel";
import { MetadataCard } from "./MetadataCard";
import {
  detectCodeLanguage,
  detectFileType,
} from "./knowledgeEditorUtils";
import { stripFrontmatter } from "./markdownBody";
import { KnowledgeSidebar } from "./KnowledgeSidebar";
import { TokenFilterInput } from "../common/TokenFilterInput";
import { NewFileForm } from "./NewFileForm";
import { CopyKbFilePathButton } from "./CopyKbFilePathButton";
import { OpenKbFileInEditorButton } from "./OpenKbFileInEditorButton";
import { SummaryPopover } from "./SummaryPopover";
import {
  filterTree,
  filterVisibleFiles,
} from "./visibility";
import {
  chipToRaw,
  parseFilter,
  splitChipsAndFree,
} from "./filterTokens";
import {
  readCollapsedLabels,
  readStoredOpen,
  readStoredWidth,
  storeCollapsedLabels,
  storeOpen,
  storeWidth,
} from "./knowledgeEditorUtils";
import {
  buildTree,
  expandMatchingFolders,
  preserveExpanded,
  toggleFolder,
} from "./knowledgeTree";
import type { TreeNode } from "./knowledgeTree";
import type { KnowledgeFile } from "../../types";

/**
 * Main Knowledge view composing sidebar, editor, and
 * file viewer into a full-height layout.
 */
/** Read the new ``kaisho_kb_filter_query`` value, falling
 *  back to a one-time migration from the legacy
 *  ``kaisho_kb_tag_filters`` Set. Removes the legacy key
 *  once read, plus orphan ``kaisho_kb_group_search``. */
function migrateLegacyFilter(): string {
  const fresh = profileGet("kaisho_kb_filter_query");
  if (fresh !== null) return fresh;
  const legacy = profileGet("kaisho_kb_tag_filters");
  const orphan = profileGet("kaisho_kb_group_search");
  if (orphan !== null) {
    profileRemove("kaisho_kb_group_search");
  }
  if (!legacy) return "";
  profileRemove("kaisho_kb_tag_filters");
  try {
    const tags = JSON.parse(legacy) as string[];
    const chips = tags.map((t) => {
      const needsQuote = /\s/.test(t);
      const v = needsQuote ? `"${t}"` : t;
      return `tag:${v}`;
    });
    return chips.length ? chips.join(" ") + " " : "";
  } catch {
    return "";
  }
}

export function KnowledgeView() {
  const { t } = useTranslation("knowledge");
  const { t: tc } = useTranslation("common");
  const [selectedPath, setSelectedPath] =
    useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] =
    useState<string>("knowledge");
  // Unified filter: scoped chips narrow the tree, the
  // trailing free text drives the content-search backend.
  const FILTER_QUERY_KEY = "kaisho_kb_filter_query";
  const [filterValue, setFilterValue] = useState<string>(
    () => migrateLegacyFilter(),
  );
  useEffect(() => {
    if (filterValue) {
      profileSet(FILTER_QUERY_KEY, filterValue);
    } else {
      profileSet(FILTER_QUERY_KEY, "");
    }
  }, [filterValue]);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showStarredOnly, setShowStarredOnly] =
    useState(false);
  const [showRecentOnly, setShowRecentOnly] =
    useState(false);
  // Hidden-files toggle (off by default; persisted).
  const SHOW_HIDDEN_KEY = "kaisho_kb_show_hidden";
  const [showHidden, setShowHidden] = useState<boolean>(
    () => profileGet(SHOW_HIDDEN_KEY) === "true",
  );
  useEffect(() => {
    profileSet(
      SHOW_HIDDEN_KEY,
      showHidden ? "true" : "false",
    );
  }, [showHidden]);

  function toggleTagFilter(tag: string) {
    const { chips, free } = splitChipsAndFree(filterValue);
    const hasIt = chips.some(
      (c) => c.key === "tag" && c.value === tag,
    );
    const nextChips = hasIt
      ? chips.filter(
          (c) => !(c.key === "tag" && c.value === tag),
        )
      : [...chips, { key: "tag" as const, value: tag }];
    const head = nextChips.map(chipToRaw).join(" ");
    setFilterValue(
      head + (head ? " " : "") + free,
    );
  }

  // Summary popover visibility -- the popover takes
  // over the screen but does not navigate away from
  // the open file.
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Starred files (localStorage)
  const STARS_KEY = "kaisho_kb_stars";
  const [starred, setStarred] = useState<Set<string>>(
    () => {
      const raw = profileGet(STARS_KEY);
      return raw
        ? new Set(JSON.parse(raw) as string[])
        : new Set();
    },
  );

  function toggleStar(path: string) {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      profileSet(
        STARS_KEY,
        JSON.stringify([...next]),
      );
      return next;
    });
  }

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] =
    useState<boolean>(readStoredOpen);
  const [sidebarWidth, setSidebarWidth] =
    useState<number>(readStoredWidth);

  // Tree state: per-label node lists with expanded flags
  const [treeNodes, setTreeNodes] = useState<
    Record<string, TreeNode[]>
  >({});

  // Collapsible root labels
  const [collapsedLabels, setCollapsedLabels] =
    useState<Set<string>>(readCollapsedLabels);

  // Free-text portion drives the content-search query.
  const parsedFilter = useMemo(
    () => parseFilter(filterValue),
    [filterValue],
  );
  // Currently-active tag chips (rendered as "highlighted"
  // on file/metadata tag pills so a click toggles them).
  const activeTagFilters = useMemo(
    () => new Set(parsedFilter.tags),
    [parsedFilter.tags],
  );
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQ(parsedFilter.free), 300,
    );
    return () => clearTimeout(timer);
  }, [parsedFilter.free]);

  const { data: tree = [], isLoading: treeLoading } =
    useKnowledgeTree();
  const { data: kbTags = [] } = useKnowledgeTags();
  const { data: distinct } = useKnowledgeDistinctValues();
  const { data: customers = [] } = useCustomers(true);
  const { data: tasks = [] } = useTasks(true);
  const filenamePool = useMemo(() => {
    const set = new Set<string>();
    for (const f of tree) {
      if (f.kind === "file") set.add(f.name);
    }
    return [...set].sort();
  }, [tree]);
  const suggestions = useMemo(
    () => ({
      customers: customers.map((c) => c.name),
      tasks: tasks.map(
        (t) => ({ id: t.id, title: t.title }),
      ),
      types: distinct?.type ?? [],
      tags: kbTags,
      filenames: filenamePool,
    }),
    [customers, tasks, distinct, kbTags, filenamePool],
  );
  const isPdf = selectedPath?.endsWith(".pdf");
  const { data: fileData, isLoading: fileLoading } =
    useKnowledgeFile(isPdf ? null : selectedPath);

  // Visibility pipeline: hidden filter -> filename filter
  // -> content search (scoped to the filtered subset).
  const visibleTree = useMemo(
    () => filterVisibleFiles(tree, showHidden),
    [tree, showHidden],
  );
  // Chip-driven narrowing. Free text is excluded so it
  // can drive the backend content search instead.
  const chipsOnlyQuery = useMemo(() => {
    const { chips } = splitChipsAndFree(filterValue);
    return chips.map(chipToRaw).join(" ");
  }, [filterValue]);
  const filteredTree = useMemo(
    () => filterTree(
      visibleTree, chipsOnlyQuery, new Set(),
    ),
    [visibleTree, chipsOnlyQuery],
  );
  const filteredPaths = useMemo(
    () => filteredTree
      .filter((f) => f.kind === "file")
      .map((f) => f.path),
    [filteredTree],
  );

  // Top-N flat list ordered by mtime desc — drives the
  // "Recent" sidebar view. Built from the filtered tree
  // so active filters/tags continue to apply.
  const RECENT_LIMIT = 30;
  const recentFiles = useMemo(
    () => filteredTree
      .filter((f) => f.kind === "file")
      .slice()
      .sort(
        (a, b) => (b.mtime ?? 0) - (a.mtime ?? 0),
      )
      .slice(0, RECENT_LIMIT),
    [filteredTree],
  );

  const {
    data: searchResults = [],
    isLoading: searchLoading,
  } = useKnowledgeSearch(debouncedQ, filteredPaths);

  const isSearching = debouncedQ.length > 1;

  // Rebuild tree when files change. The tree is built off
  // the post-filter ``filteredTree`` so the sidebar reacts
  // live to hidden + filename filters.
  useEffect(() => {
    setTreeNodes((prev) => {
      const fresh = buildTree(filteredTree);
      const merged: Record<string, TreeNode[]> = {};
      for (const label of Object.keys(fresh)) {
        merged[label] = preserveExpanded(
          fresh[label], prev[label] ?? [],
        );
      }
      return merged;
    });
  }, [filteredTree]);

  // Auto-expand folders containing search results
  useEffect(() => {
    if (!isSearching || searchResults.length === 0) {
      return;
    }
    const matchingPaths = new Set(
      searchResults.map((r) => r.path)
    );
    setTreeNodes((prev) => {
      const next: Record<string, TreeNode[]> = {};
      for (const label of Object.keys(prev)) {
        next[label] = expandMatchingFolders(
          prev[label], matchingPaths
        );
      }
      return next;
    });
  }, [isSearching, searchResults]);

  // Persist sidebar state
  useEffect(() => {
    storeOpen(sidebarOpen);
  }, [sidebarOpen]);

  useEffect(() => {
    storeWidth(sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    storeCollapsedLabels(collapsedLabels);
  }, [collapsedLabels]);

  // ---------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------

  function selectFile(path: string, label: string) {
    setSelectedPath(path);
    setSelectedLabel(label);
    setEditing(false);
  }

  function handleCreated(file: KnowledgeFile) {
    setSelectedPath(file.path);
    setSelectedLabel(file.label);
    setEditing(true);
    setCreating(false);
  }

  function handleDeleted() {
    setSelectedPath(null);
    setEditing(false);
  }

  function handleToggleLabel(label: string) {
    setCollapsedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function handleToggleFolder(path: string) {
    setTreeNodes((prev) => {
      const next: Record<string, TreeNode[]> = {};
      for (const label of Object.keys(prev)) {
        next[label] = toggleFolder(prev[label], path);
      }
      return next;
    });
  }

  const renameFile = useRenameKnowledgeFile();
  const moveFile = useMoveKnowledgeFile();

  function handleRename(
    oldPath: string, newPath: string
  ) {
    if (oldPath === newPath) return;
    renameFile.mutate(
      { oldPath, newPath },
      {
        onSuccess: (f) => {
          if (selectedPath === oldPath) {
            setSelectedPath(f.path);
          }
        },
      }
    );
  }

  function handleMove(
    oldPath: string,
    oldLabel: string,
    newLabel: string
  ) {
    moveFile.mutate(
      { oldPath, oldLabel, newLabel },
      {
        onSuccess: (f) => {
          if (selectedPath === oldPath) {
            setSelectedPath(f.path);
            setSelectedLabel(f.label);
          }
        },
      }
    );
  }

  const deleteFile = useDeleteKnowledgeFile();
  const createFolder = useCreateKnowledgeFolder();

  function handleDeleteFile(path: string) {
    deleteFile.mutate(path, {
      onSuccess: () => {
        if (selectedPath === path) {
          setSelectedPath(null);
          setEditing(false);
        }
      },
    });
  }

  function handleCreateFolder(
    label: string, path: string,
  ) {
    createFolder.mutate({ label, path });
  }

  const showEditor =
    editing && fileData && selectedPath && !fileLoading;

  // ``buildTree`` already returns labels in the order they
  // appear in the backend tree response, which matches the
  // user-defined ``kb_sources`` order in settings. Don't
  // re-sort here.
  const labels = Object.keys(treeNodes);

  // ---------------------------------------------------------------
  // Resolve the KnowledgeFile object for the editor
  // ---------------------------------------------------------------

  function resolveEditorFile(): KnowledgeFile {
    const found = tree.find(
      (f) => f.path === selectedPath
    );
    if (found) return found;
    return {
      path: selectedPath!,
      label: selectedLabel,
      name:
        selectedPath!
          .split("/")
          .pop()
          ?.replace(/\.md$/, "") ?? "",
      size: 0,
    };
  }

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {selectedPath && (
        <SummaryPopover
          path={selectedPath}
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
        />
      )}
      {/* Toolbar */}
      <PanelToolbar
        left={!editing ? (<>
          <div
            className={[
              "flex items-center gap-1 px-2 h-7",
              "rounded border border-border",
              "bg-surface-raised",
              "w-72 max-w-full",
            ].join(" ")}
          >
            <Filter
              size={11}
              className="text-stone-400 shrink-0"
            />
            <TokenFilterInput
              value={filterValue}
              onChange={setFilterValue}
              suggestions={suggestions}
              placeholder={t("filterPlaceholder")}
              className="flex-1 min-w-0"
            />
            {filterValue && (
              <button
                onClick={() => setFilterValue("")}
                className={[
                  "p-0.5 rounded text-stone-400",
                  "hover:text-stone-900 transition-colors",
                ].join(" ")}
                title={tc("clear")}
                aria-label={tc("clear")}
              >
                <X size={11} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowHidden((v) => !v)}
            aria-pressed={showHidden}
            aria-label={
              showHidden
                ? t("hideHidden")
                : t("showHidden")
            }
            className={[
              "p-1.5 rounded transition-colors",
              showHidden
                ? "text-cta bg-cta-muted"
                : "text-stone-400 hover:text-cta",
            ].join(" ")}
            title={
              showHidden
                ? t("hideHidden")
                : t("showHidden")
            }
          >
            {showHidden
              ? <Eye size={13} />
              : <EyeOff size={13} />}
          </button>
          <button
            onClick={() => {
              setShowStarredOnly((v) => !v);
              setShowRecentOnly(false);
            }}
            className={[
              "p-1.5 rounded transition-colors",
              showStarredOnly
                ? "text-amber-400 bg-amber-400/10"
                : "text-stone-400 hover:text-amber-400",
            ].join(" ")}
            title={t("starredFilter")}
          >
            <Star
              size={13}
              fill={
                showStarredOnly
                  ? "currentColor"
                  : "none"
              }
            />
          </button>
          <button
            onClick={() => {
              setShowRecentOnly((v) => !v);
              setShowStarredOnly(false);
            }}
            aria-pressed={showRecentOnly}
            className={[
              "p-1.5 rounded transition-colors",
              showRecentOnly
                ? "text-cta bg-cta-muted"
                : "text-stone-400 hover:text-cta",
            ].join(" ")}
            title={t("recentFilter")}
            aria-label={t("recentFilter")}
          >
            <Clock size={13} />
          </button>
        </>) : undefined}
        right={<>
          {!editing && (
            <button
              onClick={() => setCreating((v) => !v)}
              className={[
                "flex items-center gap-1 px-2.5 py-1",
                "rounded bg-cta-muted text-cta text-xs",
                "font-semibold hover:bg-cta",
                "hover:text-white transition-colors",
              ].join(" ")}
            >
              <FilePlus size={12} />
              {t("newFile")}
            </button>
          )}
          {/* Summarize / copy / external editor work for
              PDFs too -- the server reads them and runs
              text extraction (pdftotext / pypdf). Edit
              stays gated on ``fileData`` since the
              textarea editor only makes sense for text
              formats. */}
          {!editing && selectedPath && (
            <>
              <button
                onClick={() => setSummaryOpen(true)}
                title={t("summaryButton")}
                aria-label={t("summaryButton")}
                className={[
                  "flex items-center gap-1 px-2.5",
                  "py-1 rounded text-stone-700",
                  "text-xs hover:text-cta",
                  "hover:bg-cta-muted",
                  "transition-colors",
                ].join(" ")}
              >
                <Sparkles size={12} />
                {t("summaryButton")}
              </button>
              <CopyKbFilePathButton path={selectedPath} />
              <OpenKbFileInEditorButton
                path={selectedPath}
              />
            </>
          )}
          {!editing &&
            selectedPath &&
            !fileLoading &&
            fileData && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className={[
                    "flex items-center gap-1 px-2.5",
                    "py-1 rounded text-stone-700",
                    "text-xs hover:text-stone-900",
                    "hover:bg-surface-raised",
                    "transition-colors",
                  ].join(" ")}
                >
                  <Pencil size={12} />
                  {t("editFile")}
                </button>
              </>
            )}
          <HelpButton
            title={t("knowledge")}
            doc={DOCS.knowledge}
            view="knowledge"
          />
        </>}
      />

      {/* New-file form */}
      {creating && (
        <NewFileForm
          onCreated={handleCreated}
          onClose={() => setCreating(false)}
        />
      )}

      {/* Body */}
      {showEditor ? (
        <EditorPanel
          file={resolveEditorFile()}
          initialContent={fileData!.content}
          onSaved={() => setEditing(false)}
          onClose={() => setEditing(false)}
          onDeleted={handleDeleted}
        />
      ) : (
        <div className="flex flex-1 min-h-0">
          <KnowledgeSidebar
            sidebarOpen={sidebarOpen}
            sidebarWidth={sidebarWidth}
            onSetSidebarOpen={setSidebarOpen}
            onSetSidebarWidth={setSidebarWidth}
            isSearching={isSearching}
            searchLoading={searchLoading}
            searchResults={searchResults}
            treeLoading={treeLoading}
            labels={labels}
            treeNodes={treeNodes}
            collapsedLabels={collapsedLabels}
            selectedPath={selectedPath}
            onSelectFile={selectFile}
            onClearSearch={() => {
              // Drop the free-text portion only; leave
              // chip filters intact.
              const { chips } = splitChipsAndFree(
                filterValue,
              );
              const head = chips
                .map(chipToRaw)
                .join(" ");
              setFilterValue(
                head ? head + " " : "",
              );
              setDebouncedQ("");
            }}
            onToggleLabel={handleToggleLabel}
            onToggleFolder={handleToggleFolder}
            onRename={handleRename}
            onMove={handleMove}
            onDelete={handleDeleteFile}
            onCreateFolder={handleCreateFolder}
            starred={starred}
            onToggleStar={toggleStar}
            showStarredOnly={showStarredOnly}
            showRecentOnly={showRecentOnly}
            recentFiles={recentFiles}
            onToggleTagFilter={toggleTagFilter}
          />

          {/* Right panel: file content */}
          {isPdf && selectedPath ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-5 pt-5 shrink-0">
                <MetadataCard
                  path={selectedPath}
                  fallbackTitle={
                    selectedPath
                      .split("/")
                      .pop()
                      ?.replace(/\.[^.]+$/, "") ?? ""
                  }
                  activeTagFilters={activeTagFilters}
                  onTagClick={toggleTagFilter}
                />
              </div>
              <iframe
                src={
                  `/api/knowledge/file/raw?path=${
                    encodeURIComponent(selectedPath)
                  }`
                }
                className="flex-1 w-full border-0"
                title={selectedPath}
              />
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto p-5">
            {fileLoading && (
              <p className="text-sm text-stone-500">
                {tc("loading")}
              </p>
            )}
            {!fileLoading &&
              !fileData &&
              !selectedPath && (
                <p className="text-sm text-stone-500">
                  {t("selectFile")}
                </p>
              )}
            {!fileLoading && fileData && selectedPath && (
              <>
                <MetadataCard
                  path={selectedPath}
                  fallbackTitle={
                    selectedPath
                      .split("/")
                      .pop()
                      ?.replace(/\.[^.]+$/, "") ?? ""
                  }
                  activeTagFilters={activeTagFilters}
                  onTagClick={toggleTagFilter}
                />
                {detectFileType(
                  selectedPath, fileData.content,
                ) === "code" ? (
                  <CodeViewer
                    content={fileData.content}
                    language={detectCodeLanguage(
                      selectedPath, fileData.content,
                    )}
                  />
                ) : (
                  <Markdown className="p-1">
                    {selectedPath.endsWith(".md")
                      ? stripFrontmatter(fileData.content)
                      : fileData.content}
                  </Markdown>
                )}
              </>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
