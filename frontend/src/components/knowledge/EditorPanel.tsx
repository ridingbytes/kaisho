/**
 * @module EditorPanel
 *
 * Full-height editor/preview panel for a single knowledge
 * file. Supports syntax-aware formatting toolbar, live
 * preview via Markdown, save, and delete.
 */

import { Check, Copy, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchKnowledgeAbsolutePath } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import {
  useDeleteKnowledgeFile,
  useSaveKnowledgeFile,
} from "../../hooks/useKnowledge";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { Markdown } from "../common/Markdown";
import { CodeViewer } from "./CodeViewer";
import {
  actionsForType,
  applySyntax,
  detectCodeLanguage,
  detectFileType,
  FILE_TYPE_COLORS,
} from "./knowledgeEditorUtils";
import type { KnowledgeFile } from "../../types";

/** Props for {@link EditorPanel}. */
export interface EditorPanelProps {
  /** The file being edited. */
  file: KnowledgeFile;
  /** Raw content loaded from the server. */
  initialContent: string;
  /** Called after a successful save. */
  onSaved: () => void;
  /** Called when the user closes the editor. */
  onClose: () => void;
  /** Called after the file is deleted. */
  onDeleted: () => void;
}

/**
 * Editor panel with a toolbar, optional Markdown preview,
 * syntax formatting buttons, and save/delete actions.
 */
export function EditorPanel({
  file,
  initialContent,
  onSaved,
  onClose,
  onDeleted,
}: EditorPanelProps) {
  const { t } = useTranslation("knowledge");
  const { t: tc } = useTranslation("common");
  const toast = useToast();
  const [content, setContent] = useState(initialContent);
  // Code files default to preview (read-with-highlighting)
  // since they're usually consulted, not edited inline.
  // Markup files default to edit so the user can start
  // typing immediately. Pass ``initialContent`` so
  // extensionless scripts get classified via shebang.
  const initialPreview = detectFileType(
    file.path, initialContent,
  ) === "code";
  const [preview, setPreview] = useState(initialPreview);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const save = useSaveKnowledgeFile();
  const remove = useDeleteKnowledgeFile();

  async function handleCopyPath() {
    try {
      const { path } = await fetchKnowledgeAbsolutePath(
        file.path,
      );
      await navigator.clipboard.writeText(path);
      toast(t("pathCopied"), "success");
    } catch (err) {
      toast(String(err), "error");
    }
  }

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
  const fileType = detectFileType(file.path, content);
  const syntaxActions = actionsForType(fileType);

  return (
    <div className="flex flex-col h-full">
      {/* Editor toolbar */}
      <div
        className={
          "flex items-center gap-2 px-4 py-2 " +
          "border-b border-border-subtle shrink-0"
        }
      >
        <span
          className={
            "text-xs text-stone-600 font-mono truncate"
          }
        >
          {file.label}/{file.path}
        </span>
        <button
          onClick={handleCopyPath}
          aria-label={t("copyPath")}
          title={t("copyPath")}
          className={
            "shrink-0 p-0.5 rounded text-stone-400 " +
            "hover:text-cta transition-colors"
          }
        >
          <Copy size={11} />
        </button>
        <span
          className={[
            "shrink-0 px-1.5 py-0.5 rounded text-[10px]",
            "font-semibold uppercase tracking-wider",
            FILE_TYPE_COLORS[fileType],
          ].join(" ")}
        >
          {fileType}
        </span>
        {dirty && (
          <span
            className={
              "text-[10px] text-amber-500 shrink-0"
            }
          >
            {t("unsaved")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPreview((v) => !v)}
            className={[
              "px-2 py-0.5 rounded text-xs",
              preview
                ? "bg-cta-muted text-cta"
                : "text-stone-600 hover:text-stone-900",
            ].join(" ")}
          >
            {preview ? t("editMode") : t("preview")}
          </button>
          <ConfirmPopover
            onConfirm={handleDelete}
            disabled={remove.isPending}
          >
            <button
              className={
                "p-1 rounded text-stone-500 " +
                "hover:text-red-400"
              }
              title={t("deleteFile")}
            >
              <Trash2 size={13} />
            </button>
          </ConfirmPopover>
          <button
            onClick={onClose}
            className={
              "p-1 rounded text-stone-500 " +
              "hover:text-stone-900"
            }
            title={t("discardChanges")}
          >
            <X size={13} />
          </button>
          <button
            onClick={handleSave}
            disabled={save.isPending || !dirty}
            className={
              "flex items-center gap-1 px-2.5 py-1 " +
              "rounded bg-cta text-white text-xs " +
              "font-semibold disabled:opacity-40"
            }
          >
            <Check size={11} />
            {save.isPending
              ? tc("saving")
              : tc("save")}
          </button>
        </div>
      </div>

      {/* Content area */}
      {fileType === "pdf" ? (
        <iframe
          src={
            `/api/knowledge/file/raw?path=${
              encodeURIComponent(file.path)
            }`
          }
          className="flex-1 w-full border-0"
          title={file.path}
        />
      ) : preview ? (
        <div className="flex-1 overflow-y-auto p-6">
          {fileType === "code" ? (
            <CodeViewer
              content={content}
              language={
                detectCodeLanguage(file.path, content)
              }
            />
          ) : (
            <Markdown className="p-1">
              {content}
            </Markdown>
          )}
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Syntax toolbar */}
          {syntaxActions.length > 0 && (
            <div
              className={
                "flex items-center gap-1 px-4 py-1.5 " +
                "border-b border-border-subtle " +
                "bg-surface-card/60 shrink-0"
              }
            >
              {syntaxActions.map((action) => (
                <button
                  key={action.title}
                  type="button"
                  title={action.title}
                  onClick={() => {
                    if (!textareaRef.current) return;
                    applySyntax(
                      textareaRef.current,
                      action,
                      content,
                      setContent
                    );
                  }}
                  className={
                    "px-2 py-0.5 rounded text-xs " +
                    "font-mono text-stone-700 " +
                    "hover:text-stone-900 " +
                    "hover:bg-surface-raised " +
                    "transition-colors"
                  }
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={[
              "flex-1 resize-none p-4 font-mono",
              "text-sm leading-relaxed",
              "bg-surface-card text-stone-900",
              "placeholder-stone-500",
              "focus:outline-none",
            ].join(" ")}
            placeholder={t("writeHere")}
            spellCheck={false}
          />
        </div>
      )}

      {save.isError && (
        <p
          className={
            "px-4 py-1 text-xs text-red-400 shrink-0"
          }
        >
          {(save.error as Error).message}
        </p>
      )}
    </div>
  );
}
