import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Pencil, Save } from "lucide-react";
import { Markdown } from "../common/Markdown";
import {
  fetchProjectFileText,
  saveProjectFileText,
} from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { inputCls } from "../settings/styles";
import type { ProjectFile } from "../../types";

const IMAGE = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const TEXT = [
  "md", "markdown", "txt", "text", "json", "csv", "log",
  "yaml", "yml", "js", "ts", "tsx", "py", "sh", "html",
  "css", "xml", "toml", "ini",
];
const EDITABLE = ["md", "markdown", "txt", "text"];

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

interface Props {
  projectId: string;
  file: ProjectFile;
}

/** Inline viewer/editor for a project file. Renders images
 * and PDFs natively, markdown/text as text (with in-place
 * editing for markdown/plain text), and offers a download
 * for anything else. */
export function ProjectFileViewer({ projectId, file }: Props) {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation("common");
  const toast = useToast();
  const ext = extOf(file.display);
  const isImage = IMAGE.includes(ext);
  const isPdf = ext === "pdf";
  const isText = TEXT.includes(ext);
  const isMd = ext === "md" || ext === "markdown";
  const isEditable = EDITABLE.includes(ext);

  const [text, setText] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setEditing(false);
    setText(null);
    setError(false);
    setImgFailed(false);
    if (!isText) return;
    let live = true;
    fetchProjectFileText(projectId, file.name)
      .then((r) => live && setText(r.content))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [projectId, file.name, isText]);

  async function save() {
    setSaving(true);
    try {
      await saveProjectFileText(projectId, file.name, draft);
      setText(draft);
      setEditing(false);
      toast(t("fileSaved"), "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-sm font-medium truncate flex-1">
        {file.display}
      </span>
      {isEditable && !editing && (
        <button
          onClick={() => {
            setDraft(text ?? "");
            setEditing(true);
          }}
          className="inline-flex items-center gap-1 text-2xs text-cta hover:underline"
        >
          <Pencil size={12} /> {tc("edit")}
        </button>
      )}
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        className="p-1 rounded text-fg-muted hover:text-cta"
        title={t("download")}
      >
        <Download size={13} />
      </a>
    </div>
  );

  return (
    <div>
      {header}
      {isImage && !imgFailed ? (
        <img
          src={file.url}
          alt={file.display}
          onError={() => setImgFailed(true)}
          className="max-w-full rounded border border-border-subtle"
        />
      ) : isPdf ? (
        <iframe
          src={file.url}
          title={file.display}
          className="w-full h-[70vh] rounded border border-border-subtle"
        />
      ) : error ? (
        <div className="text-xs text-fg-muted">
          {t("fileLoadError")}{" "}
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="text-cta hover:underline"
          >
            {t("download")}
          </a>
        </div>
      ) : isText ? (
        editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={20}
              className={`${inputCls} w-full font-mono resize-y`}
            />
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs bg-cta text-white hover:bg-cta-hover disabled:opacity-40"
              >
                <Save size={12} /> {tc("save")}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1 rounded text-xs border border-border text-fg-muted"
              >
                {tc("cancel")}
              </button>
            </div>
          </div>
        ) : text === null ? (
          <div className="text-xs text-fg-muted">
            {t("loading")}
          </div>
        ) : isMd ? (
          <Markdown>{text}</Markdown>
        ) : (
          <pre className="text-xs whitespace-pre-wrap font-mono bg-surface-overlay rounded p-3 overflow-auto max-h-[70vh]">
            {text}
          </pre>
        )
      ) : (
        <a
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-cta hover:underline"
        >
          <Download size={14} /> {t("download")}
        </a>
      )}
    </div>
  );
}
