import { X } from "lucide-react";
import { useRef } from "react";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  inputClassName,
  autoFocus,
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      onChange("");
      ref.current?.blur();
    }
  }

  return (
    <div className={`relative flex items-center ${className ?? ""}`}>
      <input
        ref={ref}
        type="text"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={inputClassName}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          tabIndex={-1}
          className="absolute right-1.5 text-stone-400 hover:text-stone-700 transition-colors"
          aria-label="Clear search"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}
