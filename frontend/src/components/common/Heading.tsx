import { ReactNode } from "react";

/** Semantic heading levels.
 *
 *  - ``eyebrow`` — small uppercase tracking label, sits
 *    above a section. The dominant "section heading"
 *    pattern in the codebase.
 *  - ``panel``   — top-of-panel title. Use once per
 *    panel.
 *  - ``section`` — second-tier heading inside a panel.
 *  - ``sub``     — third-tier; reserved for nested
 *    groupings.
 */
type Level = "eyebrow" | "panel" | "section" | "sub";

interface Props {
  children: ReactNode;
  level?: Level;
  className?: string;
  id?: string;
}

const LEVEL_TAG: Record<Level, "h2" | "h3" | "h4"> = {
  eyebrow: "h3",
  panel:   "h2",
  section: "h3",
  sub:     "h4",
};

const LEVEL_CLASSES: Record<Level, string> = {
  eyebrow:
    "text-xs font-semibold uppercase tracking-wider "
    + "text-fg-muted",
  panel:
    "text-base font-semibold text-fg-strong",
  section:
    "text-sm font-semibold text-fg-strong",
  sub:
    "text-xs font-semibold text-fg-strong",
};

/**
 * Single source of truth for in-panel headings.
 *
 *     <Heading level="eyebrow">Storage Backend</Heading>
 *     <Heading level="panel">Settings</Heading>
 *     <Heading level="section">External Editor</Heading>
 *
 * View-top titles still go through ``ViewHeader``; this
 * component covers the structure inside a view.
 */
export function Heading({
  children, level = "section", className = "", id,
}: Props) {
  const Tag = LEVEL_TAG[level];
  return (
    <Tag
      id={id}
      className={[
        LEVEL_CLASSES[level],
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </Tag>
  );
}
