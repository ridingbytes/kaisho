import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { deleteAiKey } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import type { AiSettings } from "../../types";
import { inputCls } from "./styles";

interface Props {
  /** ``ai`` field name, also used to build the
   * ``<field>_set`` / ``<field>_preview`` lookups. */
  field: keyof AiSettings;
  /** Localised label shown next to the input. */
  label: string;
  /** Localised placeholder for the empty / unconfigured
   * state (e.g. ``"sk-ant-..."``). */
  emptyPlaceholder: string;
  /** Snapshot of the saved settings (with masking
   * applied — exposes ``_set`` and ``_preview``). */
  saved: AiSettings | undefined;
  /** Current draft value held by the parent form. */
  value: string;
  /** Update the parent form's draft value. */
  onChange: (next: string) => void;
}

/** Password input + "configured" indicator + delete
 * button, used for every AI provider key. The backend
 * never returns the raw value, so we show a masked
 * preview (``••••XXXX``) when the key is saved and the
 * user has not started typing a replacement.
 */
export function SecretKeyField(props: Props): JSX.Element {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const qc = useQueryClient();
  const {
    field, label, emptyPlaceholder, saved, value, onChange,
  } = props;

  const setKey = `${field}_set` as keyof AiSettings;
  const previewKey = `${field}_preview` as keyof AiSettings;
  const isSaved = Boolean(saved?.[setKey]);
  const previewSuffix =
    (saved?.[previewKey] as string | undefined) || "";
  const isReplacing = value.length > 0;

  const placeholder = isSaved
    ? t("keyPlaceholderReplace")
    : emptyPlaceholder;

  async function handleDelete() {
    try {
      await deleteAiKey(field as string);
      onChange("");
      toast(t("keyCleared"), "success");
      void qc.invalidateQueries({
        queryKey: ["settings", "ai"],
      });
    } catch (err) {
      const message = (
        err as { message?: string }
      )?.message ?? "Failed";
      toast(message, "error");
    }
  }

  return (
    <label className="flex items-center gap-3">
      <span className="text-xs text-stone-700 w-32 shrink-0">
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
      {isSaved && !isReplacing && (
        <span
          className={[
            "inline-flex items-center gap-1",
            "text-[10px] font-mono text-green-700",
            "bg-green-100 border border-green-200",
            "rounded px-1.5 py-0.5 shrink-0",
          ].join(" ")}
          title={t("keyConfiguredHint")}
        >
          {previewSuffix
            ? `••••${previewSuffix}`
            : t("keyConfigured")}
        </span>
      )}
      {isSaved && (
        <button
          type="button"
          onClick={handleDelete}
          title={t("keyClearTitle")}
          className={[
            "p-1 rounded shrink-0",
            "text-stone-400 hover:text-red-500",
            "hover:bg-stone-100 transition-colors",
          ].join(" ")}
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}
