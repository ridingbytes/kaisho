import type { ReactNode } from "react";

/**
 * Consistent header bar for top-level views.
 *
 * Renders a flex row with a title, optional search,
 * a flexible spacer, and optional action buttons
 * (typically including a HelpButton).
 */

/** Props for the ViewHeader component. */
interface Props {
  /** View title shown as uppercase heading. */
  title: string;
  /** Optional search or filter element. */
  search?: ReactNode;
  /** Action buttons (Add, HelpButton, etc.). */
  children?: ReactNode;
}

const headerCls = [
  "flex items-center gap-3 px-6 py-3",
  "border-b border-border-subtle shrink-0",
  "flex-wrap",
].join(" ");

export function ViewHeader({
  title,
  search,
  children,
}: Props) {
  return (
    <div className={headerCls}>
      <h1 className="text-xs font-semibold tracking-wider uppercase text-stone-700">
        {title}
      </h1>
      {search}
      <div className="flex-1" />
      {children}
    </div>
  );
}
