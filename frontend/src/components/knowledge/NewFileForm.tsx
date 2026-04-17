/**
 * @module NewFileForm
 *
 * Inline form for creating a new knowledge file.
 * Lets the user pick a library label and enter a path,
 * then saves via the knowledge API.
 */

import { useState } from "react";
import { useSaveKnowledgeFile } from "../../hooks/useKnowledge";
import { inputCls } from "./knowledgeEditorUtils";
import type { KnowledgeFile } from "../../types";

/** Props for {@link NewFileForm}. */
export interface NewFileFormProps {
  /** Called after the file has been created on the server. */
  onCreated: (file: KnowledgeFile) => void;
  /** Called when the user cancels creation. */
  onClose: () => void;
}

/**
 * Compact form rendered below the toolbar that creates a
 * new knowledge file with a chosen library and path.
 */
export function NewFileForm({
  onCreated,
  onClose,
}: NewFileFormProps) {
  const [label, setLabel] = useState<
    "knowledge" | "research"
  >("knowledge");
  const [path, setPath] = useState("");
  const save = useSaveKnowledgeFile();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const p = path.trim().replace(/^\/+/, "");
    if (!p) return;
    const rel = p.endsWith(".md") ? p : `${p}.md`;
    save.mutate(
      {
        label,
        path: rel,
        content:
          `# ${rel.split("/").pop()?.replace(/\.md$/, "") ?? ""}\n`,
      },
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
      className={
        "flex flex-wrap items-end gap-3 px-4 py-3 " +
        "border-b border-border-subtle " +
        "bg-surface-card/60 shrink-0"
      }
    >
      <div className="flex flex-col gap-1">
        <label
          className={
            "text-[10px] text-stone-600 " +
            "uppercase tracking-wider"
          }
        >
          Library
        </label>
        <select
          className={`${inputCls} w-28`}
          value={label}
          onChange={(e) =>
            setLabel(
              e.target.value as "knowledge" | "research"
            )
          }
        >
          <option value="knowledge">wissen</option>
          <option value="research">research</option>
        </select>
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-40">
        <label
          className={
            "text-[10px] text-stone-600 " +
            "uppercase tracking-wider"
          }
        >
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
          className={
            "px-3 py-1.5 rounded bg-cta text-white " +
            "text-xs font-semibold disabled:opacity-40"
          }
        >
          Create
        </button>
        <button
          type="button"
          onClick={onClose}
          className={
            "px-3 py-1.5 rounded bg-surface-raised " +
            "text-stone-700 text-xs"
          }
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
