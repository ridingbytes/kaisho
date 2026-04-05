interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      type="button"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer",
        "rounded-full border-2 border-transparent",
        "transition-colors duration-200 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-accent focus-visible:ring-offset-2",
        "focus-visible:ring-offset-surface-card",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        checked ? "bg-accent" : "bg-surface-overlay",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none inline-block h-4 w-4",
          "rounded-full bg-white shadow-sm",
          "ring-0 transition-transform duration-200 ease-in-out",
          checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
