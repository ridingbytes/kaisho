import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Download, Trash2, Upload } from "lucide-react";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { StateMessage } from "../common/StateMessage";
import { uploadAttachment } from "../../api/client";
import {
  useDeleteProjectFile,
  useProjectFiles,
} from "../../hooks/useProjects";
import { useToast } from "../../context/ToastContext";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  projectId: string;
}

/** Drag-and-drop file store for a project. */
export function ProjectFilesPanel({ projectId }: Props) {
  const { t } = useTranslation("projects");
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useProjectFiles(projectId);
  const remove = useDeleteProjectFile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const files = data?.files ?? [];

  async function upload(list: FileList) {
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        await uploadAttachment(file, projectId);
      }
      await qc.invalidateQueries({
        queryKey: ["projects", "files", projectId],
      });
      toast(t("filesUploaded"), "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) {
      void upload(e.dataTransfer.files);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          "flex flex-col items-center justify-center gap-1",
          "rounded-lg border-2 border-dashed py-8 px-4",
          "cursor-pointer transition-colors text-center",
          dragging
            ? "border-cta bg-cta-muted/30"
            : "border-border hover:border-cta/50",
        ].join(" ")}
      >
        <Upload size={20} className="text-fg-muted" />
        <div className="text-sm text-fg">
          {uploading ? t("uploading") : t("dropFiles")}
        </div>
        <div className="text-2xs text-fg-muted">
          {t("dropFilesHint")}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              void upload(e.target.files);
            }
            e.target.value = "";
          }}
        />
      </div>

      {isLoading ? (
        <StateMessage kind="loading">
          {t("loading")}
        </StateMessage>
      ) : files.length === 0 ? (
        <div className="text-xs text-fg-muted">
          {t("noFiles")}
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex items-center gap-2 py-2 group"
            >
              <span className="flex-1 text-sm truncate">
                {f.display}
              </span>
              <span className="text-2xs text-fg-muted tabular-nums">
                {formatBytes(f.size)}
              </span>
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="p-1 rounded text-fg-muted hover:text-cta"
                title={t("download")}
              >
                <Download size={13} />
              </a>
              <ConfirmPopover
                onConfirm={() =>
                  remove.mutate({
                    projectId, storedName: f.name,
                  })
                }
              >
                <button className={[
                  "p-1 rounded text-fg-muted opacity-0",
                  "group-hover:opacity-100 hover:text-red-400",
                ].join(" ")}>
                  <Trash2 size={13} />
                </button>
              </ConfirmPopover>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
