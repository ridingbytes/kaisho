import { ReactNode } from "react";

/** Which Tailwind ``group/<name>`` variant the parent uses.
 *  Each entry must contain literal class strings so the
 *  Tailwind JIT picks them up. Add a new value here when
 *  introducing a new named group in the codebase. */
const GROUP_HOVER_CLASSES = {
  default:
    "group-hover:visible group-hover:pointer-events-auto",
  leaf:
    "group-hover/leaf:visible "
    + "group-hover/leaf:pointer-events-auto",
  folder:
    "group-hover/folder:visible "
    + "group-hover/folder:pointer-events-auto",
  label:
    "group-hover/label:visible "
    + "group-hover/label:pointer-events-auto",
  meta:
    "group-hover/meta:visible "
    + "group-hover/meta:pointer-events-auto",
} as const;

type GroupName = keyof typeof GROUP_HOVER_CLASSES;

interface Props {
  children: ReactNode;
  /** Extra classes (e.g. `gap-1`, `ml-auto`). */
  className?: string;
  /** Which parent ``group`` variant should trigger the
   *  reveal. Defaults to the unnamed ``group``. */
  group?: GroupName;
}

/**
 * Wrap a cluster of row-level action buttons (edit, delete,
 * etc.) that should only appear on hover **without** the
 * row jumping vertically as the mouse enters.
 *
 * The naive ``hidden group-hover:flex`` pattern removes the
 * actions from the layout flow, so the row's height shrinks
 * until you hover and then grows again -- creating an
 * annoying bounce as the mouse traverses a list. This
 * component uses ``invisible + pointer-events-none``: the
 * box keeps its space, only its paint is suppressed.
 *
 * Requires the parent row to be tagged ``group`` (or a
 * named variant -- pass the matching ``group-hover/...:``
 * variant via ``className`` when nesting).
 *
 * Example:
 *
 *     <div className="group flex items-center ...">
 *       <span>{label}</span>
 *       <HoverActions className="ml-auto gap-0.5">
 *         <button onClick={onEdit}><Pencil /></button>
 *         <button onClick={onDelete}><X /></button>
 *       </HoverActions>
 *     </div>
 */
export function HoverActions({
  children, className = "", group = "default",
}: Props) {
  return (
    <div
      className={
        "flex items-center shrink-0 invisible "
        + "pointer-events-none "
        + GROUP_HOVER_CLASSES[group] + " "
        + className
      }
    >
      {children}
    </div>
  );
}
