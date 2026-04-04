import { useState } from "react";
import { useCustomers } from "../../hooks/useCustomers";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Extra classes on the wrapper div — use for layout (flex-1, etc.) */
  className?: string;
  /** Classes on the inner input element */
  inputClassName?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

const MAX_UNFILITERED = 8;

export function CustomerAutocomplete({
  value,
  onChange,
  onKeyDown,
  className,
  inputClassName = "",
  placeholder = "Customer",
  autoFocus,
}: Props) {
  const { data: customers = [] } = useCustomers(true);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);

  const allNames = customers.map((c) => c.name);
  const filtered = value.trim()
    ? allNames.filter((n) =>
        n.toLowerCase().includes(value.toLowerCase())
      )
    : allNames.slice(0, MAX_UNFILITERED);

  function select(name: string) {
    onChange(name);
    setOpen(false);
    setHighlightIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (filtered.length > 0 && e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (filtered.length > 0 && e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === "Enter" && highlightIdx >= 0 && filtered[highlightIdx]) {
      e.preventDefault();
      select(filtered[highlightIdx]);
      return;
    }
    if (e.key === "Escape" && open) {
      setOpen(false);
      setHighlightIdx(-1);
      return;
    }
    onKeyDown?.(e);
  }

  return (
    <div className={`relative${className ? ` ${className}` : ""}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlightIdx(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className={`w-full ${inputClassName}`}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 max-h-48 overflow-y-auto rounded-md border border-border bg-surface-raised shadow-card-hover">
          {filtered.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(name);
                }}
                className={[
                  "w-full text-left px-2 py-1.5 text-xs truncate",
                  "transition-colors",
                  i === highlightIdx
                    ? "bg-accent-muted text-slate-200"
                    : "text-slate-300 hover:bg-surface-overlay",
                ].join(" ")}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
