interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex items-center w-8 h-4 rounded-full",
        "transition-colors shrink-0",
        "border border-border disabled:opacity-40",
        checked ? "bg-accent" : "bg-surface-raised",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white",
          "transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
