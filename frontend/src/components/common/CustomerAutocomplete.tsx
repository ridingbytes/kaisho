import { useState } from "react";
import { useCustomers, useCreateCustomer } from "../../hooks/useCustomers";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

const MAX_UNFILTERED = 8;

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
  const createCustomer = useCreateCustomer();
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);

  const allNames = customers.map((c) => c.name);
  const trimmed = value.trim();
  const filtered = trimmed
    ? allNames.filter((n) =>
        n.toLowerCase().includes(trimmed.toLowerCase())
      )
    : allNames.slice(0, MAX_UNFILTERED);

  const exactMatch = allNames.some(
    (n) => n.toLowerCase() === trimmed.toLowerCase()
  );
  const showCreate = trimmed.length > 0 && !exactMatch;

  function select(name: string) {
    onChange(name);
    setOpen(false);
    setHighlightIdx(-1);
  }

  function handleCreate() {
    createCustomer.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          onChange(trimmed);
          setOpen(false);
        },
      }
    );
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>
  ) {
    const total = filtered.length + (showCreate ? 1 : 0);
    if (total > 0 && e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, total - 1));
      return;
    }
    if (total > 0 && e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      if (highlightIdx < filtered.length) {
        select(filtered[highlightIdx]);
      } else if (showCreate) {
        handleCreate();
      }
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
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className={`w-full ${inputClassName}`}
      />
      {open && (filtered.length > 0 || showCreate) && (
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
                    ? "bg-cta-muted text-stone-900"
                    : "text-stone-800 hover:bg-surface-overlay",
                ].join(" ")}
              >
                {name}
              </button>
            </li>
          ))}
          {showCreate && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
                className={[
                  "w-full text-left px-2 py-1.5 text-xs",
                  "transition-colors border-t border-border-subtle",
                  highlightIdx === filtered.length
                    ? "bg-cta-muted text-cta"
                    : "text-cta hover:bg-surface-overlay",
                ].join(" ")}
              >
                + Create &quot;{trimmed}&quot;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
