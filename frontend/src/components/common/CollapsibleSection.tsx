import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface CollapsibleSectionProps {
  /** Section label (e.g. "Tasks", "Time Entries"). */
  label: string;
  /** Optional count shown after the label. */
  count?: number;
  /** Start expanded. Default: false. */
  defaultOpen?: boolean;
  /** Content rendered when expanded. */
  children: React.ReactNode;
  /** Extra CSS classes on the wrapper div. */
  className?: string;
}

/**
 * Collapsible section with a chevron toggle, label,
 * and optional count badge. Used for Tasks, Time
 * Entries, Invoiced contracts, Archive drawers, etc.
 */
export function CollapsibleSection({
  label,
  count,
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
          "flex items-center gap-1 text-[10px]",
          "font-semibold uppercase tracking-wider",
          "text-stone-500 hover:text-stone-700",
          "transition-colors",
        ].join(" ")}
      >
        {open ? (
          <ChevronDown size={10} />
        ) : (
          <ChevronRight size={10} />
        )}
        {label}
        {count !== undefined && ` (${count})`}
      </button>
      {open && (
        <div className="mt-1">{children}</div>
      )}
    </div>
  );
}
