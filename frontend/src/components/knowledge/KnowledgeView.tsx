import { useEffect, useState } from "react";
import {
  useKnowledgeFile,
  useKnowledgeSearch,
  useKnowledgeTree,
} from "../../hooks/useKnowledge";
import { Markdown } from "../common/Markdown";

export function KnowledgeView() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

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

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle shrink-0">
        <h1 className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Knowledge
        </h1>
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
      </div>

      {/* Body */}
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
                    setSelectedPath(r.path);
                    setSearchInput("");
                    setDebouncedQ("");
                  }}
                  className={[
                    "w-full text-left px-4 py-2 hover:bg-surface-raised",
                    "transition-colors",
                  ].join(" ")}
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
                key={f.path}
                onClick={() => setSelectedPath(f.path)}
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
    </div>
  );
}
