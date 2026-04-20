import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface EditFooterProps {
  onSave: () => void;
  onCancel: () => void;
  isPending?: boolean;
  /** Show keyboard shortcut hint. Default: true. */
  showHint?: boolean;
}

/**
 * Save/cancel footer for inline edit forms.
 * Shows ⌘↵ hint, cancel (X), and save (✓) buttons.
 */
export function EditFooter({
  onSave,
  onCancel,
  isPending,
  showHint = true,
}: EditFooterProps) {
  const { t: tc } = useTranslation("common");
  return (
    <div className="flex gap-1 justify-end items-center mt-1">
      {showHint && (
        <span className="text-[9px] text-stone-400 mr-auto">
          {tc("cmdSave")}
        </span>
      )}
      <button
        type="button"
        onClick={onCancel}
        className={[
          "p-1 rounded text-stone-500",
          "hover:text-stone-900",
        ].join(" ")}
      >
        <X size={11} />
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={isPending}
        className={[
          "p-1 rounded text-cta",
          "hover:bg-cta-muted",
          "disabled:opacity-40",
        ].join(" ")}
      >
        <Check size={11} />
      </button>
    </div>
  );
}
