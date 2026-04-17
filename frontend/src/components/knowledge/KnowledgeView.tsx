/**
 * @module KnowledgeView
 *
 * Top-level entry point for the Knowledge panel. Composes
 * the sidebar file tree, the editor panel, the new-file
 * form, and the read-only Markdown viewer. Owns all shared
 * state (selection, search, sidebar geometry) and delegates
 * rendering to focused sub-components.
 */

import { FilePlus, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [selectedPath, setSelectedPath] =
    useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] =
    useState<string>("knowledge");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);

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
  const { data: fileData, isLoading: fileLoading } =
    useKnowledgeFile(selectedPath);
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
      <div
        className={
          "flex items-center gap-4 px-6 py-3 " +
          "border-b border-border-subtle shrink-0"
        }
      >
        <h1
          className={
            "text-xs font-semibold tracking-wider " +
            "uppercase text-stone-700"
          }
        >
          Knowledge
        </h1>
        {!editing && (
          <input
            type="text"
            placeholder="Search…"
            value={searchInput}
            onChange={(e) =>
              setSearchInput(e.target.value)
            }
            className={[
              "ml-auto w-56 px-3 py-1 rounded-lg",
              "text-sm bg-surface-raised border",
              "border-border text-stone-900",
              "placeholder-stone-500",
              "focus:outline-none",
              "focus:border-border-strong",
            ].join(" ")}
          />
        )}
        {!editing && (
          <button
            onClick={() => setCreating((v) => !v)}
            className={
              "flex items-center gap-1 px-2.5 py-1 " +
              "rounded bg-cta-muted text-cta text-xs " +
              "font-semibold hover:bg-cta " +
              "hover:text-white transition-colors"
            }
          >
            <FilePlus size={12} />
            New
          </button>
        )}
        {!editing &&
          selectedPath &&
          !fileLoading &&
          fileData && (
            <button
              onClick={() => setEditing(true)}
              className={
                "flex items-center gap-1 px-2.5 " +
                "py-1 rounded text-stone-700 " +
                "text-xs hover:text-stone-900 " +
                "hover:bg-surface-raised " +
                "transition-colors"
              }
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
        <HelpButton
          title="Knowledge"
          doc={DOCS.knowledge}
          view="knowledge"
        />
      </div>

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
          />

          {/* Right panel: file content */}
          <div className="flex-1 overflow-y-auto p-6">
            {fileLoading && (
              <p className="text-sm text-stone-500">
                Loading…
              </p>
            )}
            {!fileLoading &&
              !fileData &&
              !selectedPath && (
                <p className="text-sm text-stone-500">
                  Select a file to view its contents.
                </p>
              )}
            {!fileLoading && fileData && (
              <Markdown className="p-1">
                {fileData.content}
              </Markdown>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
