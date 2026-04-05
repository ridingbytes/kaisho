import { Check, FilePlus, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  useDeleteKnowledgeFile,
  useKnowledgeFile,
  useKnowledgeSearch,
  useKnowledgeTree,
  useSaveKnowledgeFile,
} from "../../hooks/useKnowledge";
import { HelpButton } from "../common/HelpButton";
import { Markdown } from "../common/Markdown";
import { DOCS } from "../../docs/panelDocs";
import type { KnowledgeFile } from "../../types";

const inputCls =
  "bg-surface-raised border border-border rounded px-2 py-1 text-sm " +
  "text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent";

// ---------------------------------------------------------------------------
// New-file form
// ---------------------------------------------------------------------------

interface NewFileFormProps {
  onCreated: (file: KnowledgeFile) => void;
  onClose: () => void;
}

function NewFileForm({ onCreated, onClose }: NewFileFormProps) {
  const [label, setLabel] = useState<"wissen" | "research">("wissen");
  const [path, setPath] = useState("");
  const save = useSaveKnowledgeFile();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const p = path.trim().replace(/^\/+/, "");
    if (!p) return;
    const rel = p.endsWith(".md") ? p : `${p}.md`;
    save.mutate(
      { label, path: rel, content: `# ${rel.split("/").pop()?.replace(/\.md$/, "") ?? ""}\n` },
      {
        onSuccess: (file) => {
          onCreated(file);
          onClose();
        },
      }
    );
  }

  return (
    <form
      onSubmit={handleCreate}
      className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-border-subtle bg-surface-card/60 shrink-0"
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
          Library
        </label>
        <select
          className={`${inputCls} w-28`}
          value={label}
          onChange={(e) => setLabel(e.target.value as "wissen" | "research")}
        >
          <option value="wissen">wissen</option>
          <option value="research">research</option>
        </select>
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-40">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">
          Path *
        </label>
        <input
          autoFocus
          className={inputCls}
          placeholder="subfolder/article-name.md"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
      </div>
      <div className="flex gap-2 pb-0.5">
        <button
          type="submit"
          disabled={save.isPending || !path.trim()}
          className="px-3 py-1.5 rounded bg-accent text-white text-xs font-semibold disabled:opacity-40"
        >
          Create
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded bg-surface-raised text-slate-400 text-xs"
        >
          Cancel
        </button>
      </div>
      {save.isError && (
        <p className="w-full text-xs text-red-400">
          {(save.error as Error).message}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Editor panel
// ---------------------------------------------------------------------------

interface EditorPanelProps {
  file: KnowledgeFile;
  initialContent: string;
  onSaved: () => void;
  onClose: () => void;
  onDeleted: () => void;
}

function EditorPanel({
  file,
  initialContent,
  onSaved,
  onClose,
  onDeleted,
}: EditorPanelProps) {
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const save = useSaveKnowledgeFile();
  const remove = useDeleteKnowledgeFile();

  useEffect(() => {
    if (!preview) textareaRef.current?.focus();
  }, [preview]);

  function handleSave() {
    save.mutate(
      { label: file.label, path: file.path, content },
      { onSuccess: onSaved }
    );
  }

  function handleDelete() {
    remove.mutate(file.path, { onSuccess: onDeleted });
  }

  const dirty = content !== initialContent;

  return (
    <div className="flex flex-col h-full">
      {/* Editor toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle shrink-0">
        <span className="text-xs text-slate-500 font-mono truncate">
          {file.label}/{file.path}
        </span>
        {dirty && (
          <span className="text-[10px] text-amber-500 shrink-0">unsaved</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPreview((v) => !v)}
            className={[
              "px-2 py-0.5 rounded text-xs",
              preview
                ? "bg-accent-muted text-accent"
                : "text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            {preview ? "Edit" : "Preview"}
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1 rounded text-slate-600 hover:text-red-400"
              title="Delete file"
            >
              <Trash2 size={13} />
            </button>
          ) : (
            <>
              <span className="text-xs text-red-400">Delete?</span>
              <button
                onClick={handleDelete}
                disabled={remove.isPending}
                className="p-1 rounded text-red-400 hover:bg-red-500/10 disabled:opacity-40"
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="p-1 rounded text-slate-500 hover:text-slate-300"
              >
                <X size={13} />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-600 hover:text-slate-300"
            title="Discard changes"
          >
            <X size={13} />
          </button>
          <button
            onClick={handleSave}
            disabled={save.isPending || !dirty}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-white text-xs font-semibold disabled:opacity-40"
          >
            <Check size={11} />
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Content area */}
      {preview ? (
        <div className="flex-1 overflow-y-auto p-6">
          <Markdown className="p-1">{content}</Markdown>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={[
            "flex-1 resize-none p-4 font-mono text-sm leading-relaxed",
            "bg-surface-card text-slate-200 placeholder-slate-600",
            "focus:outline-none",
          ].join(" ")}
          placeholder="Write markdown here…"
          spellCheck={false}
        />
      )}

      {save.isError && (
        <p className="px-4 py-1 text-xs text-red-400 shrink-0">
          {(save.error as Error).message}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function KnowledgeView() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>("wissen");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: tree = [], isLoading: treeLoading } = useKnowledgeTree();
  const { data: fileData, isLoading: fileLoading } =
    useKnowledgeFile(selectedPath);
  const { data: searchResults = [], isLoading: searchLoading } =
    useKnowledgeSearch(debouncedQ);

  const isSearching = debouncedQ.length > 1;

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

  // When editing, show the editor full-pane (replacing the right panel)
  const showEditor =
    editing && fileData && selectedPath && !fileLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Knowledge
        </h1>
        {!editing && (
          <input
            type="text"
            placeholder="Search…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={[
              "ml-auto w-56 px-3 py-1 rounded-lg text-sm",
              "bg-surface-raised border border-border text-slate-200",
              "placeholder-slate-600 focus:outline-none focus:border-border-strong",
            ].join(" ")}
          />
        )}
        {!editing && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent-muted text-accent text-xs font-semibold hover:bg-accent hover:text-white transition-colors"
          >
            <FilePlus size={12} />
            New
          </button>
        )}
        {!editing && selectedPath && !fileLoading && fileData && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-slate-400 text-xs hover:text-slate-200 hover:bg-surface-raised transition-colors"
          >
            <Pencil size={12} />
            Edit
          </button>
        )}
        <HelpButton title="Knowledge" doc={DOCS.knowledge} view="knowledge" />
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
          file={
            tree.find((f) => f.path === selectedPath) ?? {
              path: selectedPath!,
              label: selectedLabel,
              name: selectedPath!.split("/").pop()?.replace(/\.md$/, "") ?? "",
              size: 0,
            }
          }
          initialContent={fileData!.content}
          onSaved={() => setEditing(false)}
          onClose={() => setEditing(false)}
          onDeleted={handleDeleted}
        />
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Left panel: file tree or search results */}
          <div className="w-64 shrink-0 border-r border-border-subtle overflow-y-auto py-2">
            {isSearching ? (
              searchLoading ? (
                <p className="text-xs text-slate-600 px-4 py-2">Loading…</p>
              ) : searchResults.length === 0 ? (
                <p className="text-xs text-slate-600 px-4 py-2">
                  No results.
                </p>
              ) : (
                searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      selectFile(r.path, r.label);
                      setSearchInput("");
                      setDebouncedQ("");
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-surface-raised transition-colors"
                  >
                    <p className="text-xs text-slate-300 truncate">
                      {r.label}/{r.path.split("/").pop()}
                    </p>
                    <p className="text-xs text-slate-500">
                      Line {r.line_number}
                    </p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {r.snippet}
                    </p>
                  </button>
                ))
              )
            ) : treeLoading ? (
              <p className="text-xs text-slate-600 px-4 py-2">Loading…</p>
            ) : (
              tree.map((f) => (
                <button
                  key={`${f.label}/${f.path}`}
                  onClick={() => selectFile(f.path, f.label)}
                  className={[
                    "w-full text-left px-4 py-1.5 hover:bg-surface-raised",
                    "transition-colors",
                    selectedPath === f.path
                      ? "bg-accent-muted text-accent"
                      : "text-slate-300",
                  ].join(" ")}
                >
                  <p className="text-xs truncate">
                    {f.label}/{f.name}
                  </p>
                </button>
              ))
            )}
          </div>

          {/* Right panel: file content */}
          <div className="flex-1 overflow-y-auto p-6">
            {fileLoading && (
              <p className="text-sm text-slate-600">Loading…</p>
            )}
            {!fileLoading && !fileData && !selectedPath && (
              <p className="text-sm text-slate-600">
                Select a file to view its contents.
              </p>
            )}
            {!fileLoading && fileData && (
              <Markdown className="p-1">{fileData.content}</Markdown>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
