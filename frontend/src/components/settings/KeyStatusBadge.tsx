import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  /** True when the backend reports a saved value
   * (``<field>_set: true``). */
  configured: boolean;
  /** Current input value. We hide the badge as soon as the
   * user starts typing — they're entering a replacement
   * and the "configured" hint is no longer informative. */
  currentValue: string;
}

/** Small green badge that signals "an API key is already
 * saved" next to a password field. The field itself stays
 * empty (the backend masks secrets, never returns the raw
 * value), but without this badge users can't tell whether
 * the empty field means "nothing saved" or "saved, hidden".
 */
export function KeyStatusBadge(
  { configured, currentValue }: Props,
): JSX.Element | null {
  const { t } = useTranslation("settings");
  if (!configured) return null;
  if (currentValue.length > 0) return null;
  return (
    <span
      className={[
        "inline-flex items-center gap-1",
        "text-[10px] text-green-700",
        "bg-green-100 border border-green-200",
        "rounded px-1.5 py-0.5 ml-2",
      ].join(" ")}
      title={t("keyConfiguredHint")}
    >
      <Check size={10} />
      {t("keyConfigured")}
    </span>
  );
}
