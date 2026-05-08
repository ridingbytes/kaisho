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
  Eye, EyeOff, FilePlus, Pencil, Sparkles, Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  profileGet,
  profileSet,
} from "../../utils/profileStorage";
import { useTranslation } from "react-i18next";
import {
  useCreateKnowledgeFolder,
  useDeleteKnowledgeFile,
  useKnowledgeFile,
  useKnowledgeSearch,
  useKnowledgeTree,
  useMoveKnowledgeFile,
  useRenameKnowledgeFile,
} from "../../hooks/useKnowledge";
import { HelpButton } from "../common/HelpButton";
import { PanelToolbar } from "../common/PanelToolbar";
import { SearchInput } from "../common/SearchInput";
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
import { NewFileForm } from "./NewFileForm";
import { CopyKbFilePathButton } from "./CopyKbFilePathButton";
import { OpenKbFileInEditorButton } from "./OpenKbFileInEditorButton";
import { SummaryPopover } from "./SummaryPopover";
import {
  filterTree,
  filterVisibleFiles,
} from "./visibility";
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
export function KnowledgeView() {
  const { t } = useTranslation("knowledge");
  const { t: tc } = useTranslation("common");
  const [selectedPath, setSelectedPath] =
    useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] =
    useState<string>("knowledge");
  // Stage 1: filename filter (client-side).
  const [filenameFilter, setFilenameFilter] = useState("");
  // Stage 2: content search (server-side, scoped to the
  // currently-visible filtered subset).
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showStarredOnly, setShowStarredOnly] =
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

  // Active tag filters: AND semantics, persisted so the
  // user's narrowed view survives reloads.
  const TAG_FILTERS_KEY = "kaisho_kb_tag_filters";
  const [activeTagFilters, setActiveTagFilters] =
    useState<Set<string>>(() => {
      const raw = profileGet(TAG_FILTERS_KEY);
      if (!raw) return new Set();
      try {
        return new Set(JSON.parse(raw) as string[]);
      } catch {
        return new Set();
      }
    });
  useEffect(() => {
    profileSet(
      TAG_FILTERS_KEY,
      JSON.stringify([...activeTagFilters]),
    );
  }, [activeTagFilters]);

  function toggleTagFilter(tag: string) {
    setActiveTagFilters((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function clearTagFilters() {
    setActiveTagFilters(new Set());
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

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQ(searchInput), 300
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: tree = [], isLoading: treeLoading } =
    useKnowledgeTree();
  const isPdf = selectedPath?.endsWith(".pdf");
  const { data: fileData, isLoading: fileLoading } =
    useKnowledgeFile(isPdf ? null : selectedPath);

  // Visibility pipeline: hidden filter -> filename filter
  // -> content search (scoped to the filtered subset).
  const visibleTree = useMemo(
    () => filterVisibleFiles(tree, showHidden),
    [tree, showHidden],
  );
  const filteredTree = useMemo(
    () => filterTree(
      visibleTree, filenameFilter, activeTagFilters,
    ),
    [visibleTree, filenameFilter, activeTagFilters],
  );
  const filteredPaths = useMemo(
    () => filteredTree
      .filter((f) => f.kind === "file")
      .map((f) => f.path),
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
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder={t("searchInFiltered")}
            className="w-64"
          />
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
            onClick={() =>
              setShowStarredOnly((v) => !v)
            }
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
              setSearchInput("");
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
            filenameFilter={filenameFilter}
            onFilenameFilterChange={setFilenameFilter}
            activeTagFilters={activeTagFilters}
            onToggleTagFilter={toggleTagFilter}
            onClearTagFilters={clearTagFilters}
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
