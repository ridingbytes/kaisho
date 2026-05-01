import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SquareArrowOutUpRight } from "lucide-react";
import {
  fetchPanelFilePath,
} from "../../api/client";
import { useExternalEditorSettings } from "../../hooks/useSettings";
import { useToast } from "../../context/ToastContext";

export type EditorPanelKind =
  | "tasks"
  | "clocks"
  | "notes"
  | "inbox"
  | "customers";

interface Props {
  kind: EditorPanelKind;
}

/** Toolbar icon that opens the file backing the current
 * panel in the user's external editor.
 *
 * Hidden unless:
 *   - running inside Tauri (window.__TAURI__ present),
 *   - external editor is enabled in settings,
 *   - the active backend exposes a single file for this
 *     panel kind (org backend; markdown / sql return 404).
 */
export function OpenInEditorButton(
  { kind }: Props,
): JSX.Element | null {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const { data: editor } = useExternalEditorSettings();
  const [path, setPath] = useState<string | null>(null);

  const isTauri =
    typeof window !== "undefined" &&
    "__TAURI__" in window;

  useEffect(() => {
    let cancelled = false;
    if (!isTauri || !editor?.enabled) {
      setPath(null);
      return;
    }
    fetchPanelFilePath(kind).then((res) => {
      if (cancelled) return;
      setPath(res?.path ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [isTauri, editor?.enabled, kind]);

  if (!isTauri) return null;
  if (!editor?.enabled) return null;
  if (!path) return null;

  async function open() {
    if (!path) return;
    if (!editor?.command) {
      toast(t("externalEditorNotConfigured"), "error");
      return;
    }
    const command = editor.command.split("{file}").join(
      path,
    );
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
      className={
        "p-1 rounded text-stone-500 " +
        "hover:text-cta hover:bg-stone-100 " +
        "transition-colors"
      }
    >
      <SquareArrowOutUpRight size={14} />
    </button>
  );
}
