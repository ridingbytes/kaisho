/**
 * Toolbar button that opens a single KB file in the user's
 * configured external editor. Mirrors
 * ``components/common/OpenInEditorButton`` but takes a
 * KB-relative path rather than a panel kind, since KB
 * files map 1:1 to filesystem files in any backend.
 *
 * Hidden unless:
 *   - running inside Tauri,
 *   - external editor is enabled in settings,
 *   - the KB-relative path resolves under a configured
 *     KB source (404 otherwise).
 */
import { SquareArrowOutUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import { useExternalEditorSettings }
  from "../../hooks/useSettings";
import { fetchKnowledgeAbsolutePath }
  from "../../api/client";

interface Props {
  /** KB-relative path of the file to open. */
  path: string;
}

export function OpenKbFileInEditorButton(
  { path }: Props,
): JSX.Element | null {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const { data: editor } = useExternalEditorSettings();

  const isTauri =
    typeof window !== "undefined"
    && "__TAURI__" in window;

  if (!isTauri) return null;
  if (!editor?.enabled) return null;

  async function open() {
    if (!editor?.command) {
      toast(t("externalEditorNotConfigured"), "error");
      return;
    }
    let absolute: string;
    try {
      const res = await fetchKnowledgeAbsolutePath(path);
      absolute = res.path;
    } catch (err) {
      toast(String(err), "error");
      return;
    }
    const command =
      editor.command.split("{file}").join(absolute);
    try {
      const { invoke } = await import(
        "@tauri-apps/api/core"
      );
      await invoke("open_in_editor", { command });
    } catch (err) {
      toast(String(err), "error");
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      title={t("openInEditor")}
      aria-label={t("openInEditor")}
      className={
        "flex items-center gap-1 px-2.5 py-1 rounded "
        + "text-stone-700 text-xs hover:text-stone-900 "
        + "hover:bg-surface-raised transition-colors"
      }
    >
      <SquareArrowOutUpRight size={12} />
    </button>
  );
}
