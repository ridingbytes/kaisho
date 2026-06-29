/**
 * Shared drag/drop/paste file-upload behaviour for any
 * markdown textarea.
 *
 * Usage:
 *
 *   const ta = useRef<HTMLTextAreaElement | null>(null);
 *   const drop = useFileDropOnTextarea({
 *     value, onChange: setValue, bucketId, textareaRef: ta,
 *   });
 *   <textarea ref={ta} value={value}
 *     onChange={(e) => setValue(e.target.value)}
 *     onDrop={drop.onDrop}
 *     onDragOver={drop.onDragOver}
 *     onPaste={drop.onPaste} />
 *   {drop.uploading > 0 && <span>…</span>}
 *
 * The hook owns: caret-aware insert (uses the textarea's
 * own selection), image-vs-link detection, upload counter,
 * error state. SVG is intentionally **not** treated as an
 * embeddable image because the attachments router forces
 * SVG to download (XSS guard) — embedding via ``![]`` would
 * render as a broken image.
 *
 * ``bucketId`` is the parent entity id used to namespace the
 * uploaded file on disk. Empty string is fine — it falls
 * back to the ``_misc`` bucket on the server.
 */
import { useState } from "react";
import type { RefObject } from "react";

import { uploadAttachment } from "../api/client";

const EMBEDDABLE_IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

interface UseFileDropOnTextareaOpts {
  /** Current textarea value. */
  value: string;
  /** Setter called with the new value after insert. */
  onChange: (next: string) => void;
  /** Parent entity id (task_id, note_id, …). Empty
   *  string buckets the file under ``_misc``. */
  bucketId: string;
  /** Ref to the textarea so we can read the caret and
   *  restore focus after insert. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export interface FileDropHandlers {
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  /** Number of uploads currently in flight. */
  uploading: number;
  /** Last upload error, cleared on next upload start. */
  error: string | null;
}

function isEmbeddableImage(file: File, name: string): boolean {
  // MIME ``image/svg+xml`` is excluded because SVG can
  // carry script; the server forces it to download so
  // embedding inline would render as a broken image.
  if (file.type.startsWith("image/")
    && file.type !== "image/svg+xml") {
    return true;
  }
  return EMBEDDABLE_IMAGE_EXT.test(name);
}

export function useFileDropOnTextarea(
  opts: UseFileDropOnTextareaOpts,
): FileDropHandlers {
  const { value, onChange, bucketId, textareaRef } = opts;
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function insert(snippet: string) {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(
        value ? `${value}\n${snippet}\n` : `${snippet}\n`,
      );
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const needsLeadingNl = before && !before.endsWith("\n");
    const wrapped = (needsLeadingNl ? "\n" : "")
      + snippet + "\n";
    onChange(before + wrapped + after);
    const caret = (before + wrapped).length;
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (t) {
        t.selectionStart = caret;
        t.selectionEnd = caret;
        t.focus();
      }
    });
  }

  async function uploadOne(file: File) {
    setUploading((n) => n + 1);
    setError(null);
    try {
      const res = await uploadAttachment(file, bucketId);
      const snippet = isEmbeddableImage(file, res.name)
        ? `![${res.name}](${res.url})`
        : `[${res.name}](${res.url})`;
      insert(snippet);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setUploading((n) => n - 1);
    }
  }

  function onDrop(e: React.DragEvent) {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    e.stopPropagation();
    Array.from(e.dataTransfer.files).forEach(uploadOne);
  }

  function onDragOver(e: React.DragEvent) {
    // Required to make the textarea a valid drop target —
    // the default ``dragover`` blocks ``drop``.
    e.preventDefault();
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = e.clipboardData?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    Array.from(files).forEach(uploadOne);
  }

  return { onDrop, onDragOver, onPaste, uploading, error };
}
