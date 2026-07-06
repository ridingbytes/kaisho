import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface CollapsibleSectionProps {
  /** Section label (e.g. "Tasks", "Time Entries"). */
  label: string;
  /** Optional count shown as a badge after the label. */
  count?: number;
  /** Optional leading icon. */
  icon?: React.ReactNode;
  /** Start expanded. Default: false. */
  defaultOpen?: boolean;
  /** Content rendered when expanded. */
  children: React.ReactNode;
  /** Extra CSS classes on the wrapper div. */
  className?: string;
}

/**
 * Collapsible section with a full-width header (optional
 * leading icon, label, count badge, trailing chevron). Used
 * for Tasks, Time Entries, Invoiced contracts, Archive
 * drawers, etc.
 */
export function CollapsibleSection({
  label,
  count,
  icon,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={className}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          "group/section w-full flex items-center gap-2",
          "py-1.5 text-2xs font-semibold uppercase",
          "tracking-wider text-fg-muted hover:text-fg",
          "transition-colors",
        ].join(" ")}
      >
        {icon && (
          <span className="text-fg-subtle shrink-0">
            {icon}
          </span>
        )}
        <span className="flex-1 text-left">{label}</span>
        {count !== undefined && (
          <span
            className={[
              "px-1.5 py-0.5 rounded-full tabular-nums",
              "bg-surface-overlay text-fg-muted",
              "text-2xs normal-case tracking-normal",
            ].join(" ")}
          >
            {count}
          </span>
        )}
        {open ? (
          <ChevronDown
            size={12}
            className="text-fg-subtle shrink-0"
          />
        ) : (
          <ChevronRight
            size={12}
            className="text-fg-subtle shrink-0"
          />
        )}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}
