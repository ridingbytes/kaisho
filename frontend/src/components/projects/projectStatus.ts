/** Shared project status metadata. */
export const PROJECT_STATUSES = [
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Tailwind classes for a status pill, by status. */
export function statusClasses(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-500/10 text-emerald-600";
    case "ON_HOLD":
      return "bg-amber-500/10 text-amber-600";
    case "COMPLETED":
      return "bg-cta-muted text-cta";
    default: // ARCHIVED
      return "bg-surface-overlay text-fg-muted";
  }
}

/** Fraction of milestones done (0..1), or null if none. */
export function milestoneProgress(
  milestones: { done: boolean }[],
): number | null {
  if (!milestones.length) return null;
  const done = milestones.filter((m) => m.done).length;
  return done / milestones.length;
}
