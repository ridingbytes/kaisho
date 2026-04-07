import { relativeDate } from "../../utils/relativeDate";

/**
 * Display a date as relative text (e.g. "2 days ago")
 * with the full date visible on hover via title attr.
 */
export function RelDate({
  date,
  className = "",
}: {
  date: string;
  className?: string;
}) {
  if (!date) return null;
  const { label, full } = relativeDate(date);
  return (
    <span className={className} title={full}>
      {label}
    </span>
  );
}
