import { ReactNode } from "react";
import { Toggle } from "./Toggle";

interface Props {
  /** Bound state. */
  checked: boolean;
  /** Called with the new value when the user toggles. */
  onChange: (checked: boolean) => void;
  /** Primary label rendered to the left of the switch. */
  label: ReactNode;
  /** Optional secondary line under the label. */
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Settings-row toggle: label + optional description on the
 * left, switch on the right. The same row layout is
 * hand-built in nearly every ``settings/*Tab.tsx``; use
 * this to keep them coherent.
 *
 *     <ToggleField
 *       checked={enabled}
 *       onChange={setEnabled}
 *       label={t("externalEditorEnable")}
 *       description={t("externalEditorEnableHint")}
 *     />
 */
export function ToggleField({
  checked, onChange, label, description, disabled,
  className = "",
}: Props) {
  return (
    <label
      className={[
        "flex items-start justify-between gap-4 py-2",
        "cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      ].filter(Boolean).join(" ")}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm text-fg-strong">
          {label}
        </div>
        {description && (
          <div className="text-xs text-fg-muted mt-0.5">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0 mt-0.5">
        <Toggle
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
      </div>
    </label>
  );
}
