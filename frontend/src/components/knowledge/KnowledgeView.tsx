/**
 * @module KnowledgeView
 *
 * Top-level entry point for the Knowledge panel. Composes
 * the sidebar file tree, the editor panel, the new-file
 * form, and the read-only Markdown viewer. Owns all shared
 * state (selection, search, sidebar geometry) and delegates
 * rendering to focused sub-components.
 */

import { FilePlus, Pencil, Star } from "lucide-react";
import { useEffect, useState } from "react";
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
import { EditorPanel } from "./EditorPanel";
import { KnowledgeSidebar } from "./KnowledgeSidebar";
import { NewFileForm } from "./NewFileForm";
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
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showStarredOnly, setShowStarredOnly] =
    useState(false);

  // Starred files (localStorage)
  const STARS_KEY = "kaisho_kb_stars";
  const [starred, setStarred] = useState<Set<string>>(
    () => {
      const raw = localStorage.getItem(STARS_KEY);
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
      localStorage.setItem(
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
  const {
    data: searchResults = [],
    isLoading: searchLoading,
  } = useKnowledgeSearch(debouncedQ);

  const isSearching = debouncedQ.length > 1;

  // Rebuild tree when files change
  useEffect(() => {
    if (!tree.length) return;
    setTreeNodes((prev) => {
      const fresh = buildTree(tree);
      const merged: Record<string, TreeNode[]> = {};
      for (const label of Object.keys(fresh)) {
        merged[label] = preserveExpanded(
          fresh[label], prev[label] ?? []
        );
      }
      return merged;
    });
  }, [tree]);

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

  const labels = Object.keys(treeNodes).sort();

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
      {/* Toolbar */}
      <PanelToolbar
        left={!editing ? (<>
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder={t("searchPlaceholder")}
            className="w-48"
          />
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
          {!editing &&
            selectedPath &&
            !fileLoading &&
            fileData && (
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
          />

          {/* Right panel: file content */}
          {isPdf && selectedPath ? (
            <iframe
              src={
                `/api/knowledge/file/raw?path=${
                  encodeURIComponent(selectedPath)
                }`
              }
              className="flex-1 w-full border-0"
              title={selectedPath}
            />
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
            {!fileLoading && fileData && (
              <Markdown className="p-1">
                {fileData.content}
              </Markdown>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
