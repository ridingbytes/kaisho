/**
 * Shared toolbar for all panel views.
 *
 * Layout: left controls | ---- | right controls
 *
 * The ``left`` slot holds search inputs, period
 * selectors, and filter controls. The ``right`` slot
 * holds toggles, action buttons, and the help button.
 * Both slots are optional.
 */

interface Props {
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}

export function PanelToolbar({
  left,
  right,
  children,
}: Props) {
  return (
    <div
      className={[
        "flex flex-wrap items-center justify-between",
        "gap-3 px-5 py-2.5",
        "border-b border-border-subtle shrink-0",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        {left}
        {children}
      </div>
      <div className="flex items-center gap-3">
        {right}
      </div>
    </div>
  );
}
