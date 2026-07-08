/**
 * NotesBubble -- a single, uniform indicator for the notes
 * or description attached to a clock entry or task.
 *
 * Shows a small icon only when there is content, so you can
 * tell at a glance that an entry carries notes. Clicking it
 * opens the shared {@link MarkdownDialog} (Preview / Write
 * tabs), which edits and saves when an ``onSave`` handler is
 * given and stays read-only otherwise.
 *
 * Two icon variants keep the meaning distinct while sharing
 * the same behaviour:
 *  - ``notes`` -- a speech bubble, for free-form notes.
 *  - ``description`` -- lines of text, for a task body.
 */
import { useState } from "react";
import { AlignLeft, MessageSquare } from "lucide-react";
import { MarkdownDialog } from "./MarkdownDialog";

interface Props {
  /** The markdown content. The bubble hides when empty. */
  value: string;
  /** Dialog heading. */
  title: string;
  /** Bucket id for drag-dropped / pasted attachments. */
  bucketId: string;
  /** Persist an edit. Omit for a read-only viewer. */
  onSave?: (md: string) => void;
  /** Disables the save button while a write is in flight. */
  saving?: boolean;
  /** Which icon to render. */
  icon?: "notes" | "description";
  /** Icon size in px. */
  iconSize?: number;
  /** Optional text label rendered next to the icon. */
  label?: string;
}

export function NotesBubble({
  value,
  title,
  bucketId,
  onSave,
  saving,
  icon = "notes",
  iconSize = 11,
  label,
}: Props) {
  const [open, setOpen] = useState(false);
  if (!value || !value.trim()) return null;

  const Icon = icon === "description" ? AlignLeft : MessageSquare;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        onPointerDown={(e) => e.stopPropagation()}
        title={title}
        className={[
          "inline-flex items-center gap-1 shrink-0",
          "p-0.5 rounded text-fg-muted",
          "hover:text-fg-strong transition-colors",
        ].join(" ")}
      >
        <Icon size={iconSize} />
        {label && <span className="text-2xs">{label}</span>}
      </button>

      {open && (
        <MarkdownDialog
          title={title}
          value={value}
          bucketId={bucketId}
          saving={saving}
          readOnly={!onSave}
          onSave={(md) => {
            onSave?.(md);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
