import { useRef, useState } from "react";
import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookOpen, Paperclip, Trash2, Upload } from "lucide-react";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { ConfirmPopover } from "../common/ConfirmPopover";
import { ProjectFileViewer } from "../projects/ProjectFileViewer";
import {
  deleteProjectFile,
  fetchProjectFiles,
  uploadAttachment,
} from "../../api/client";
import { useKnowledgeTree } from "../../hooks/useKnowledge";
import { useSetView } from "../../context/ViewContext";
import { useToast } from "../../context/ToastContext";
import type { KnowledgeFile } from "../../types";

interface Props {
  customerName: string;
}

interface TreeNode extends KnowledgeFile {
  children?: TreeNode[];
}

/** Flatten the KB tree to the files linked to a customer. */
function kbFilesForCustomer(
  nodes: TreeNode[], customer: string,
): TreeNode[] {
  const out: TreeNode[] = [];
  const want = customer.toLowerCase();
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.kind === "folder") {
        walk(n.children ?? []);
      } else if ((n.customer || "").toLowerCase() === want) {
        out.push(n);
      }
    }
  };
  walk(nodes);
  return out;
}

/** Files attached to a customer (bucketed by name), shown
 * on the customer card like tasks/time. Drag and drop to
 * add, click to preview/edit. */
export function CustomerFilesSection({ customerName }: Props) {
  const { t } = useTranslation("customers");
  const { t: tp } = useTranslation("projects");
  const qc = useQueryClient();
  const toast = useToast();
  const bucket = customerName;
  const key = ["attachments", bucket];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => fetchProjectFiles(bucket),
  });
  const files = data?.files ?? [];
  const { data: tree = [] } = useKnowledgeTree();
  const setView = useSetView();
  const kbFiles = kbFilesForCustomer(
    tree as TreeNode[], customerName,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedFile =
    files.find((f) => f.name === selected) ?? null;

  async function upload(list: FileList) {
    try {
      for (const file of Array.from(list)) {
        await uploadAttachment(file, bucket);
      }
      await qc.invalidateQueries({ queryKey: key });
      toast(tp("filesUploaded"), "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function remove(name: string) {
    if (selected === name) setSelected(null);
    await deleteProjectFile(bucket, name);
    void qc.invalidateQueries({ queryKey: key });
  }

  return (
    <CollapsibleSection
      label={t("files")}
      count={files.length + kbFiles.length}
      icon={<Paperclip size={12} />}
    >
      <div className="ml-5 space-y-2">
        {kbFiles.length > 0 && (
          <ul className="divide-y divide-border-subtle">
            {kbFiles.map((f) => (
              <li key={f.path}>
                <button
                  onClick={() => setView("knowledge", f.path)}
                  className="flex items-center gap-2 w-full text-left py-1 px-1 rounded hover:bg-surface-overlay/40"
                >
                  <BookOpen
                    size={12}
                    className="text-cta shrink-0"
                  />
                  <span className="flex-1 min-w-0 text-xs truncate">
                    {f.title || f.label || f.name}
                  </span>
                  <span className="text-2xs text-fg-subtle shrink-0">
                    {t("knowledge", "KB")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div
          role="button"
          tabIndex={0}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) {
              void upload(e.dataTransfer.files);
            }
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={[
            "flex items-center justify-center gap-1.5 py-2",
            "rounded border border-dashed cursor-pointer",
            "text-2xs transition-colors",
            dragging
              ? "border-cta bg-cta-muted/30"
              : "border-border hover:border-cta/50 text-fg-muted",
          ].join(" ")}
        >
          <Upload size={12} /> {tp("dropFiles")}
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

        {files.length > 0 && (
          <ul className="divide-y divide-border-subtle">
            {files.map((f) => (
              <li
                key={f.name}
                className="flex items-center gap-2 py-1 group"
              >
                <button
                  onClick={() =>
                    setSelected(
                      selected === f.name ? null : f.name,
                    )
                  }
                  className={[
                    "flex-1 min-w-0 text-left text-xs truncate",
                    "px-1 py-0.5 rounded hover:bg-surface-overlay/40",
                    selected === f.name ? "text-cta" : "",
                  ].join(" ")}
                >
                  {f.display}
                </button>
                <ConfirmPopover onConfirm={() => remove(f.name)}>
                  <button className="p-1 rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-red-400">
                    <Trash2 size={12} />
                  </button>
                </ConfirmPopover>
              </li>
            ))}
          </ul>
        )}

        {selectedFile && (
          <div className="pt-1">
            <ProjectFileViewer
              projectId={bucket}
              file={selectedFile}
            />
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
