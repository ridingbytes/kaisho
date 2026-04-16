/**
 * Vertical drag handle for resizable table columns.
 * Absolute-positioned on the right edge of a
 * `position: relative` `<th>` cell.
 */

/** Props for the {@link ResizeHandle} component. */
export interface ResizeHandleProps {
  /** Mouse-down handler (wire to `startResize(index, e)`
   *  from the useResizableColumns hook). */
  onMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Renders a thin column divider on the right edge of a
 * table header cell with a wider invisible hit area for
 * dragging. The parent `<th>` must be `position: relative`
 * so the handle can absolutely position against it, and an
 * ancestor element (typically `<thead>`) must carry
 * `group/thead` so all handles fade in together on header
 * hover.
 *
 * At rest the divider is invisible. When any part of the
 * header row is hovered, all handles fade in at ~50%
 * opacity. The individual handle under the cursor pops to
 * full CTA colour, signalling the resize affordance.
 */
export function ResizeHandle({
  onMouseDown,
}: ResizeHandleProps) {
  return (
    <span
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      className={[
        "group/resize",
        "absolute top-0 right-0 h-full w-2",
        "flex justify-end items-stretch",
        "cursor-col-resize select-none",
      ].join(" ")}
      title="Drag to resize"
    >
      <span
        className={[
          "block h-full w-px",
          "bg-border-strong",
          "opacity-0",
          "group-hover/thead:opacity-50",
          "group-hover/resize:opacity-100",
          "group-hover/resize:w-0.5",
          "group-hover/resize:bg-cta",
          "transition-all duration-150",
        ].join(" ")}
      />
    </span>
  );
}
