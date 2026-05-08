/**
 * Toolbar button that copies a KB file's absolute
 * filesystem path to the clipboard. Useful when the user
 * wants to reference a script outside the KB (paste into
 * a chat, run from a terminal, etc.).
 *
 * Resolves the relative path through the same
 * ``/knowledge/file/path`` endpoint that powers the
 * external-editor button.
 */
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fetchKnowledgeAbsolutePath } from "../../api/client";
import { useToast } from "../../context/ToastContext";

interface Props {
  /** KB-relative path of the file to copy. */
  path: string;
}

export function CopyKbFilePathButton(
  { path }: Props,
): JSX.Element {
  const { t } = useTranslation("knowledge");
  const toast = useToast();

  async function copy() {
    try {
      const res = await fetchKnowledgeAbsolutePath(path);
      await navigator.clipboard.writeText(res.path);
      toast(t("pathCopied"), "success");
    } catch (err) {
      toast(String(err), "error");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={t("copyPath")}
      aria-label={t("copyPath")}
      className={
        "flex items-center gap-1 px-2.5 py-1 rounded "
        + "text-stone-700 text-xs hover:text-stone-900 "
        + "hover:bg-surface-raised transition-colors"
      }
    >
      <Copy size={12} />
    </button>
  );
}
