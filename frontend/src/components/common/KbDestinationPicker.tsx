import { useMemo, useState, useRef, useEffect } from "react";
import { useKbSources } from "../../hooks/useSettings";
import { useKnowledgeTree } from "../../hooks/useKnowledge";

export interface KbDestination {
  sourceLabel: string;
  folder: string;
  filename: string;
}

interface Props {
  initialFilename: string;
  onSubmit: (dest: KbDestination) => void;
  onCancel: () => void;
  busy?: boolean;
  fieldCls?: string;
}

/** Source + folder + filename picker for "move to KB" flows.
 * Used by both inbox and notes. The folder input has an
 * autocomplete drawn from existing folders in the selected
 * source. */
export function KbDestinationPicker({
  initialFilename,
  onSubmit,
  onCancel,
  busy = false,
  fieldCls = "h-7 px-2 text-xs rounded-md bg-surface-raised border border-border",
}: Props) {
  const { data: sources = [] } = useKbSources();
  // Force a fresh fetch when the picker mounts so newly
  // created folders show up without waiting for the 60s
  // staleTime to expire.
  const { data: tree = [] } = useKnowledgeTree({
    refetchOnMount: "always",
  });

  const [sourceLabel, setSourceLabel] = useState("");
  const [folder, setFolder] = useState("");
  const [filename, setFilename] = useState(initialFilename);
  const [showFolders, setShowFolders] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sourceLabel && sources.length > 0) {
      setSourceLabel(sources[0].label);
    }
  }, [sources, sourceLabel]);

  const folderOptions = useMemo(() => {
    if (!sourceLabel) return [] as string[];
    const folders = new Set<string>();
    for (const f of tree) {
      if (f.label !== sourceLabel) continue;
      const parts = f.path.split("/");
      if (f.kind === "folder") {
        folders.add(f.path);
      } else if (parts.length > 1) {
        parts.pop();
        let acc = "";
        for (const seg of parts) {
          acc = acc ? `${acc}/${seg}` : seg;
          folders.add(acc);
        }
      }
    }
    return Array.from(folders).sort();
  }, [tree, sourceLabel]);

  const filteredFolders = useMemo(() => {
    const q = folder.trim().toLowerCase();
    if (!q) return folderOptions;
    return folderOptions.filter(
      (p) => p.toLowerCase().includes(q),
    );
  }, [folderOptions, folder]);

  const isNewFolder = useMemo(() => {
    const q = folder.trim();
    return q.length > 0 && !folderOptions.includes(q);
  }, [folderOptions, folder]);

  function submit() {
    if (!sourceLabel || !filename.trim()) return;
    onSubmit({
      sourceLabel,
      folder: folder.trim(),
      filename: filename.trim(),
    });
  }

  const canSubmit =
    !busy && !!sourceLabel && filename.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          value={sourceLabel}
          onChange={(e) => {
            setSourceLabel(e.target.value);
            setFolder("");
          }}
          className={`${fieldCls} w-32`}
          disabled={sources.length <= 1}
        >
          {sources.map((s) => (
            <option key={s.label} value={s.label}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="relative flex-1 min-w-0">
          <input
            ref={folderInputRef}
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            onFocus={() => setShowFolders(true)}
            onBlur={() =>
              setTimeout(() => setShowFolders(false), 150)
            }
            placeholder="folder (optional)"
            className={`${fieldCls} w-full`}
          />
          {showFolders &&
            (filteredFolders.length > 0 || isNewFolder) && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-48 overflow-y-auto rounded-md bg-surface-overlay border border-border shadow-lg">
              {filteredFolders.map((f) => (
                <button
                  key={f}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setFolder(f);
                    setShowFolders(false);
                    folderInputRef.current?.focus();
                  }}
                  className="block w-full text-left px-2 py-1 text-xs hover:bg-surface-raised"
                >
                  {f}
                </button>
              ))}
              {isNewFolder && (
                <div className="block w-full text-left px-2 py-1 text-[11px] text-stone-500 border-t border-border italic">
                  Create new folder: {folder.trim()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          autoFocus
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="filename.md"
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className={`${fieldCls} flex-1`}
        />
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="px-2 py-1 rounded-md text-xs font-semibold bg-cta text-white disabled:opacity-40"
        >
          {busy ? "…" : "Move"}
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 rounded-md text-xs text-stone-600 hover:text-stone-900"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
