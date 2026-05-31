import { ReactNode } from "react";
import {
  AlertCircle,
  Inbox,
  Loader2,
} from "lucide-react";

type Kind = "loading" | "empty" | "error";

interface Props {
  /** What the message represents — picks default icon. */
  kind?: Kind;
  /** Primary message line. */
  children: ReactNode;
  /** Optional secondary line under the message. */
  description?: ReactNode;
  /** Optional CTA rendered below the description. Usually
   *  a ``<Button>``. */
  action?: ReactNode;
  /** Override the default icon for the kind. Pass
   *  ``null`` to suppress the icon entirely. */
  icon?: ReactNode | null;
  /** Tighter spacing variant for compact panels (kanban
   *  columns, sidebar lists). */
  compact?: boolean;
  className?: string;
}

const DEFAULT_ICONS: Record<Kind, ReactNode> = {
  loading: <Loader2 size={20} className="animate-spin" />,
  empty: <Inbox size={20} />,
  error: <AlertCircle size={20} />,
};

const KIND_TONE: Record<Kind, string> = {
  loading: "text-fg-muted",
  empty: "text-fg-muted",
  error: "text-danger",
};

/**
 * Shared empty / loading / error state.
 *
 *     <StateMessage kind="loading">Loading entries...</StateMessage>
 *     <StateMessage kind="empty">No matching tasks</StateMessage>
 *     <StateMessage kind="error" description={String(err)}>
 *       Could not load
 *     </StateMessage>
 */
export function StateMessage({
  kind = "empty",
  children,
  description,
  action,
  icon,
  compact,
  className = "",
}: Props) {
  const resolvedIcon =
    icon === undefined ? DEFAULT_ICONS[kind] : icon;
  return (
    <div
      className={[
        "flex flex-col items-center justify-center",
        compact
          ? "py-3 gap-1.5"
          : "py-6 gap-2",
        "text-center",
        KIND_TONE[kind],
        className,
      ].filter(Boolean).join(" ")}
      role={kind === "error" ? "alert" : undefined}
    >
      {resolvedIcon && (
        <span className="text-fg-subtle">{resolvedIcon}</span>
      )}
      <p className="text-sm">{children}</p>
      {description && (
        <p className="text-xs text-fg-subtle max-w-xs">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
